import { beforeEach, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Report (M2-3; J-01): anyone who can read a board reports a wording as
// Spam, Abusive, Off-topic, or Something else (with a note), and can
// withdraw it. Editors and the Owner see how many open reports a wording has
// and why, never who made them. One report per person per wording, so
// reporting twice is once. Reports are deleted with the reporter's account
// and are in their Download your data.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(504);

let b: SeededBoard;
let eve: string;
let vic: string;
let val: string;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  eve = await addAccount(db.client, ids, "eve", { confirmed: true });
  vic = await addAccount(db.client, ids, "vic", { confirmed: true });
  val = await addAccount(db.client, ids, "val", { confirmed: true });
  await addMember(db.client, b.board, eve, "editor");
  await addMember(db.client, b.board, vic, "voter");
  await addMember(db.client, b.board, val, "viewer");
});

const report = (as: string, body: { reason: string; note?: string }) => api.put(`/api/boards/${b.board}/versions/${b.version}/report`, { as, body: { note: "", ...body } });
const withdraw = (as: string) => api.delete(`/api/boards/${b.board}/versions/${b.version}/report`, { as });
const seen = async (as: string) => (await api.get(`/api/boards/${b.board}`, { as })).body.versions.find((v: { id: string }) => v.id === b.version);
const boardSeq = async () => Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);
const username = async (account: string) => (await db.client.query("select username from account where id = $1", [account])).rows[0].username as string;

test("M2-3, J-01: a Viewer reports a wording; an Editor and the Owner see one report and its reason", async () => {
  const { status } = await report(val, { reason: "spam" });

  expect(status).toBe(200);
  expect((await seen(eve)).reports).toEqual({ count: 1, reasons: { spam: 1 }, notes: [] });
  expect((await seen(b.ana)).reports).toEqual({ count: 1, reasons: { spam: 1 }, notes: [] });
});

test("M2-3, J-01, H-03: a Voter and a Contributor see no reports at all", async () => {
  await report(val, { reason: "spam" });

  expect((await seen(vic)).reports).toBeNull();
  expect((await seen(b.ben)).reports).toBeNull();
});

test("M2-3, J-01: the reporter sees their own report, so they can withdraw it", async () => {
  await report(vic, { reason: "offtopic" });

  expect((await seen(vic)).myReport).toBe("offtopic");
  expect((await seen(val)).myReport).toBeNull();
});

test("M2-3, J-01: reporting twice is once; a second reason replaces the first", async () => {
  await report(vic, { reason: "spam" });
  const seq = await boardSeq();

  expect((await report(vic, { reason: "spam" })).body.status).toBe("already_done");
  expect(await boardSeq()).toBe(seq);
  await report(vic, { reason: "abuse" });

  expect((await seen(eve)).reports).toEqual({ count: 1, reasons: { abuse: 1 }, notes: [] });
});

test("M2-3, J-01: withdrawing takes it out of the count, and withdrawing again changes nothing", async () => {
  await report(vic, { reason: "spam" });
  await report(val, { reason: "spam" });

  expect((await withdraw(vic)).status).toBe(200);
  expect((await seen(eve)).reports).toEqual({ count: 1, reasons: { spam: 1 }, notes: [] });
  expect((await seen(vic)).myReport).toBeNull();
  const seq = await boardSeq();
  expect((await withdraw(vic)).body.status).toBe("already_done");
  expect(await boardSeq()).toBe(seq);
});

test("M2-3, J-01: no reports is no flag, for an Editor too", async () => {
  expect((await seen(eve)).reports).toBeNull();
});

test("M2-3, J-01: Something else needs a note; the other reasons don't", async () => {
  expect((await report(vic, { reason: "other" })).status).toBe(400);
  expect((await report(vic, { reason: "other", note: "It names a student." })).status).toBe(200);
  expect((await report(vic, { reason: "nonsense" })).status).toBe(400);
});

test("M2-3, J-01: the reporter's name and ID are never in an answer to anyone else, and their note reaches only an Editor and the Owner", async () => {
  await report(vic, { reason: "other", note: "It names a student." });
  const name = await username(vic);

  for (const as of [b.ana, eve, b.ben, val]) {
    const board = JSON.stringify((await api.get(`/api/boards/${b.board}`, { as })).body);
    const changes = JSON.stringify((await api.get(`/api/boards/${b.board}/changes?after=0`, { as })).body);
    for (const answer of [board, changes]) {
      expect(answer).not.toContain(vic);
      expect(answer).not.toContain(name);
      if (as === b.ben || as === val) expect(answer).not.toContain("It names a student.");
    }
  }
});

test("M2-3, J-01: an Editor and the Owner see what was written for Something else, as they see every reason (the builder, Nov 20: all of a report but who, or none of it)", async () => {
  await report(vic, { reason: "other", note: "It names a student." });
  await report(val, { reason: "spam" });

  for (const as of [eve, b.ana]) expect((await seen(as)).reports).toEqual({ count: 2, reasons: { spam: 1, other: 1 }, notes: ["It names a student."] });
});

test("M2-3, J-01: a withdrawn report's note goes with it", async () => {
  await report(vic, { reason: "other", note: "It names a student." });
  await withdraw(vic);

  expect((await seen(eve)).reports).toBeNull();
});

test("M2-3, J-01: an Editor's open board learns of a new report with its next request for changes", async () => {
  const seq = await boardSeq();

  await report(vic, { reason: "abuse" });

  const { body } = await api.get(`/api/boards/${b.board}/changes?after=${seq}`, { as: eve });
  expect(body.versions.find((v: { id: string }) => v.id === b.version).reports).toEqual({ count: 1, reasons: { abuse: 1 }, notes: [] });
});

test("M2-3, J-01: a deleted wording can't be reported", async () => {
  await api.delete(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana });

  expect((await report(vic, { reason: "spam" })).body.reason).toBe("version_deleted");
});

test("M2-3, J-01: a closed board refuses a report, as it does every write but comments (architecture §7)", async () => {
  await db.client.query("update board set closed_at = now() where id = $1", [b.board]);

  expect((await report(vic, { reason: "spam" })).body.reason).toBe("board_closed");
});

test("M2-3, M-07: Download your data holds the person's reports, and nobody else's", async () => {
  await report(vic, { reason: "other", note: "It names a student." });
  await report(val, { reason: "spam" });

  const { body } = await api.get("/api/account/data", { as: vic });

  expect(body.reports).toEqual([{ board: b.board, version: b.version, reason: "other", note: "It names a student.", at: expect.any(String), withdrawn: null }]);
});

test("M2-3, M-07: deleting an account deletes its reports, and an Editor's open board learns the count changed", async () => {
  await report(vic, { reason: "spam" });
  await report(val, { reason: "abuse" });
  const seq = await boardSeq();

  expect((await api.post("/api/account/delete", { as: vic, body: { username: await username(vic) } })).status).toBe(200);

  expect((await db.client.query("select count(*)::int as n from report where reporter_id = $1", [vic])).rows[0].n).toBe(0);
  const { body } = await api.get(`/api/boards/${b.board}/changes?after=${seq}`, { as: eve });
  expect(body.versions.find((v: { id: string }) => v.id === b.version).reports).toEqual({ count: 1, reasons: { abuse: 1 }, notes: [] });
});

test("M2-3, J-01: a report doesn't show itself to anyone but an Editor, the Owner, and the reporter: someone else's request for changes doesn't send the wording again", async () => {
  const seq = await boardSeq();

  await report(vic, { reason: "spam" });
  await withdraw(vic);
  await report(val, { reason: "abuse" });

  // Ben reported nothing, and Lee, a Voter, neither.
  const lee = await addAccount(db.client, ids, "lee", { confirmed: true });
  await addMember(db.client, b.board, lee, "voter");
  for (const as of [b.ben, lee]) {
    const { body } = await api.get(`/api/boards/${b.board}/changes?after=${seq}`, { as });
    expect(body.versions, as).toEqual([]);
  }
  // The reporter gets it back with their own report on it, so their menu offers Withdraw; and with no count.
  const own = (await api.get(`/api/boards/${b.board}/changes?after=${seq}`, { as: val })).body.versions;
  expect(own).toEqual([expect.objectContaining({ id: b.version, myReport: "abuse", reports: null })]);
  expect((await api.get(`/api/boards/${b.board}/changes?after=${seq}`, { as: eve })).body.versions).toHaveLength(1);
});

test("M2-3, J-01: a report withdrawn and made again counts again", async () => {
  await report(vic, { reason: "spam" });
  await withdraw(vic);

  expect((await report(vic, { reason: "offtopic" })).body.status).toBe("done");
  expect((await seen(eve)).reports).toEqual({ count: 1, reasons: { offtopic: 1 }, notes: [] });
});

test("M2-3, J-01: a report on a wording deleted since can still be withdrawn", async () => {
  await report(vic, { reason: "spam" });
  await api.delete(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana });

  expect((await withdraw(vic)).body.status).toBe("done");
});
