import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PUBLIC_SPACES, PUBLIC_SPACES_MOST } from "@steelman/shared";
import { createSeededIds } from "@steelman/shared/testing";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { NOON, addAccount } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";
import { addSpace, addSpaceMember } from "../support/space.ts";

// Public spaces: finding them and joining (G-07, G-05, M3d-20; plans/
// architecture.md §7, point 4, and "Who sees what about people"; security
// review F4, F5, F6, F9, and F13, plans/reviews/public-spaces-security-review.md).
// Only a space's Owner changes its visibility, as only a board's Owner
// changes General access and only a GitHub repository's admins change its
// visibility (checked live on Nov 28). Making a space public stops sharing
// every board in it that someone other than the space's Owner owns, so no
// one's board opens to strangers without its Owner's choice, and one account
// owns at most 3 public spaces. Any signed-in account finds a public space
// it isn't in, most members first, at most 100 of them, and joins it at once
// as a Member, as Slack's Channels directory lists public channels with Join
// Channel (checked live on Nov 28); a private space still answers 404 to
// anyone outside it. Someone an Admin removed is answered as if the space
// were private. In a public space only its Admins and its Owner read its
// member list (the builder, Nov 28). Making it private again keeps everyone
// who joined, as Slack keeps a channel's members.

const db = useTestDatabase({ migrated: true });
const api = useApi(db, { seed: 2020 });
const ids = createSeededIds(2021);

// A second connection, to count the requests waiting on a lock: the test's own client is inside a transaction then,
// and would read the same count each time.
let service: Db;
beforeAll(() => {
  service = createDatabase(db.url);
});
afterAll(async () => {
  await service.destroy();
});
const waiting = async () =>
  Number((await sql<{ n: string }>`select count(*) as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`.execute(service)).rows[0]!.n);
const until = async (n: number) => {
  for (let tries = 0; (await waiting()) < n; tries++) {
    if (tries > 500) throw new Error(`${n} requests never waited on a lock`);
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const NOT_FOUND = { status: 404, body: { reason: "not_found" } };
const SIGNED_OUT = { status: 401, body: { status: "refused", reason: "signed_out" } };
const NOT_ALLOWED = { status: 403, body: { status: "refused", reason: "not_allowed" } };

const signed = (as: string | undefined) => (as === undefined ? {} : { as });
const visibility = (space: string, as: string | undefined, to: string) => api.put(`/api/spaces/${space}/visibility`, { ...signed(as), body: { visibility: to } });
const counts = (space: string, as: string | undefined) => api.get(`/api/spaces/${space}/visibility`, signed(as));
const find = (as: string | undefined) => api.get("/api/spaces/public", signed(as));
const found = async (as: string) => ((await find(as)).body.spaces as { id: string }[]).map((each) => each.id);
const join = (space: string, as: string | undefined) => api.post(`/api/spaces/${space}/join`, { ...signed(as), body: {} });
const leave = (space: string, as: string) => api.delete(`/api/spaces/${space}/people/${as}`, { as });
const remove = (space: string, as: string, account: string) => api.delete(`/api/spaces/${space}/people/${account}`, { as });
const people = (space: string, as: string) => api.get(`/api/spaces/${space}/people`, { as });
const read = (space: string, as: string) => api.get(`/api/spaces/${space}`, { as });
const usernameOf = async (account: string): Promise<string> => (await db.client.query("select username from account where id = $1", [account])).rows[0].username;
const invite = async (space: string, as: string, account: string, role = "member") => api.post(`/api/spaces/${space}/invites`, { as, body: { username: await usernameOf(account), role } });
const spaceRow = async (space: string) => (await db.client.query("select visibility from space where id = $1", [space])).rows[0].visibility as string;
const membership = async (space: string, account: string) => (await db.client.query("select role, joined_via from space_member where space_id = $1 and account_id = $2", [space, account])).rows[0] ?? null;
const spaceLog = async (space: string) => (await db.client.query("select actor_id, kind, before, after from space_change where space_id = $1 order by id", [space])).rows;
const boardRow = async (board: string) => (await db.client.query("select general_access, link_role, last_seq::int as seq from board where id = $1", [board])).rows[0];
const boardLog = async (board: string) => (await db.client.query("select seq::int as seq, actor_id, kind, subject_kind, before, after from change where board_id = $1 order by seq", [board])).rows;

interface Cast {
  space: string;
  /** Pod 6's Owner, an Admin, two Members (ana owns a board), and sam, who is in no space. */
  olu: string;
  ada: string;
  mel: string;
  ana: string;
  sam: string;
}

/** Pod 6, private, with its Owner, an Admin, and two Members; and sam outside it. */
async function cast(): Promise<Cast> {
  const olu = await addAccount(db.client, ids, "olu", { confirmed: true });
  const space = await addSpace(db.client, ids, olu, { name: "POD 6", about: "Building with AI" });
  const ada = await addAccount(db.client, ids, "ada", { confirmed: true });
  const mel = await addAccount(db.client, ids, "mel", { confirmed: true });
  const ana = await addAccount(db.client, ids, "ana", { confirmed: true });
  await addSpaceMember(db.client, space, ada, "admin");
  await addSpaceMember(db.client, space, mel, "member");
  await addSpaceMember(db.client, space, ana, "member");
  const sam = await addAccount(db.client, ids, "sam", { confirmed: true });
  return { space, olu, ada, mel, ana, sam };
}

/** A board made in the space by `as`, with the access given. */
async function boardIn(space: string, as: string, general: "space" | "link" | "invited", linkRole = "voter"): Promise<string> {
  const made = await api.post("/api/boards", { as, body: { question: "Should Pod 6 meet on Fridays?", options: ["Fridays", "Mondays"], space, access: { general, linkRole } } });
  expect(made.status).toBe(200);
  return made.body.board as string;
}

async function publicCast(): Promise<Cast> {
  const c = await cast();
  expect((await visibility(c.space, c.olu, "public")).body).toEqual({ status: "done" });
  return c;
}

describe("the visibility setting", () => {
  test("G-07, G-05: only the Owner changes the visibility; an Admin and a Member are refused, anyone outside isn't told the space is there, and signed out is told to sign in", async () => {
    const c = await cast();

    expect(await visibility(c.space, c.ada, "public")).toEqual(NOT_ALLOWED);
    expect(await visibility(c.space, c.mel, "public")).toEqual(NOT_ALLOWED);
    expect(await visibility(c.space, c.sam, "public")).toEqual(NOT_FOUND);
    expect(await visibility(c.space, undefined, "public")).toEqual(SIGNED_OUT);
    expect(await spaceRow(c.space)).toBe("private");
    expect(await spaceLog(c.space)).toEqual([]);

    expect(await visibility(c.space, c.olu, "public")).toEqual({ status: 200, body: { status: "done" } });
    expect(await spaceRow(c.space)).toBe("public");
    // Its change row holds the visibility words and IDs, and no text.
    expect(await spaceLog(c.space)).toEqual([{ actor_id: c.olu, kind: "visibility_changed", before: { visibility: "private" }, after: { visibility: "public", unshared: [] } }]);

    // An Admin can't make it private again either.
    expect(await visibility(c.space, c.ada, "private")).toEqual(NOT_ALLOWED);
    expect(await spaceRow(c.space)).toBe("public");
  });

  test("G-07: a word other than private or public is refused, and a new space still starts private", async () => {
    const c = await cast();
    expect((await visibility(c.space, c.olu, "secret")).status).toBe(400);
    const made = await api.post("/api/spaces", { as: c.olu, body: { id: ids.itemId(), name: "Quokka", visibility: "public" } });
    expect(made.status).toBe(400);
  });

  test("G-07, G-05: making a space public stops sharing other members' boards in it, keeps the Owner's own, and leaves boards not shared with the space as they are", async () => {
    const c = await cast();
    const olus = await boardIn(c.space, c.olu, "space");
    const anas = await boardIn(c.space, c.ana, "space", "contributor");
    const adas = await boardIn(c.space, c.ada, "space");
    const linked = await boardIn(c.space, c.mel, "link");
    const invited = await boardIn(c.space, c.mel, "invited");
    const before = { anas: await boardRow(anas), adas: await boardRow(adas), linked: await boardRow(linked), invited: await boardRow(invited), olus: await boardRow(olus) };

    // The question's counts: four members, one steelman that stays shared (the Owner's), and two that stop.
    expect(await counts(c.space, c.olu)).toEqual({ status: 200, body: { members: 4, shared: 1, unshared: 2 } });

    api.clock.advance(60_000);
    expect((await visibility(c.space, c.olu, "public")).body).toEqual({ status: "done" });

    expect(await boardRow(olus)).toEqual(before.olus);
    expect(await boardRow(anas)).toEqual({ general_access: "invited", link_role: "contributor", seq: before.anas.seq + 1 });
    expect(await boardRow(adas)).toEqual({ general_access: "invited", link_role: "voter", seq: before.adas.seq + 1 });
    expect(await boardRow(linked)).toEqual(before.linked);
    expect(await boardRow(invited)).toEqual(before.invited);
    // Each board that stops being shared gets its own change row, credited to the space's Owner, which History reads.
    expect((await boardLog(anas)).at(-1)).toEqual({
      seq: before.anas.seq + 1,
      actor_id: c.olu,
      kind: "access_changed",
      subject_kind: "board",
      before: { general: "space", linkRole: "contributor" },
      after: { general: "invited", linkRole: "contributor" },
    });
    const log = await spaceLog(c.space);
    expect(log.at(-1)).toEqual({ actor_id: c.olu, kind: "visibility_changed", before: { visibility: "private" }, after: { visibility: "public", unshared: [anas, adas].sort() } });
    // Once public, nothing more stops being shared.
    expect(await counts(c.space, c.olu)).toEqual({ status: 200, body: { members: 4, shared: 1, unshared: 0 } });
  });

  test("G-07, G-05: making a space public also stops sharing a closed board and a board whose Owner left", async () => {
    const c = await cast();
    const closed = await boardIn(c.space, c.ana, "space");
    expect((await api.put(`/api/boards/${closed}/closed`, { as: c.ana })).status).toBe(200);
    const left = await boardIn(c.space, c.mel, "space");
    expect((await leave(c.space, c.mel)).body).toEqual({ status: "done" });
    const before = { closed: await boardRow(closed), left: await boardRow(left) };

    expect((await counts(c.space, c.olu)).body).toEqual({ members: 3, shared: 0, unshared: 2 });
    expect((await visibility(c.space, c.olu, "public")).body).toEqual({ status: "done" });

    for (const [board, was] of [
      [closed, before.closed],
      [left, before.left],
    ] as const) {
      expect(await boardRow(board)).toEqual({ general_access: "invited", link_role: "voter", seq: was.seq + 1 });
      expect((await boardLog(board)).at(-1)).toMatchObject({ seq: was.seq + 1, actor_id: c.olu, kind: "access_changed", after: { general: "invited", linkRole: "voter" } });
    }
  });

  test("G-07, G-05: a share with the space that commits while Make public runs stops being shared too", async () => {
    const c = await cast();
    const anas = await boardIn(c.space, c.ana, "invited");
    // Ana's board is held, so her share queues for it first, then Make public, which must wait for it rather than
    // list the space's shared boards before her share commits.
    await db.client.query("begin");
    await db.client.query("select id from board where id = $1 for update", [anas]);
    const shared = api.put(`/api/boards/${anas}/access`, { as: c.ana, body: { general: "space", linkRole: "voter" } });
    await until(1);
    const made = visibility(c.space, c.olu, "public");
    await until(2);
    await db.client.query("rollback");

    const [share, publish] = await Promise.all([shared, made]);
    expect(share.body).toMatchObject({ status: "done" });
    expect(publish.body).toEqual({ status: "done" });
    expect((await boardRow(anas)).general_access).toBe("invited");
    expect((await spaceLog(c.space)).at(-1)?.after).toEqual({ visibility: "public", unshared: [anas] });
  });

  test("G-07, G-05: a Member's new board in the space while Make public runs is refused once the space is public", async () => {
    const c = await cast();
    // The space is held, so Make public queues for it first, then Mel's new board, which must read the visibility
    // Make public leaves rather than the one before it.
    await db.client.query("begin");
    await db.client.query("select id from space where id = $1 for update", [c.space]);
    const made = visibility(c.space, c.olu, "public");
    await until(1);
    const board = api.post("/api/boards", { as: c.mel, body: { question: "Should Pod 6 meet on Fridays?", options: ["Fridays", "Mondays"], space: c.space, access: { general: "space", linkRole: "voter" } } });
    await until(2);
    await db.client.query("rollback");

    const [publish, started] = await Promise.all([made, board]);
    expect(publish.body).toEqual({ status: "done" });
    expect(started.body).toEqual({ status: "refused", reason: "space_admins_post" });
    expect((await db.client.query("select id from board where space_id = $1", [c.space])).rows).toEqual([]);
  });

  test("G-07: only the Owner reads the question's counts", async () => {
    const c = await cast();
    expect(await counts(c.space, c.ada)).toEqual(NOT_ALLOWED);
    expect(await counts(c.space, c.mel)).toEqual(NOT_ALLOWED);
    expect(await counts(c.space, c.sam)).toEqual(NOT_FOUND);
    expect(await counts(c.space, undefined)).toEqual(SIGNED_OUT);
  });

  test("G-07: a fourth public space for one Owner is refused with its sentence, and making one private first lets it through", async () => {
    const olu = await addAccount(db.client, ids, "olu", { confirmed: true });
    const spaces: string[] = [];
    for (let n = 0; n < 4; n++) spaces.push(await addSpace(db.client, ids, olu, { name: `Pod ${n}` }));
    for (const space of spaces.slice(0, 3)) expect((await visibility(space, olu, "public")).body).toEqual({ status: "done" });

    expect(PUBLIC_SPACES.perOwner).toBe(3);
    expect(PUBLIC_SPACES_MOST).toBe("You already own 3 public spaces. Make one of them private first.");
    expect(await visibility(spaces[3]!, olu, "public")).toEqual({ status: 409, body: { status: "refused", reason: "too_many_public_spaces" } });
    expect(await spaceRow(spaces[3]!)).toBe("private");

    expect((await visibility(spaces[0]!, olu, "private")).body).toEqual({ status: "done" });
    expect((await visibility(spaces[3]!, olu, "public")).body).toEqual({ status: "done" });
  });

  test("G-07: two Make public requests sent at once can't beat the 3-space cap", async () => {
    const olu = await addAccount(db.client, ids, "olu", { confirmed: true });
    const spaces: string[] = [];
    for (let n = 0; n < 4; n++) spaces.push(await addSpace(db.client, ids, olu, { name: `Pod ${n}` }));
    for (const space of spaces.slice(0, 2)) expect((await visibility(space, olu, "public")).body).toEqual({ status: "done" });

    const answers = await Promise.all([visibility(spaces[2]!, olu, "public"), visibility(spaces[3]!, olu, "public")]);
    expect(answers.map((answer) => answer.body).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual([
      { status: "done" },
      { status: "refused", reason: "too_many_public_spaces" },
    ]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
    const owned = await db.client.query("select count(*)::int as n from space where id = any($1) and visibility = 'public'", [spaces]);
    expect(owned.rows[0].n).toBe(3);
  });

  test("G-07: making a space private again keeps everyone who joined, and takes it out of Find spaces", async () => {
    const c = await publicCast();
    const joiner = await addAccount(db.client, ids, "jo", { confirmed: true });
    expect((await join(c.space, joiner)).body).toEqual({ status: "done" });

    expect((await visibility(c.space, c.olu, "private")).body).toEqual({ status: "done" });

    expect(await membership(c.space, joiner)).toEqual({ role: "member", joined_via: "join" });
    expect(await found(c.sam)).not.toContain(c.space);
    expect(await read(c.space, c.sam)).toEqual(NOT_FOUND);
    expect(await join(c.space, c.sam)).toEqual(NOT_FOUND);
  });
});

describe("finding a public space and joining it", () => {
  test("G-07: any signed-in account finds a public space it isn't in, reads its summary with no member list, and joins it as a Member at once", async () => {
    const c = await publicCast();

    const listed = (await find(c.sam)).body.spaces as object[];
    expect(listed).toContainEqual({ id: c.space, name: "POD 6", about: "Building with AI", canvas: "stone", visibility: "public", members: 4 });
    // Its summary is the same, with no role and no people.
    expect(await read(c.space, c.sam)).toEqual({ status: 200, body: { id: c.space, name: "POD 6", about: "Building with AI", canvas: "stone", visibility: "public", members: 4 } });
    expect(await people(c.space, c.sam)).toEqual(NOT_FOUND);
    // A member doesn't find a space they're in already.
    expect(await found(c.mel)).not.toContain(c.space);

    api.clock.advance(60_000);
    expect(await join(c.space, c.sam)).toEqual({ status: 200, body: { status: "done" } });
    expect(await membership(c.space, c.sam)).toEqual({ role: "member", joined_via: "join" });
    expect((await spaceLog(c.space)).at(-1)).toEqual({ actor_id: c.sam, kind: "member_joined", before: {}, after: { account: c.sam } });
    expect(await found(c.sam)).not.toContain(c.space);
    expect((await api.get("/api/spaces", { as: c.sam })).body.spaces).toEqual([{ id: c.space, name: "POD 6", about: "Building with AI", canvas: "stone", visibility: "public", role: "member", members: 5 }]);
  });

  test("G-07: a private space still answers 404 to someone outside it, and isn't found", async () => {
    const c = await cast();
    expect(await found(c.sam)).not.toContain(c.space);
    expect(await read(c.space, c.sam)).toEqual(NOT_FOUND);
    expect(await join(c.space, c.sam)).toEqual(NOT_FOUND);
    expect(await membership(c.space, c.sam)).toBeNull();
    // An unknown ID and a malformed one answer the same.
    expect(await join(ids.itemId(), c.sam)).toEqual(NOT_FOUND);
    expect(await join("nope", c.sam)).toEqual(NOT_FOUND);
  });

  test("G-07: a deleted public space answers 404 to Join and to a read, and no one joins it", async () => {
    const c = await publicCast();
    await db.client.query("update space set deleted_at = $2 where id = $1", [c.space, NOON]);
    expect(await join(c.space, c.sam)).toEqual(NOT_FOUND);
    expect(await read(c.space, c.sam)).toEqual(NOT_FOUND);
    expect(await membership(c.space, c.sam)).toBeNull();
  });

  test("G-07: someone an Admin removed is refused by Join with 404 and doesn't find the space; an invite lets them back", async () => {
    const c = await publicCast();
    expect((await join(c.space, c.sam)).body).toEqual({ status: "done" });
    expect((await remove(c.space, c.ada, c.sam)).body).toEqual({ status: "done" });

    expect(await join(c.space, c.sam)).toEqual(NOT_FOUND);
    expect(await found(c.sam)).not.toContain(c.space);
    expect(await read(c.space, c.sam)).toEqual(NOT_FOUND);
    expect(await membership(c.space, c.sam)).toBeNull();

    expect((await invite(c.space, c.ada, c.sam)).body).toEqual({ status: "done" });
    expect(await membership(c.space, c.sam)).toEqual({ role: "member", joined_via: "invite" });
  });

  test("G-07: someone who left joins again", async () => {
    const c = await publicCast();
    expect((await leave(c.space, c.mel)).body).toEqual({ status: "done" });
    expect(await found(c.mel)).toContain(c.space);
    expect((await join(c.space, c.mel)).body).toEqual({ status: "done" });
    expect(await membership(c.space, c.mel)).toEqual({ role: "member", joined_via: "join" });
  });

  test("G-07, G-05: someone who joins opens a board shared with everyone in the space at its role, a board that isn't shared stays closed, and leaving ends it at once", async () => {
    const c = await cast();
    const olus = await boardIn(c.space, c.olu, "space", "voter");
    const closed = await boardIn(c.space, c.olu, "invited");
    expect((await visibility(c.space, c.olu, "public")).body).toEqual({ status: "done" });
    expect((await api.get(`/api/boards/${olus}`, { as: c.sam })).status).toBe(403);

    expect((await join(c.space, c.sam)).body).toEqual({ status: "done" });

    const opened = await api.get(`/api/boards/${olus}`, { as: c.sam });
    expect(opened.status).toBe(200);
    expect(opened.body.role).toBe("voter");
    // The board's space carries its visibility when it's public, for Share's hint (F5).
    expect(opened.body.space).toEqual({ id: c.space, name: "POD 6", visibility: "public" });
    expect((await api.get(`/api/boards/${closed}`, { as: c.sam })).status).toBe(403);
    const listed = ((await api.get("/api/boards", { as: c.sam })).body.boards as { id: string }[]).map((each) => each.id);
    expect(listed).toContain(olus);
    expect(listed).not.toContain(closed);

    expect((await leave(c.space, c.sam)).body).toEqual({ status: "done" });
    expect((await api.get(`/api/boards/${olus}`, { as: c.sam })).status).toBe(403);
    expect(((await api.get("/api/boards", { as: c.sam })).body.boards as { id: string }[]).map((each) => each.id)).not.toContain(olus);
    expect((await spaceLog(c.space)).at(-1)).toEqual({ actor_id: c.sam, kind: "member_left", before: {}, after: { account: c.sam } });
  });

  test("G-05: a board in a private space carries the space as before, with no visibility", async () => {
    const c = await cast();
    const olus = await boardIn(c.space, c.olu, "space");
    expect((await api.get(`/api/boards/${olus}`, { as: c.mel })).body.space).toEqual({ id: c.space, name: "POD 6" });
  });

  test("G-07: the Owner can't leave a public space", async () => {
    const c = await publicCast();
    expect(await leave(c.space, c.olu)).toEqual({ status: 409, body: { status: "refused", reason: "owner_keeps_role" } });
  });

  test("G-07: signed out, Find spaces, Join, and the question's counts ask for sign-in", async () => {
    const c = await publicCast();
    expect(await find(undefined)).toEqual(SIGNED_OUT);
    expect(await join(c.space, undefined)).toEqual(SIGNED_OUT);
    expect(await counts(c.space, undefined)).toEqual(SIGNED_OUT);
  });

  test("G-07: each write sent twice changes nothing the second time", async () => {
    const c = await cast();
    const anas = await boardIn(c.space, c.ana, "space");
    expect((await visibility(c.space, c.olu, "public")).body).toEqual({ status: "done" });
    // Ana shares her board with the space again; a second Make public must not undo her choice.
    expect((await api.put(`/api/boards/${anas}/access`, { as: c.ana, body: { general: "space", linkRole: "voter" } })).body).toMatchObject({ status: "done" });
    const board = await boardRow(anas);
    const log = await spaceLog(c.space);

    expect((await visibility(c.space, c.olu, "public")).body).toEqual({ status: "already_done" });
    expect(await boardRow(anas)).toEqual(board);

    expect((await join(c.space, c.sam)).body).toEqual({ status: "done" });
    expect((await join(c.space, c.sam)).body).toEqual({ status: "already_done" });
    expect((await leave(c.space, c.sam)).body).toEqual({ status: "done" });
    // A second Leave finds no member to take out, so it answers as for anyone outside the space.
    expect(await leave(c.space, c.sam)).toEqual(NOT_FOUND);
    expect((await visibility(c.space, c.olu, "private")).body).toEqual({ status: "done" });
    expect((await visibility(c.space, c.olu, "private")).body).toEqual({ status: "already_done" });

    expect((await spaceLog(c.space)).map((row) => row.kind)).toEqual([...log.map((row) => row.kind), "member_joined", "member_left", "visibility_changed"]);
  });
});

describe("who sees a space's member list", () => {
  test("G-07, G-04: in a public space, a Member and someone who joined get no member list, and its Admins and Owner do", async () => {
    const c = await publicCast();
    expect((await join(c.space, c.sam)).body).toEqual({ status: "done" });

    expect(await people(c.space, c.mel)).toEqual(NOT_ALLOWED);
    expect(await people(c.space, c.sam)).toEqual(NOT_ALLOWED);
    for (const as of [c.ada, c.olu]) {
      const answer = await people(c.space, as);
      expect(answer.status).toBe(200);
      expect((answer.body.people as { id: string }[]).map((each) => each.id).sort()).toEqual([c.olu, c.ada, c.mel, c.ana, c.sam].sort());
    }
  });

  test("G-04: in a private space every member still gets the member list", async () => {
    const c = await cast();
    for (const as of [c.olu, c.ada, c.mel]) expect((await people(c.space, as)).status).toBe(200);
  });

  test("G-07, G-04: an Owner's invite into a public space adds the person at once", async () => {
    const c = await publicCast();
    expect((await invite(c.space, c.olu, c.sam)).body).toEqual({ status: "done" });
    expect(await membership(c.space, c.sam)).toEqual({ role: "member", joined_via: "invite" });
  });
});

describe("Find spaces' answer", () => {
  test("G-07: Find spaces answers at most 100 spaces, most members first, and leaves out deleted ones and ones you're in", async () => {
    const reader = await addAccount(db.client, ids, "reader", { confirmed: true });
    const crowd: string[] = [];
    for (let n = 0; n < 6; n++) crowd.push(await addAccount(db.client, ids, `crowd${n}`, { confirmed: true }));
    const made: string[] = [];
    for (let n = 0; n < PUBLIC_SPACES.found + 5; n++) {
      const id = ids.itemId();
      made.push(id);
      await db.client.query("insert into space (id, name, about, canvas, visibility, created_by, created_at) values ($1, $2, '', 'stone', 'public', $3, $4)", [id, `Open ${n}`, crowd[0], NOON]);
      await db.client.query("insert into space_member (space_id, account_id, role, joined_at) values ($1, $2, 'owner', $3)", [id, crowd[0], NOON]);
      for (const extra of crowd.slice(1, 1 + (n % 6))) await addSpaceMember(db.client, id, extra, "member");
    }
    const deleted = made[5]!;
    await db.client.query("update space set deleted_at = $2 where id = $1", [deleted, NOON]);
    const mine = made[11]!;
    await addSpaceMember(db.client, mine, reader, "member");

    try {
      const answer = (await find(reader)).body.spaces as { id: string; members: number }[];
      expect(answer).toHaveLength(PUBLIC_SPACES.found);
      const ids_ = answer.map((each) => each.id);
      expect(ids_).not.toContain(deleted);
      expect(ids_).not.toContain(mine);
      // Most members first, and the same order each time.
      for (let n = 1; n < answer.length; n++) expect(answer[n - 1]!.members).toBeGreaterThanOrEqual(answer[n]!.members);
      expect((await find(reader)).body.spaces).toEqual(answer);
      // What's left out has no more members than the last one listed.
      const fewest = answer.at(-1)!.members;
      const left = (await db.client.query("select s.id, (select count(*)::int from space_member m where m.space_id = s.id) as n from space s where s.visibility = 'public' and s.deleted_at is null")).rows as { id: string; n: number }[];
      for (const space of left) if (!ids_.includes(space.id) && space.id !== mine) expect(space.n).toBeLessThanOrEqual(fewest);
    } finally {
      // These spaces would crowd the other tests' spaces out of the answer.
      await db.client.query("update space set deleted_at = $2 where id = any($1)", [made, NOON]);
    }
  });
});
