import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addArgument, addMember, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Inviting by username, and Remove (M3b-7, H-01). The Owner adds someone by
// their username at a role, and removes a member; both use the `share` rule.
// Invitations are counted, 20 an hour per account, whatever the answer.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(3701);

const HOUR = 3_600_000;
const PERSONAS = ["owner", "editor", "contributor", "voter", "viewer", "signed out", "non-member"] as const;
type Persona = (typeof PERSONAS)[number];

const username = async (account: string) => (await db.client.query("select username from account where id = $1", [account])).rows[0].username as string;
const seqOf = async (board: string) => Number((await db.client.query("select last_seq from board where id = $1", [board])).rows[0].last_seq);

let b: SeededBoard;
/** Lin has an account and isn't on the board. */
let lin: string;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  await db.client.query("update board set general_access = 'invited' where id = $1", [b.board]);
  lin = await addAccount(db.client, ids, "lin", { confirmed: true });
});

const invite = (who: string, role: string, as: string | null = b.ana) => api.post(`/api/boards/${b.board}/invites`, { ...(as === null ? {} : { as }), body: { username: who, role } });
const remove = (account: string, as: string | null = b.ana) => api.delete(`/api/boards/${b.board}/people/${account}`, as === null ? {} : { as });
const listed = async (account: string) => ((await api.get("/api/boards", { as: account })).body.boards as { id: string }[]).some((board) => board.id === b.board);

describe("inviting by username", () => {
  test("H-01: the Owner adds someone at each of the four roles, whatever capitals or leading @ they typed; their next read lets them in and the board is in their list", async () => {
    const name = await username(lin);
    for (const [typed, role] of [[name.toUpperCase(), "viewer"], [`@${name}`, "voter"], [` ${name} `, "contributor"], [name, "editor"]] as const) {
      const board = await seedBoard(db.client, ids);
      await db.client.query("update board set general_access = 'invited' where id = $1", [board.board]);
      expect((await api.get(`/api/boards/${board.board}`, { as: lin })).status, role).toBe(403);

      const answer = await api.post(`/api/boards/${board.board}/invites`, { as: board.ana, body: { username: typed, role } });

      expect(answer.body, role).toMatchObject({ status: "done" });
      const read = await api.get(`/api/boards/${board.board}`, { as: lin });
      expect(read.status, role).toBe(200);
      expect(read.body.role, role).toBe(role);
      expect(((await api.get("/api/boards", { as: lin })).body.boards as { id: string }[]).some((each) => each.id === board.board), role).toBe(true);
    }
  });

  test("H-01: someone who came by the link takes the invited role, and keeps it when the link is turned off", async () => {
    await db.client.query("update board set general_access = 'link', link_role = 'viewer' where id = $1", [b.board]);
    await addMember(db.client, b.board, lin, "viewer", "link");

    expect((await invite(await username(lin), "contributor")).body).toMatchObject({ status: "done" });
    await api.put(`/api/boards/${b.board}/access`, { as: b.ana, body: { general: "invited", linkRole: "viewer" } });

    const read = await api.get(`/api/boards/${b.board}`, { as: lin });
    expect(read.status).toBe(200);
    expect(read.body.role).toBe("contributor");
  });

  test("H-01: someone already added at that role is already done, and nothing is written", async () => {
    await invite(await username(lin), "voter");
    const before = await seqOf(b.board);

    expect((await invite(await username(lin), "voter")).body).toEqual({ status: "already_done" });
    expect(await seqOf(b.board)).toBe(before);
  });

  test("H-01: an unknown username, a deleted account's, and the Owner's own add nobody", async () => {
    const gone = await addAccount(db.client, ids, "gone", { confirmed: true });
    const goneName = await username(gone);
    expect((await api.post("/api/account/delete", { as: gone, body: { username: goneName } })).status).toBe(200);
    const before = await seqOf(b.board);

    expect((await invite("nobody_by_that_name", "voter")).status).toBe(404);
    expect((await invite(goneName, "voter")).status).toBe(404);

    const own = await invite(await username(b.ana), "voter");
    expect(own.status).toBe(409);
    expect(own.body).toEqual({ status: "refused", reason: "already_member" });
    expect(await seqOf(b.board)).toBe(before);
    expect((await api.get(`/api/boards/${b.board}`, { as: b.ana })).body.role).toBe("owner");
  });

  test("H-01: a role that isn't one of the four, and a username that can't be one, are refused as invalid", async () => {
    expect((await invite(await username(lin), "owner")).status).toBe(400);
    expect((await invite("", "voter")).status).toBe(400);
    expect((await invite("x".repeat(60), "voter")).status).toBe(400);
  });
});

describe("who may invite and remove", () => {
  let person: Record<Persona, string | null>;
  beforeEach(async () => {
    person = { owner: b.ana, contributor: b.ben, "signed out": null } as Record<Persona, string | null>;
    for (const [persona, name] of [["editor", "eve"], ["voter", "vic"], ["viewer", "val"]] as const) {
      person[persona] = await addAccount(db.client, ids, name, { confirmed: true });
      await addMember(db.client, b.board, person[persona]!, persona);
    }
    person["non-member"] = await addAccount(db.client, ids, "sam", { confirmed: true });
  });

  test("H-01, H-03: only the Owner may invite, and a refused invitation uses no change number", async () => {
    const name = await username(lin);
    for (const persona of PERSONAS) {
      if (persona === "owner") continue;
      const before = await seqOf(b.board);
      const answer = await invite(name, "voter", person[persona]);
      expect(answer.status, persona).toBe(persona === "signed out" ? 401 : 403);
      expect(answer.body.reason, persona).toBe(persona === "signed out" ? "signed_out" : persona === "non-member" ? "no_access" : "not_allowed");
      expect(await seqOf(b.board), persona).toBe(before);
    }
    expect((await invite(name, "voter")).body).toMatchObject({ status: "done" });
  });

  test("H-01, H-03: only the Owner may remove, and a refused removal uses no change number", async () => {
    for (const persona of PERSONAS) {
      if (persona === "owner") continue;
      const before = await seqOf(b.board);
      const answer = await remove(b.ben, person[persona]);
      expect(answer.status, persona).toBe(persona === "signed out" ? 401 : 403);
      expect(await seqOf(b.board), persona).toBe(before);
    }
    expect((await remove(b.ben)).body).toMatchObject({ status: "done" });
  });
});

describe("removing someone", () => {
  test("H-01: on an invited-only board a removed person's next read is refused and the board leaves their list, while their wordings and votes still count", async () => {
    await api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: b.ben, body: { value: 1 } });
    const { version } = await write(db.client, b.board, (seq) => addArgument(db.client, ids, { board: b.board, option: b.no, author: b.ben, seq, wording: "Ben's argument." }));
    expect(await listed(b.ben)).toBe(true);

    expect((await remove(b.ben)).body).toMatchObject({ status: "done" });

    expect((await api.get(`/api/boards/${b.board}`, { as: b.ben })).status).toBe(403);
    expect(await listed(b.ben)).toBe(false);
    const board = (await api.get(`/api/boards/${b.board}`, { as: b.ana })).body;
    expect(board.versions.some((v: { id: string; deleted: boolean }) => v.id === version && !v.deleted)).toBe(true);
    expect(board.arguments.find((a: { id: string }) => a.id === b.argument).importance).toBe(1);
  });

  test("H-01: on a link board a removed person comes back at the link's role", async () => {
    await db.client.query("update board set general_access = 'link', link_role = 'voter' where id = $1", [b.board]);
    await addMember(db.client, b.board, lin, "editor");

    await remove(lin);

    // Lin has a confirmed email, which coming in by the link needs.
    const read = await api.get(`/api/boards/${b.board}`, { as: lin });
    expect(read.status).toBe(200);
    expect(read.body.role).toBe("voter");
  });

  test("H-01: the Owner can't be removed, and removing someone not on the board is already done", async () => {
    expect((await remove(b.ana)).status).toBe(404);
    expect((await api.get(`/api/boards/${b.board}`, { as: b.ana })).body.role).toBe("owner");

    await remove(b.ben);
    const before = await seqOf(b.board);
    expect((await remove(b.ben)).body).toEqual({ status: "already_done" });
    expect(await seqOf(b.board)).toBe(before);
  });
});

describe("what History says", () => {
  test("H-01, J-03: both changes are in History by username, and a deleted account's ID is scrubbed from them", async () => {
    const name = await username(lin);
    await invite(name, "voter");
    await remove(lin);

    const entries = (await api.get(`/api/boards/${b.board}/history`, { as: b.ana })).body.entries as { kind: string; detail: { accountName?: string; role?: string } }[];
    expect(entries.find((e) => e.kind === "member_added")?.detail).toEqual({ accountName: name, role: "voter" });
    expect(entries.find((e) => e.kind === "member_removed")?.detail).toEqual({ accountName: name });

    expect((await api.post("/api/account/delete", { as: lin, body: { username: name } })).status).toBe(200);
    const { rows } = await db.client.query("select before::text || after::text as detail from change where board_id = $1 and kind in ('member_added', 'member_removed')", [b.board]);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.detail).not.toContain(lin);
  });
});

describe("the invitation limit", () => {
  test("H-01, M-12: the 21st invitation in an hour is refused, unknown usernames, invalid ones, and refused ones count toward it, and it is allowed after the window", async () => {
    const name = await username(lin);
    for (let n = 0; n < 8; n++) expect((await invite(`nobody_${n}`, "voter")).status).toBe(404);
    expect((await invite(name, "owner")).status).toBe(400);
    expect((await invite(await username(b.ana), "voter")).status).toBe(409);
    for (let n = 0; n < 10; n++) expect((await invite(name, n % 2 ? "voter" : "viewer")).status).toBe(200);

    const over = await invite(name, "contributor");
    expect(over.status).toBe(429);
    expect(over.body).toMatchObject({ status: "refused", reason: "too_many" });
    expect((await api.get(`/api/boards/${b.board}`, { as: lin })).body.role).not.toBe("contributor");

    api.clock.advance(HOUR);
    expect((await invite(name, "contributor")).body).toMatchObject({ status: "done" });
  });
});
