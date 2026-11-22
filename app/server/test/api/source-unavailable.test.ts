import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, addAccount, addMember, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// "Can't open it?" (M3a-3; C-02). Anyone who can read a board reports that a
// source can't be opened, as the prototype lets anyone report one, and as
// Wikipedia lets any reader tag a dead link. The mark is the source's, so it
// shows on every wording that cites it, with who reported it and when. The
// reporter withdraws their own report; an Editor or the Owner clears anyone's.
// Each report and each clearing is a change row, for History (M3a-4).

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(913);
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

const boardSeq = async () => Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);
const source = async (as: string = b.ana) => (await api.get(`/api/boards/${b.board}`, { as })).body.sources.find((s: { id: string }) => s.id === b.source);
const report = (who: string, sourceId = b.source) => api.put(`/api/boards/${b.board}/sources/${sourceId}/unavailable`, { as: who });
const clear = (who: string, sourceId = b.source) => api.delete(`/api/boards/${b.board}/sources/${sourceId}/unavailable`, { as: who });
const usernameOf = async (account: string) => (await db.client.query("select username from account where id = $1", [account])).rows[0].username as string;
const log = async () => (await db.client.query("select kind, subject_kind, subject_id, actor_id from change where board_id = $1 and subject_kind = 'source' order by seq", [b.board])).rows;

describe("Can't open it?", () => {
  test("C-02: anyone who can read reports a source; it says who and when, and is a change row", async () => {
    const before = await boardSeq();

    const { status, body } = await report(val);

    expect(status).toBe(200);
    expect(body).toEqual({ status: "done", seq: before + 1 });
    expect(await source()).toMatchObject({ unavailable: true, report: { by: val, byName: await usernameOf(val), at: new Date(NOON).toISOString() } });
    expect(await log()).toEqual([{ kind: "source_unavailable", subject_kind: "source", subject_id: b.source, actor_id: val }]);
  });

  test("C-02: another reader sees the mark on their next poll", async () => {
    const after = await boardSeq();

    await report(val);

    const { body } = await api.get(`/api/boards/${b.board}/changes?after=${after}`, { as: b.ben });
    expect(body.sources).toEqual([expect.objectContaining({ id: b.source, unavailable: true, report: expect.objectContaining({ byName: await usernameOf(val) }) })]);
  });

  test("C-02: a second report changes nothing, whoever sends it", async () => {
    await report(val);
    const before = await boardSeq();

    expect((await report(val)).body).toEqual({ status: "already_done" });
    expect((await report(b.ben)).body).toEqual({ status: "already_done" });
    expect(await boardSeq()).toBe(before);
    expect((await source()).report).toMatchObject({ by: val });
  });

  test("C-02: the reporter withdraws their report, and the source is available again", async () => {
    await report(val);

    expect((await clear(val)).body).toMatchObject({ status: "done" });

    expect(await source()).toMatchObject({ unavailable: false });
    expect((await source()).report).toBeUndefined();
    expect((await log()).map((row: { kind: string }) => row.kind)).toEqual(["source_unavailable", "source_available"]);
    expect((await clear(val)).body).toEqual({ status: "already_done" });
  });

  test("C-02, H-03: someone else's report is cleared only by an Editor or the Owner", async () => {
    await report(val);

    expect((await clear(b.ben)).body).toEqual({ status: "refused", reason: "not_author" });
    expect((await clear(eve)).body).toMatchObject({ status: "done" });
    await report(val);
    expect((await clear(b.ana)).body).toMatchObject({ status: "done" });
  });

  test("C-02, PRD §4: while its only source is unavailable, a wording can't be assessed as supported; once cleared, it can", async () => {
    await report(val);
    const assess = () => api.put(`/api/boards/${b.board}/versions/${b.version}/assessment`, { as: b.ben, body: { rev: 1, supported: true } });

    expect((await assess()).body).toEqual({ status: "refused", reason: "needs_evidence" });
    await clear(val);
    expect((await assess()).body).toMatchObject({ status: "done" });
  });

  test("C-02: a source that isn't on the board isn't found", async () => {
    expect((await report(val, ids.itemId())).status).toBe(404);
  });

  test("C-02, M-07: Download your data lists every source you reported, and when, including a report taken back", async () => {
    await report(val);
    await clear(val);
    await report(val);

    const { body } = await api.get("/api/account/data", { as: val });

    const at = new Date(NOON).toISOString();
    expect(body.sourceReports).toEqual([
      { board: b.board, source: b.source, at, standing: false },
      { board: b.board, source: b.source, at, standing: true },
    ]);
  });

  test("C-02, M-07: a deleted account's report shows as deleted_account", async () => {
    await report(val);

    expect((await api.post("/api/account/delete", { as: val, body: { username: await usernameOf(val) } })).status).toBe(200);

    expect(await source()).toMatchObject({ unavailable: true, report: expect.objectContaining({ byName: "deleted_account" }) });
  });
});
