import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Adding an argument (A-03), adding a wording to one (A-05), and editing or
// deleting your own wording (A-06). New things arrive with IDs the browser
// made; an edit names the revision it started from. So every write is safe
// to send twice (invariant 10).

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(406);
let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const boardSeq = async () => Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);
const snapshot = async (as: string = b.ana) => (await api.get(`/api/boards/${b.board}`, { as })).body;
const version = async (id: string, as?: string) => (await snapshot(as)).versions.find((v: { id: string }) => v.id === id);
const argument = async (id: string) => (await snapshot()).arguments.find((a: { id: string }) => a.id === id);

const addArgument = (who: string, body: { id: string; optionId: string; versionId: string; wording: string; context?: string }) =>
  api.post(`/api/boards/${b.board}/arguments`, { as: who, body: { context: "", ...body } });
const addWording = (who: string, argumentId: string, body: { id: string; wording: string; context?: string }) =>
  api.post(`/api/boards/${b.board}/arguments/${argumentId}/versions`, { as: who, body: { context: "", ...body } });
const edit = (who: string, versionId: string, body: { baseRev: number; wording: string; context?: string }) =>
  api.put(`/api/boards/${b.board}/versions/${versionId}`, { as: who, body: { context: "", ...body } });
const remove = (who: string, versionId: string) => api.delete(`/api/boards/${b.board}/versions/${versionId}`, { as: who });

describe("adding an argument", () => {
  test("A-03: joins its option with its first wording, unvoted and unreviewed", async () => {
    const id = ids.itemId();
    const versionId = ids.itemId();

    const { status, body } = await addArgument(b.ben, { id, optionId: b.no, versionId, wording: "  Sunday   staff cost more.  ", context: "Overtime rates." });

    expect(status).toBe(200);
    expect(body).toEqual({ status: "done", seq: await boardSeq() });
    expect(await argument(id)).toMatchObject({ optionId: b.no, importance: 0, importanceVoters: 0, deleted: false, createdSeq: body.seq });
    expect(await version(versionId)).toMatchObject({ argumentId: id, authorId: b.ben, rev: 1, wording: "Sunday staff cost more.", context: "Overtime rates.", yes: 0, no: 0 });
  });

  test("A-03: sent twice, it is added once, and the second answer is 'already done'", async () => {
    const request = { id: ids.itemId(), optionId: b.no, versionId: ids.itemId(), wording: "Sunday staff cost more." };
    await addArgument(b.ben, request);
    const seq = await boardSeq();

    expect((await addArgument(b.ben, request)).body).toEqual({ status: "already_done" });
    expect(await boardSeq()).toBe(seq);
    const count = await db.client.query("select count(*)::int as n from argument where id = $1", [request.id]);
    expect(count.rows[0].n).toBe(1);
  });

  test("A-03: an ID someone else already used is refused", async () => {
    const request = { id: ids.itemId(), optionId: b.no, versionId: ids.itemId(), wording: "Sunday staff cost more." };
    await addArgument(b.ben, request);

    expect((await addArgument(b.ana, request)).body).toEqual({ status: "refused", reason: "id_taken" });
  });

  test("A-03: the wording follows the input limits", async () => {
    const tooLong = await addArgument(b.ben, { id: ids.itemId(), optionId: b.no, versionId: ids.itemId(), wording: "x".repeat(501) });
    const empty = await addArgument(b.ben, { id: ids.itemId(), optionId: b.no, versionId: ids.itemId(), wording: "   " });
    const badId = await addArgument(b.ben, { id: "short", optionId: b.no, versionId: ids.itemId(), wording: "Fine." });

    expect([tooLong.status, empty.status, badId.status]).toEqual([400, 400, 400]);
  });

  test("A-03: under an option that isn't on this board is not found", async () => {
    const other = await seedBoard(db.client, ids);

    expect((await addArgument(b.ben, { id: ids.itemId(), optionId: other.yes, versionId: ids.itemId(), wording: "Fine." })).status).toBe(404);
  });
});

describe("adding a wording to an argument", () => {
  test("A-05: joins the argument as a new version", async () => {
    const id = ids.itemId();

    const { body } = await addWording(b.ben, b.argument, { id, wording: "Shift workers can only come on Sundays." });

    expect(body.status).toBe("done");
    expect(await version(id)).toMatchObject({ argumentId: b.argument, authorId: b.ben, rev: 1, wording: "Shift workers can only come on Sundays.", articulationVoters: 0 });
  });

  test("A-05: sent twice, it is added once", async () => {
    const request = { id: ids.itemId(), wording: "Shift workers can only come on Sundays." };
    await addWording(b.ben, b.argument, request);
    const seq = await boardSeq();

    expect((await addWording(b.ben, b.argument, request)).body).toEqual({ status: "already_done" });
    expect(await boardSeq()).toBe(seq);
  });
});

describe("editing your own wording", () => {
  test("A-06: saves a new revision; the old one is kept and shown as the earlier wording", async () => {
    const { body } = await edit(b.ana, b.version, { baseRev: 1, wording: "Sunday is the only free day for most shift workers." });

    expect(body.status).toBe("done");
    expect(await version(b.version)).toMatchObject({ rev: 2, wording: "Sunday is the only free day for most shift workers.", previousWording: "Sunday is the only free day for many people." });
  });

  test("A-06, B-03: credibility starts over; importance and articulation votes stay", async () => {
    await api.put(`/api/boards/${b.board}/versions/${b.version}/assessment`, { as: b.ben, body: { rev: 1, supported: true } });
    await api.put(`/api/boards/${b.board}/versions/${b.version}/articulation`, { as: b.ben, body: { value: 1 } });
    await api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: b.ben, body: { value: 1 } });

    await edit(b.ana, b.version, { baseRev: 1, wording: "Sharper." });

    expect(await version(b.version, b.ben)).toMatchObject({ rev: 2, yes: 0, no: 0, myAssessment: null, articulation: 1, myVote: 1 });
    expect(await argument(b.argument)).toMatchObject({ importance: 1 });
  });

  test("A-06, C-01: the new revision cites the same sources, so 'yes' still has evidence", async () => {
    await edit(b.ana, b.version, { baseRev: 1, wording: "Sharper." });

    expect(await version(b.version)).toMatchObject({ sourceIds: [b.source] });
    expect((await api.put(`/api/boards/${b.board}/versions/${b.version}/assessment`, { as: b.ben, body: { rev: 2, supported: true } })).body.status).toBe("done");
  });

  test("A-06: the edit is in the change log, by ID, with no text", async () => {
    const { body } = await edit(b.ana, b.version, { baseRev: 1, wording: "Sharper." });

    const log = (await api.get(`/api/boards/${b.board}/changes?after=${body.seq - 1}`, { as: b.ana })).body.log;
    expect(log).toEqual([expect.objectContaining({ seq: body.seq, kind: "version_edited", subjectKind: "version", subjectId: b.version })]);
  });

  test("A-06: sent twice, it saves one revision", async () => {
    await edit(b.ana, b.version, { baseRev: 1, wording: "Sharper." });
    const seq = await boardSeq();

    expect((await edit(b.ana, b.version, { baseRev: 1, wording: "Sharper." })).body).toEqual({ status: "already_done" });
    expect(await boardSeq()).toBe(seq);
    expect(await version(b.version)).toMatchObject({ rev: 2 });
  });

  test("A-06: an edit that changes nothing is already done", async () => {
    expect((await edit(b.ana, b.version, { baseRev: 1, wording: "Sunday is the only free day for many people." })).body).toEqual({ status: "already_done" });
  });

  test("A-06: only the author can edit", async () => {
    const { status, body } = await edit(b.ben, b.version, { baseRev: 1, wording: "Mine now." });

    expect(status).toBe(403);
    expect(body).toEqual({ status: "refused", reason: "not_author" });
  });
});

describe("deleting your own wording", () => {
  test("A-06: erases its text; the row stays, marked deleted", async () => {
    await addWording(b.ana, b.argument, { id: ids.itemId(), wording: "A second wording keeps the argument alive." });

    const { body } = await remove(b.ana, b.version);

    expect(body.status).toBe("done");
    expect(await version(b.version)).toMatchObject({ deleted: true, wording: null, context: null });
    const text = await db.client.query("select count(*)::int as n from version_revision where version_id = $1 and wording is not null", [b.version]);
    expect(text.rows[0].n).toBe(0);
    expect(await argument(b.argument)).toMatchObject({ deleted: false });
  });

  test("A-06: deleting an argument's last wording deletes the argument too", async () => {
    await remove(b.ana, b.version);

    expect(await argument(b.argument)).toMatchObject({ deleted: true });
  });

  test("A-06: an argument goes when its last remaining wording goes, even if others were deleted before", async () => {
    const second = ids.itemId();
    await addWording(b.ana, b.argument, { id: second, wording: "A second wording." });
    await remove(b.ana, second);
    expect(await argument(b.argument)).toMatchObject({ deleted: false });

    await remove(b.ana, b.version);

    expect(await argument(b.argument)).toMatchObject({ deleted: true });
  });

  test("A-06: the deletion is in the change log", async () => {
    const { body } = await remove(b.ana, b.version);

    const log = (await api.get(`/api/boards/${b.board}/changes?after=${body.seq - 1}`, { as: b.ana })).body.log;
    expect(log).toEqual([expect.objectContaining({ kind: "version_deleted", subjectId: b.version })]);
  });

  test("A-06: sent twice, it is deleted once", async () => {
    await remove(b.ana, b.version);
    const seq = await boardSeq();

    expect((await remove(b.ana, b.version)).body).toEqual({ status: "already_done" });
    expect(await boardSeq()).toBe(seq);
  });

  test("A-06: only the author can delete", async () => {
    expect((await remove(b.ben, b.version)).body).toEqual({ status: "refused", reason: "not_author" });
    expect(await version(b.version)).toMatchObject({ deleted: false });
  });

  test("A-06, B-05: a deleted wording's votes stop counting toward the order", async () => {
    const second = ids.itemId();
    await addWording(b.ben, b.argument, { id: second, wording: "Another way to put it." });
    await api.put(`/api/boards/${b.board}/versions/${b.version}/articulation`, { as: b.ben, body: { value: 1 } });
    await snapshot();

    await remove(b.ana, b.version);
    api.clock.advance(60_000);

    expect((await snapshot()).order.versions[b.argument]).toEqual([second]);
  });
});
