import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addArgument, addMember, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";
import { addSpace, addSpaceMember } from "../support/space.ts";

// Boards in a space (G-04, G-05, H-02, M-07, M3d-18; plans/architecture.md
// §2's deletion table and §7, point 4, and "Who sees what about people").
// A board shared with everyone in its space lets each member in at the
// board's role for the space, without an invitation and without recording
// them as a member, so leaving or being removed from the space ends it at
// once, unless they have a board role of their own. Each member finds the
// board in their list; no one else does, and no one else learns it is there
// from the list, a profile, or statistics. A board's space name is sent only
// to the space's members. When a space board's Owner deletes their account,
// the board passes to the space's Owner, else its longest-standing Admin.

const db = useTestDatabase({ migrated: true });
const api = useApi(db, { seed: 1820 });
const ids = createSeededIds(1821);

const username = async (account: string) => (await db.client.query("select username from account where id = $1", [account])).rows[0].username as string;
const membersOf = async (board: string) => (await db.client.query("select account_id, role, joined_via from board_member where board_id = $1 order by account_id", [board])).rows;
const listed = async (as: string) => ((await api.get("/api/boards", { as })).body.boards as { id: string; role: string }[]).map(({ id, role }) => ({ id, role }));
const share = (board: string, as: string, general: string, linkRole = "voter") => api.put(`/api/boards/${board}/access`, { as, body: { general, linkRole } });

interface World {
  b: SeededBoard;
  space: string;
  /** Pod 6's Owner, an Admin, and a Member; none of them on the board. Ana, the board's Owner, is a Member too. */
  olu: string;
  ada: string;
  mel: string;
  /** Signed in, with a confirmed email, in no space and on no board. */
  sam: string;
}

/** Ana's board, open only to invited people, put in Pod 6 and shared with everyone in it as Voter. */
async function world({ shared = true }: { shared?: boolean } = {}): Promise<World> {
  const b = await seedBoard(db.client, ids);
  const olu = await addAccount(db.client, ids, "olu", { confirmed: true });
  const space = await addSpace(db.client, ids, olu, { name: "POD 6", about: "Building with AI" });
  const ada = await addAccount(db.client, ids, "ada", { confirmed: true });
  const mel = await addAccount(db.client, ids, "mel", { confirmed: true });
  await addSpaceMember(db.client, space, ada, "admin", "2026-11-16T12:01:00Z");
  await addSpaceMember(db.client, space, mel, "member", "2026-11-16T12:02:00Z");
  await addSpaceMember(db.client, space, b.ana, "member", "2026-11-16T12:03:00Z");
  const sam = await addAccount(db.client, ids, "sam", { confirmed: true });
  await db.client.query("update board set general_access = 'invited' where id = $1", [b.board]);
  expect((await api.put(`/api/boards/${b.board}/space`, { as: b.ana, body: { space } })).status).toBe(200);
  if (shared) expect((await share(b.board, b.ana, "space")).status).toBe(200);
  return { b, space, olu, ada, mel, sam };
}

describe("a member of the space", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  test("G-05, H-02: opens the board at the role it gives the space, with the space's name, and isn't recorded as a member", async () => {
    const before = await membersOf(w.b.board);

    const { status, body } = await api.get(`/api/boards/${w.b.board}`, { as: w.mel });

    expect(status).toBe(200);
    expect(body.role).toBe("voter");
    expect(body.access).toEqual({ general: "space", linkRole: "voter" });
    expect(body.space).toEqual({ id: w.space, name: "POD 6" });
    expect(await membersOf(w.b.board)).toEqual(before);
    // Each poll says the same, so the role follows a change at once.
    await share(w.b.board, w.b.ana, "space", "contributor");
    const changes = await api.get(`/api/boards/${w.b.board}/changes?after=${body.board.seq}`, { as: w.mel });
    expect(changes.body).toMatchObject({ role: "contributor", access: { general: "space", linkRole: "contributor" }, space: { id: w.space, name: "POD 6" } });
  });

  test("G-05, H-02: may vote as a Voter, and may not write", async () => {
    expect((await api.put(`/api/boards/${w.b.board}/arguments/${w.b.argument}/importance`, { as: w.mel, body: { value: 1 } })).body).toMatchObject({ status: "done" });
    const add = await api.put(`/api/boards/${w.b.board}/options/${w.b.yes}`, { as: w.mel, body: { name: "Yes, on Sundays" } });
    expect(add.body).toEqual({ status: "refused", reason: "not_allowed" });
  });

  test("G-05, E-03: finds the board in their list without an invitation, at the space's role, and the space's Owner and Admins do too", async () => {
    for (const person of [w.mel, w.olu, w.ada]) expect(await listed(person)).toEqual([{ id: w.b.board, role: "voter" }]);
    // The board's Owner, who is also in the space, finds it once, as its Owner.
    expect(await listed(w.b.ana)).toEqual([{ id: w.b.board, role: "owner" }]);
  });

  test("G-05, H-02: with a board role of their own, keeps that role, on the board and in the list, and keeps it after leaving the space", async () => {
    await addMember(db.client, w.b.board, w.mel, "viewer");

    expect((await api.get(`/api/boards/${w.b.board}`, { as: w.mel })).body.role).toBe("viewer");
    expect(await listed(w.mel)).toEqual([{ id: w.b.board, role: "viewer" }]);
    expect((await api.delete(`/api/spaces/${w.space}/people/${w.mel}`, { as: w.mel })).status).toBe(200);
    expect((await api.get(`/api/boards/${w.b.board}`, { as: w.mel })).body.role).toBe("viewer");
    expect(await listed(w.mel)).toEqual([{ id: w.b.board, role: "viewer" }]);
  });

  test("G-04, G-05: a closed space board still opens for a member, who may still comment and may not vote", async () => {
    await db.client.query("update board set closed_at = $2 where id = $1", [w.b.board, "2026-11-16T11:00:00Z"]);

    expect((await api.get(`/api/boards/${w.b.board}`, { as: w.mel })).body).toMatchObject({ role: "voter", closing: { closed: true } });
    expect(await listed(w.mel)).toEqual([{ id: w.b.board, role: "voter" }]);
    expect((await api.put(`/api/boards/${w.b.board}/arguments/${w.b.argument}/importance`, { as: w.mel, body: { value: 1 } })).body).toEqual({ status: "refused", reason: "board_closed" });
  });
});

describe("removal and leaving", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  for (const [how, call] of [
    ["removed by an Admin", (x: World) => api.delete(`/api/spaces/${x.space}/people/${x.mel}`, { as: x.ada })],
    ["leaving", (x: World) => api.delete(`/api/spaces/${x.space}/people/${x.mel}`, { as: x.mel })],
  ] as const) {
    test(`G-04, G-05, H-02: ${how} ends access at once: the board, its changes, its History, and writes are refused, and it leaves their list`, async () => {
      const { body: opened } = await api.get(`/api/boards/${w.b.board}`, { as: w.mel });
      expect(await listed(w.mel)).toHaveLength(1);

      expect((await call(w)).status).toBe(200);

      for (const url of [`/api/boards/${w.b.board}`, `/api/boards/${w.b.board}/changes?after=${opened.board.seq}`, `/api/boards/${w.b.board}/history`, `/api/boards/${w.b.board}/people`]) {
        expect(await api.get(url, { as: w.mel }), url).toEqual({ status: 403, body: { status: "refused", reason: "no_access" } });
      }
      expect((await api.put(`/api/boards/${w.b.board}/arguments/${w.b.argument}/importance`, { as: w.mel, body: { value: 1 } })).body).toEqual({ status: "refused", reason: "no_access" });
      expect(await listed(w.mel)).toEqual([]);
    });
  }

  test("G-04, G-05: removing a member keeps what they wrote while they were in the space", async () => {
    await share(w.b.board, w.b.ana, "space", "contributor");
    const wrote = await api.post(`/api/boards/${w.b.board}/arguments`, {
      as: w.mel,
      body: { id: ids.itemId(), versionId: ids.itemId(), optionId: w.b.yes, wording: "Weekend hours help people who work weekdays.", context: "" },
    });
    expect(wrote.body).toMatchObject({ status: "done" });

    expect((await api.delete(`/api/spaces/${w.space}/people/${w.mel}`, { as: w.ada })).status).toBe(200);

    const board = (await api.get(`/api/boards/${w.b.board}`, { as: w.b.ana })).body;
    expect(JSON.stringify(board)).toContain("Weekend hours help people who work weekdays.");
  });
});

describe("someone outside the space", () => {
  test("G-05, H-02: is kept out of a board shared with everyone in a space, and doesn't see it listed", async () => {
    const w = await world();

    expect(await api.get(`/api/boards/${w.b.board}`, { as: w.sam })).toEqual({ status: 403, body: { status: "refused", reason: "no_access" } });
    expect(await listed(w.sam)).toEqual([]);
    expect(await membersOf(w.b.board)).not.toContainEqual(expect.objectContaining({ account_id: w.sam }));
  });

  test("G-05, H-02: invited to the board by name, opens it at their own role, and is never told the space's name", async () => {
    const w = await world();
    await addMember(db.client, w.b.board, w.sam, "contributor");

    const { body } = await api.get(`/api/boards/${w.b.board}`, { as: w.sam });
    expect(body.role).toBe("contributor");
    expect(body.access).toEqual({ general: "space", linkRole: "voter" });
    expect(body).not.toHaveProperty("space");
    const history = (await api.get(`/api/boards/${w.b.board}/history`, { as: w.sam })).body;
    expect(JSON.stringify(history)).not.toContain("POD 6");
    expect(JSON.stringify(history)).not.toContain(w.space);
  });

  test("G-05: a member of the space doesn't see its boards that aren't shared with the space, link boards included, until they open one", async () => {
    const w = await world({ shared: false });
    expect(await api.get(`/api/boards/${w.b.board}`, { as: w.mel })).toEqual({ status: 403, body: { status: "refused", reason: "no_access" } });
    expect(await listed(w.mel)).toEqual([]);

    await share(w.b.board, w.b.ana, "link", "voter");
    expect(await listed(w.mel)).toEqual([]);
    // Opening it by its link records them by the link, as on any board, so then it's theirs to find.
    expect((await api.get(`/api/boards/${w.b.board}`, { as: w.mel })).body.role).toBe("voter");
    expect(await listed(w.mel)).toEqual([{ id: w.b.board, role: "voter" }]);
  });

  test("G-05: a deleted space lets no one in, and its boards leave every former member's list", async () => {
    const w = await world();
    await db.client.query("update space set deleted_at = $2, name = '', about = '' where id = $1", [w.space, "2026-11-16T13:00:00Z"]);

    expect((await api.get(`/api/boards/${w.b.board}`, { as: w.mel })).status).toBe(403);
    expect(await listed(w.mel)).toEqual([]);
    expect((await api.get(`/api/boards/${w.b.board}`, { as: w.b.ana })).body).not.toHaveProperty("space");
  });

  test("G-05, H-02: a board deleted with its Owner's account is not found by anyone in the space, and isn't listed", async () => {
    const w = await world();
    await db.client.query("update board set deleted_at = $2, question = '' where id = $1", [w.b.board, "2026-11-16T13:00:00Z"]);

    expect((await api.get(`/api/boards/${w.b.board}`, { as: w.mel })).status).toBe(404);
    expect(await listed(w.mel)).toEqual([]);
  });
});

describe("sharing with the space", () => {
  test("H-02: a board that isn't in a space can't be shared with everyone in one", async () => {
    const b = await seedBoard(db.client, ids);

    expect(await share(b.board, b.ana, "space")).toEqual({ status: 409, body: { status: "refused", reason: "no_space" } });
    expect((await db.client.query("select general_access from board where id = $1", [b.board])).rows[0].general_access).toBe("link");
  });

  test("H-02: from anyone with the link to everyone in the space, the people who came by the link lose it, and the invited keep theirs", async () => {
    const w = await world({ shared: false });
    await share(w.b.board, w.b.ana, "link", "contributor");
    expect((await api.get(`/api/boards/${w.b.board}`, { as: w.sam })).body.role).toBe("contributor");

    expect((await share(w.b.board, w.b.ana, "space")).status).toBe(200);

    expect(await api.get(`/api/boards/${w.b.board}`, { as: w.sam })).toEqual({ status: 403, body: { status: "refused", reason: "no_access" } });
    expect((await membersOf(w.b.board)).map((m: { account_id: string }) => m.account_id).sort()).toEqual([w.b.ana, w.b.ben].sort());
  });

  for (const [how, call] of [
    ["leaves the space", (x: World) => api.delete(`/api/spaces/${x.space}/people/${x.b.ana}`, { as: x.b.ana })],
    ["is removed from the space by an Admin", (x: World) => api.delete(`/api/spaces/${x.space}/people/${x.b.ana}`, { as: x.ada })],
  ] as const) {
    test(`G-05, H-02: an Owner who ${how} can't share the board with everyone in it, which answers as a space that isn't there does`, async () => {
      const w = await world({ shared: false });
      expect((await call(w)).status).toBe(200);
      const before = (await db.client.query("select count(*)::int as n from change where board_id = $1", [w.b.board])).rows[0].n;

      for (const linkRole of ["voter", "contributor"]) {
        expect(await share(w.b.board, w.b.ana, "space", linkRole), linkRole).toEqual({ status: 409, body: { status: "refused", reason: "no_space" } });
      }
      expect((await db.client.query("select general_access from board where id = $1", [w.b.board])).rows[0].general_access).toBe("invited");
      expect((await db.client.query("select count(*)::int as n from change where board_id = $1", [w.b.board])).rows[0].n).toBe(before);
      expect(await listed(w.mel)).toEqual([]);
      // Other choices are still theirs.
      expect((await share(w.b.board, w.b.ana, "link")).status).toBe(200);
    });
  }

  test("G-05, H-02: once its Owner has left the space, a board already shared with it can't have the space's role changed", async () => {
    const w = await world();
    expect((await api.delete(`/api/spaces/${w.space}/people/${w.b.ana}`, { as: w.b.ana })).status).toBe(200);

    expect(await share(w.b.board, w.b.ana, "space", "contributor")).toEqual({ status: 409, body: { status: "refused", reason: "no_space" } });
    expect((await db.client.query("select general_access, link_role from board where id = $1", [w.b.board])).rows[0]).toEqual({ general_access: "space", link_role: "voter" });
    expect((await share(w.b.board, w.b.ana, "invited")).status).toBe(200);
    expect(await listed(w.mel)).toEqual([]);
  });

  test("G-05: the Owner can't put a board in a space they aren't in, which answers as a space that isn't there does", async () => {
    const w = await world({ shared: false });
    const other = await addSpace(db.client, ids, w.olu, { name: "Pod 7" });

    for (const space of [other, "nospaceatall00000000"]) {
      expect(await api.put(`/api/boards/${w.b.board}/space`, { as: w.b.ana, body: { space } }), space).toEqual({ status: 409, body: { status: "refused", reason: "no_space" } });
    }
    expect((await db.client.query("select space_id from board where id = $1", [w.b.board])).rows[0].space_id).toBe(w.space);
    expect((await api.put(`/api/boards/${w.b.board}/space`, { as: w.b.ana, body: { space: "bad" } })).status).toBe(400);
  });

  test("G-05, H-02: moving a shared board to another space stops sharing it, so the old space's members lose it and the new space's don't gain it", async () => {
    const w = await world();
    const other = await addSpace(db.client, ids, w.b.ana, { name: "Pod 7" });
    const pat = await addAccount(db.client, ids, "pat", { confirmed: true });
    await addSpaceMember(db.client, other, pat, "member");

    expect((await api.put(`/api/boards/${w.b.board}/space`, { as: w.b.ana, body: { space: other } })).status).toBe(200);

    expect((await db.client.query("select general_access, space_id from board where id = $1", [w.b.board])).rows[0]).toEqual({ general_access: "invited", space_id: other });
    expect(await listed(w.mel)).toEqual([]);
    expect(await listed(pat)).toEqual([]);
  });

  test("G-05, H-02, J-03: History says who shared it with everyone in the space, naming the space to its members only, and the change log holds IDs alone", async () => {
    const w = await world();
    await addMember(db.client, w.b.board, w.sam, "viewer");

    const entry = (body: { entries: { kind: string; detail: object }[] }, kind: string) => body.entries.find((e) => e.kind === kind)!.detail;
    const member = (await api.get(`/api/boards/${w.b.board}/history`, { as: w.mel })).body;
    expect(entry(member, "access_changed")).toEqual({ general: "space", linkRole: "voter", spaceName: "POD 6" });
    expect(entry(member, "space_changed")).toEqual({ spaceName: "POD 6" });
    const outsider = (await api.get(`/api/boards/${w.b.board}/history`, { as: w.sam })).body;
    expect(entry(outsider, "access_changed")).toEqual({ general: "space", linkRole: "voter" });
    expect(entry(outsider, "space_changed")).toEqual({});

    const log = (await db.client.query("select kind, before, after from change where board_id = $1 and kind in ('access_changed', 'space_changed') order by seq", [w.b.board])).rows;
    expect(log).toEqual([
      { kind: "space_changed", before: {}, after: { space: w.space } },
      { kind: "access_changed", before: { general: "invited", linkRole: "contributor" }, after: { general: "space", linkRole: "voter", space: w.space } },
    ]);
  });

  test("G-05, J-03: taking a shared board out of its space says so in History, with only invited people left", async () => {
    const w = await world();

    expect((await api.put(`/api/boards/${w.b.board}/space`, { as: w.b.ana, body: { space: null } })).status).toBe(200);

    const entries = (await api.get(`/api/boards/${w.b.board}/history`, { as: w.b.ana })).body.entries as { kind: string; detail: object }[];
    expect(entries[0]).toMatchObject({ kind: "space_changed", detail: { outOfSpace: true, general: "invited" } });
  });
});

describe("Share's people list", () => {
  const people = async (board: string, as: string) => (await api.get(`/api/boards/${board}/people`, { as })).body.people as { id: string; name: string; role: string }[];

  test("G-05, H-02: a member let in through the space sees the Owner and then themself, at the space's role, and no one else in the space", async () => {
    const w = await world();

    const seen = await people(w.b.board, w.mel);

    expect(seen.map((p) => p.id)).toEqual([w.b.ana, w.mel, w.b.ben]);
    expect(seen[1]).toEqual({ id: w.mel, name: await username(w.mel), role: "voter" });
    for (const other of [w.olu, w.ada]) expect(seen.map((p) => p.id)).not.toContain(other);
    // The Owner's list is the board's recorded people, as before.
    expect((await people(w.b.board, w.b.ana)).map((p) => p.id)).toEqual([w.b.ana, w.b.ben]);
    // Nothing is recorded for the member.
    expect(await membersOf(w.b.board)).not.toContainEqual(expect.objectContaining({ account_id: w.mel }));
  });

  test("G-05, H-02: a member with a board role of their own is listed once, at that role", async () => {
    const w = await world();
    await addMember(db.client, w.b.board, w.mel, "contributor");

    const seen = await people(w.b.board, w.mel);

    expect(seen.filter((p) => p.id === w.mel)).toEqual([{ id: w.mel, name: await username(w.mel), role: "contributor" }]);
  });
});

describe("profiles and statistics", () => {
  test("L-03, G-05: a member of the space sees a person's work on the space's shared boards in their profile, and not once removed", async () => {
    const w = await world();
    const ana = await username(w.b.ana);
    const count = async (as: string) => (await api.get(`/api/people/${ana}`, { as })).body.arguments.length as number;

    expect(await count(w.mel)).toBe(2);
    expect(await count(w.sam)).toBe(0);
    await api.delete(`/api/spaces/${w.space}/people/${w.mel}`, { as: w.ada });
    expect(await count(w.mel)).toBe(0);
  });

  test("L-03, G-05: a board in the space that isn't shared with it doesn't count toward a member's view of a profile", async () => {
    const w = await world({ shared: false });
    expect((await api.get(`/api/people/${await username(w.b.ana)}`, { as: w.mel })).body.arguments).toEqual([]);
  });

  test("L-09, G-05: what a member wrote on a space board counts in their statistics while they're in the space, and not after", async () => {
    const w = await world();
    await write(db.client, w.b.board, async (seq) => addArgument(db.client, ids, { board: w.b.board, option: w.b.yes, author: w.mel, seq, wording: "Mel's own argument." }));
    const statistics = async () => (await api.get("/api/account/statistics", { as: w.mel })).body;

    expect(await statistics()).toMatchObject({ arguments: 1, boards: 1 });
    await api.delete(`/api/spaces/${w.space}/people/${w.mel}`, { as: w.mel });
    expect(await statistics()).toMatchObject({ arguments: 0, boards: 0 });
  });
});

describe("account deletion and the export", () => {
  const remove = async (person: string) => api.post("/api/account/delete", { as: person, body: { username: await username(person) } });
  const ownerOf = async (board: string) => (await db.client.query("select account_id from board_member where board_id = $1 and role = 'owner'", [board])).rows.map((r) => r.account_id);

  test("M-07, G-05: a space board's Owner deleting their account hands the board to the space's Owner, ahead of the board's own Editor", async () => {
    const w = await world();
    const eve = await addAccount(db.client, ids, "eve", { confirmed: true });
    await addMember(db.client, w.b.board, eve, "editor");

    expect((await remove(w.b.ana)).status).toBe(200);

    expect(await ownerOf(w.b.board)).toEqual([w.olu]);
    expect((await api.get(`/api/boards/${w.b.board}`, { as: w.olu })).body.role).toBe("owner");
    expect((await api.get(`/api/boards/${w.b.board}`, { as: eve })).body.role).toBe("editor");
  });

  test("M-07, G-05: when the board's Owner is also the space's Owner, the board goes to the longest-standing Admin, who now owns the space", async () => {
    const b = await seedBoard(db.client, ids);
    const space = await addSpace(db.client, ids, b.ana);
    const ada = await addAccount(db.client, ids, "ada", { confirmed: true });
    const al = await addAccount(db.client, ids, "al", { confirmed: true });
    await addSpaceMember(db.client, space, al, "admin", "2026-11-16T12:05:00Z");
    await addSpaceMember(db.client, space, ada, "admin", "2026-11-16T12:01:00Z");
    await api.put(`/api/boards/${b.board}/space`, { as: b.ana, body: { space } });

    expect((await remove(b.ana)).status).toBe(200);

    expect(await ownerOf(b.board)).toEqual([ada]);
    expect((await db.client.query("select account_id from space_member where space_id = $1 and role = 'owner'", [space])).rows).toEqual([{ account_id: ada }]);
  });

  test("M-07, G-05: an Admin who is already on the board becomes its Owner, added by name, not by the link", async () => {
    const b = await seedBoard(db.client, ids);
    const space = await addSpace(db.client, ids, b.ana);
    const ada = await addAccount(db.client, ids, "ada", { confirmed: true });
    await addSpaceMember(db.client, space, ada, "admin");
    await addMember(db.client, b.board, ada, "voter", "link");
    await api.put(`/api/boards/${b.board}/space`, { as: b.ana, body: { space } });

    expect((await remove(b.ana)).status).toBe(200);

    expect((await membersOf(b.board)).find((m: { account_id: string }) => m.account_id === ada)).toMatchObject({ role: "owner", joined_via: "invite" });
  });

  test("M-07, G-05: a board whose space was deleted with the account passes to its own longest-standing contributor, as before", async () => {
    const b = await seedBoard(db.client, ids);
    const space = await addSpace(db.client, ids, b.ana);
    await api.put(`/api/boards/${b.board}/space`, { as: b.ana, body: { space } });

    expect((await remove(b.ana)).status).toBe(200);

    // The space had no one else, so it's deleted, and Ben, the board's Contributor, takes the board.
    expect((await db.client.query("select deleted_at is not null as deleted from space where id = $1", [space])).rows[0].deleted).toBe(true);
    expect(await ownerOf(b.board)).toEqual([b.ben]);
  });

  test("G-05, H-02, M-07: a board shared with a space deleted with the account reads as open only to invited people for its new Owner", async () => {
    const b = await seedBoard(db.client, ids);
    const space = await addSpace(db.client, ids, b.ana);
    expect((await api.put(`/api/boards/${b.board}/space`, { as: b.ana, body: { space } })).status).toBe(200);
    expect((await share(b.board, b.ana, "space")).status).toBe(200);

    expect((await remove(b.ana)).status).toBe(200);

    expect(await ownerOf(b.board)).toEqual([b.ben]);
    const opened = (await api.get(`/api/boards/${b.board}`, { as: b.ben })).body;
    expect(opened.access).toEqual({ general: "invited", linkRole: "voter" });
    expect(opened).not.toHaveProperty("space");
    expect((await api.get(`/api/boards/${b.board}/changes?after=${opened.board.seq}`, { as: b.ben })).body.access).toEqual({ general: "invited", linkRole: "voter" });
    // The new Owner can't share it with the deleted space, and choosing invited people only is already so.
    expect(await share(b.board, b.ben, "space")).toEqual({ status: 409, body: { status: "refused", reason: "no_space" } });
    expect((await share(b.board, b.ben, "invited")).body).toEqual({ status: "already_done" });
  });

  test("M-07, G-05: Download your data holds the person's space memberships, and the space each of their boards is in", async () => {
    const w = await world();

    const { body } = await api.get("/api/account/data", { as: w.b.ana });

    expect(body.spaces).toEqual([{ space: w.space, role: "member", joined: "2026-11-16T12:03:00.000Z" }]);
    expect(body.boards).toEqual([expect.objectContaining({ board: w.b.board, role: "owner", space: w.space })]);
    // A board in no space has no such key, so other exports keep their shape.
    const other = await seedBoard(db.client, ids);
    expect((await api.get("/api/account/data", { as: other.ana })).body.boards[0]).not.toHaveProperty("space");
  });
});
