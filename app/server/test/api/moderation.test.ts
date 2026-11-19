import { beforeEach, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Hide and restore (M2-4; J-02): an Editor or the Owner hides a wording with
// a reason (the report reasons). It keeps its place, as "Removed by a
// moderator · Spam"; its text reaches only Editors and the Owner, who can
// restore it. Each hide and restore is a change row, with who, and the hide
// with why. Hiding resolves the open reports on it. A vote or assessment on
// a hidden wording is dropped (the stale-write table).

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(505);

let b: SeededBoard;
let eve: string;
let vic: string;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  eve = await addAccount(db.client, ids, "eve", { confirmed: true });
  vic = await addAccount(db.client, ids, "vic", { confirmed: true });
  await addMember(db.client, b.board, eve, "editor");
  await addMember(db.client, b.board, vic, "voter");
});

const WORDING = "Sunday is the only free day for many people.";
const hide = (as: string, reason = "spam") => api.put(`/api/boards/${b.board}/versions/${b.version}/hidden`, { as, body: { reason } });
const restore = (as: string) => api.delete(`/api/boards/${b.board}/versions/${b.version}/hidden`, { as });
const seen = async (as: string) => (await api.get(`/api/boards/${b.board}`, { as })).body.versions.find((v: { id: string }) => v.id === b.version);
const boardSeq = async () => Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);
const log = async (as: string) => (await api.get(`/api/boards/${b.board}/changes?after=0`, { as })).body.log;

test("M2-4, J-02: an Editor hides a wording with a reason; it keeps its place, and everyone sees why but not what it said", async () => {
  expect((await hide(eve, "spam")).status).toBe(200);

  for (const as of [vic, b.ben]) {
    expect(await seen(as)).toMatchObject({ id: b.version, hidden: true, hiddenReason: "spam", wording: null, context: null, previousWording: null });
  }
});

test("M2-4, J-02: an Editor and the Owner still see a hidden wording's text, so they can review and restore it", async () => {
  await hide(eve, "abuse");

  for (const as of [eve, b.ana]) expect(await seen(as)).toMatchObject({ hidden: true, hiddenReason: "abuse", wording: WORDING });
});

test("M2-4, J-02: restoring brings the wording back for everyone", async () => {
  await hide(b.ana, "offtopic");

  expect((await restore(eve)).status).toBe(200);
  expect(await seen(vic)).toMatchObject({ hidden: false, hiddenReason: null, wording: WORDING });
});

test("M2-4, J-02, H-03: a Contributor's hide or restore is refused, and so is a Voter's", async () => {
  const before = await boardSeq();

  for (const as of [b.ben, vic]) expect((await hide(as)).body.reason).toBe("not_allowed");
  await hide(eve);
  for (const as of [b.ben, vic]) expect((await restore(as)).body.reason).toBe("not_allowed");
  expect(await boardSeq()).toBe(before + 1);
});

test("M2-4, J-02: hiding twice is once, and restoring what isn't hidden changes nothing", async () => {
  await hide(eve);
  const seq = await boardSeq();

  expect((await hide(eve)).body.status).toBe("already_done");
  expect((await hide(b.ana, "abuse")).body.status).toBe("already_done");
  await restore(eve);
  expect((await restore(eve)).body.status).toBe("already_done");
  expect(await boardSeq()).toBe(seq + 1);
});

test("M2-4, J-02: a report, a hide, and a restore show in the change log with who and why", async () => {
  await api.put(`/api/boards/${b.board}/versions/${b.version}/report`, { as: vic, body: { reason: "spam", note: "" } });
  await hide(eve, "spam");
  await restore(b.ana);

  const rows = (await log(vic)).filter((row: { kind: string }) => row.kind.startsWith("version_"));
  expect(rows).toEqual([
    expect.objectContaining({ kind: "version_hidden", subjectKind: "version", subjectId: b.version, actorName: expect.stringMatching(/^eve_/), reason: "spam" }),
    expect.objectContaining({ kind: "version_restored", subjectKind: "version", subjectId: b.version, actorName: expect.stringMatching(/^ana_/), reason: null }),
  ]);
});

test("M2-4, J-01, J-02: hiding resolves the open reports on it: the flag goes, and the reporter's report is no longer theirs to withdraw", async () => {
  await api.put(`/api/boards/${b.board}/versions/${b.version}/report`, { as: vic, body: { reason: "spam", note: "" } });

  await hide(eve, "spam");

  expect((await seen(eve)).reports).toBeNull();
  expect((await seen(vic)).myReport).toBeNull();
  const { rows } = await db.client.query("select resolved_by, resolved_how from report where version_id = $1", [b.version]);
  expect(rows).toEqual([{ resolved_by: eve, resolved_how: "hidden" }]);
});

test("M2-4, J-01: a hidden wording can't be reported", async () => {
  await hide(eve);

  expect((await api.put(`/api/boards/${b.board}/versions/${b.version}/report`, { as: vic, body: { reason: "spam", note: "" } })).body.reason).toBe("version_deleted");
});

test("M2-4, J-02: a vote or an assessment on a hidden wording is dropped, as on a deleted one (the stale-write table)", async () => {
  await hide(eve);

  expect((await api.put(`/api/boards/${b.board}/versions/${b.version}/articulation`, { as: vic, body: { value: 1 } })).body.reason).toBe("version_deleted");
  expect((await api.put(`/api/boards/${b.board}/versions/${b.version}/assessment`, { as: vic, body: { rev: 1, supported: false } })).body.reason).toBe("version_deleted");
});

test("M2-4, J-02: a deleted wording can't be hidden", async () => {
  await api.delete(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana });

  expect((await hide(eve)).body.reason).toBe("version_deleted");
});

test("M2-4, J-02: the reason must be one of the report reasons", async () => {
  expect((await hide(eve, "boring")).status).toBe(400);
});

test("M2-4, J-02: a hidden wording's text isn't in anyone else's request for changes either", async () => {
  const seq = await boardSeq();
  await hide(eve);

  const { body } = await api.get(`/api/boards/${b.board}/changes?after=${seq}`, { as: vic });
  expect(JSON.stringify(body)).not.toContain(WORDING);
});

test("M2-4, J-02, A-06: the author can't edit a hidden wording: what the moderator reviewed is what Restore brings back", async () => {
  await hide(eve);

  const { body } = await api.put(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana, body: { baseRev: 1, wording: "Something else entirely.", context: "" } });

  expect(body.reason).toBe("version_deleted");
  expect((await seen(eve)).wording).toBe(WORDING);
});

test("M2-4, J-02: a wording deleted since it was hidden can't be restored", async () => {
  await hide(eve);
  await api.delete(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana });

  expect((await restore(eve)).body.reason).toBe("version_deleted");
});

test("M2-4, J-02: a hidden wording's sources reach only an Editor and the Owner", async () => {
  await hide(eve);

  expect((await seen(vic)).sourceIds).toEqual([]);
  expect((await seen(eve)).sourceIds.length).toBeGreaterThan(0);
});
