import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addArgument, addMember, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// History (M3a-4; J-03): the board's change log, read back, newest first:
// who did what, when, and a moderator's reason. As Google Drive's Activity
// panel and Wikipedia's page history are, it's open to everyone who can read
// the board. It never holds what anyone wrote (invariant 7): the board names
// things from the rows the reader already has. Restore brings back a deleted
// option (an Editor's or the Owner's, as deleting is), so the ten-second
// Undo isn't the only way back (WCAG 2.2.1, plans/reviews/m3-design-audit.md).

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(1024);
let b: SeededBoard;
let val: string;
let eve: string;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  val = await addAccount(db.client, ids, "val", { confirmed: true });
  await addMember(db.client, b.board, val, "viewer");
  eve = await addAccount(db.client, ids, "eve", { confirmed: true });
  await addMember(db.client, b.board, eve, "editor");
});

const usernameOf = async (account: string) => (await db.client.query("select username from account where id = $1", [account])).rows[0].username as string;
const history = async (as?: string) => api.get(`/api/boards/${b.board}/history`, { as });
const addOption = async (name: string, as = b.ana) => {
  const id = ids.itemId();
  await api.post(`/api/boards/${b.board}/options`, { as, body: { id, name } });
  return id;
};
const restoreOption = (id: string, as = eve) => api.put(`/api/boards/${b.board}/options/${id}/restore`, { as });
const liveOptions = async () => (await db.client.query("select name from option where board_id = $1 and deleted_at is null order by position", [b.board])).rows.map((row) => row.name);

describe("History", () => {
  test("J-03: lists what happened, newest first, with who did it, when, and a moderator's reason", async () => {
    const winter = await addOption("Only in winter");
    await api.delete(`/api/boards/${b.board}/options/${winter}`, { as: eve });
    await api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: eve, body: { reason: "offtopic" } });
    await api.delete(`/api/boards/${b.board}/versions/${b.version}/sources/${b.source}`, { as: b.ana });

    const { status, body } = await history(val);

    expect(status).toBe(200);
    const eveName = await usernameOf(eve);
    const anaName = await usernameOf(b.ana);
    expect(body.entries.map((e: { kind: string; actorName: string }) => [e.kind, e.actorName])).toEqual([
      ["source_removed", anaName],
      ["version_hidden", eveName],
      ["option_deleted", eveName],
      ["option_added", anaName],
    ]);
    expect(body.entries[0]).toMatchObject({ subjectKind: "version", subjectId: b.version, detail: { version: b.version, source: b.source }, reason: null });
    expect(body.entries[1]).toMatchObject({ subjectKind: "version", subjectId: b.otherVersion, reason: "offtopic" });
    expect(body.entries[2]).toMatchObject({ subjectKind: "option", subjectId: winter });
    expect(typeof body.entries[0].at).toBe("string");
  });

  test("M3a-8, J-03, J-04: a combine says which arguments, and its undo which change it undid", async () => {
    const second = await write(db.client, b.board, (seq) => addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ben, seq, wording: "Weekend hours suit families." }));
    const combined = (await api.post(`/api/boards/${b.board}/versions/${b.version}/combine`, { as: eve, body: { into: second.argument } })).body.seq;
    await api.put(`/api/boards/${b.board}/changes/${combined}/undo`, { as: eve });

    const entries = (await history(val)).body.entries as { kind: string; subjectId: string; detail: object }[];

    expect(entries.find((e) => e.kind === "wording_combined")).toMatchObject({ subjectId: b.version, detail: { from: b.argument, into: second.argument, merged: true } });
    expect(entries.find((e) => e.kind === "wording_uncombined")).toMatchObject({ subjectId: b.version, detail: { undoes: combined } });
  });

  test("J-03: a role change names the person it changed", async () => {
    await api.put(`/api/boards/${b.board}/people/${b.ben}`, { as: b.ana, body: { role: "voter" } });

    const { body } = await history(b.ben);

    expect(body.entries[0]).toMatchObject({ kind: "role_changed", detail: { accountName: await usernameOf(b.ben), role: "voter" } });
  });

  test("J-03, invariant 7: History holds no one's words, even a hidden wording's", async () => {
    const hidden = "Staff need a guaranteed day off.";
    await api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: eve, body: { reason: "spam" } });

    const { body } = await history(val);

    expect(JSON.stringify(body)).not.toContain(hidden);
    expect(JSON.stringify(body)).not.toContain("City library survey");
  });

  test("J-03, H-03: anyone on the board reads History; someone signed out or not on it doesn't", async () => {
    const stranger = await addAccount(db.client, ids, "sam", { confirmed: true });
    // Only invited people get in, so the stranger can't come by the link.
    await db.client.query("update board set general_access = 'invited' where id = $1", [b.board]);

    expect((await history(val)).status).toBe(200);
    expect((await history(stranger)).body).toEqual({ status: "refused", reason: "no_access" });
    expect((await history(undefined)).status).toBe(401);
  });

  test("J-03, M-07: what a deleted account did shows as deleted_account", async () => {
    await addOption("Only in winter", eve);
    await api.post("/api/account/delete", { as: eve, body: { username: await usernameOf(eve) } });

    const { body } = await history(val);

    expect(body.entries[0]).toMatchObject({ kind: "option_added", actorName: "deleted_account" });
  });
});

describe("restoring a deleted option from History", () => {
  test("J-03, A-07: an Editor restores a deleted option, where it was, as a change of its own", async () => {
    const winter = await addOption("Only in winter");
    await api.delete(`/api/boards/${b.board}/options/${winter}`, { as: b.ana });

    const { body } = await restoreOption(winter);

    expect(body).toMatchObject({ status: "done" });
    expect(await liveOptions()).toEqual(["Yes", "No", "Only in winter"]);
    expect((await history(val)).body.entries[0]).toMatchObject({ kind: "option_restored", subjectId: winter, actorName: await usernameOf(eve) });
    expect((await restoreOption(winter)).body).toEqual({ status: "already_done" });
  });

  test("J-03, A-07: a fifth option isn't restored", async () => {
    const winter = await addOption("Only in winter");
    await api.delete(`/api/boards/${b.board}/options/${winter}`, { as: b.ana });
    await addOption("Third");
    await addOption("Fourth");

    expect((await restoreOption(winter)).body).toEqual({ status: "refused", reason: "too_many_options" });
  });

  test("J-03, H-03: a Contributor can't restore an option", async () => {
    const winter = await addOption("Only in winter");
    await api.delete(`/api/boards/${b.board}/options/${winter}`, { as: b.ana });

    expect((await restoreOption(winter, b.ben)).body).toEqual({ status: "refused", reason: "not_allowed" });
  });
});
