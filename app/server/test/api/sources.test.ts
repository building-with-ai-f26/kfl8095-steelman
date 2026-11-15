import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, addAccount, addMember, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Sources, on the server (M1-8; C-01). A source is a piece of evidence,
// shared on the board: anyone who can contribute adds one to a wording, and
// may cite it on others; only the person who added it edits it (the
// prototype's rule). Taking one off a wording is for whoever added it, the
// wording's author, or the Owner (the builder, Nov 14). Nothing is ever
// removed from a board, so taking a source off a wording leaves it there.
//
// Changing which sources a wording cites saves a new revision, so its
// credibility starts over (invariant 2). Editing a source's evidence (where
// to find it, its finding) does the same to every wording that cites it;
// fixing its name doesn't (Q10, revised by the builder Nov 14: what it backs
// up and its limits, which the screens no longer ask for, don't either).
// Assessments of an old revision stop counting and stay as history (PRD §4).

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(808);
let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const boardSeq = async () => Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);
const snapshot = async (as: string = b.ana) => (await api.get(`/api/boards/${b.board}`, { as })).body;
const version = async (id: string, as?: string) => (await snapshot(as)).versions.find((v: { id: string }) => v.id === id);
const source = async (id: string) => (await snapshot()).sources.find((s: { id: string }) => s.id === id);
const revision = async (versionId: string, rev: number) =>
  (await db.client.query("select wording, context, why from version_revision where version_id = $1 and rev = $2", [versionId, rev])).rows[0];
/** In code-point order, whatever the database's collation. */
const byAccount = (x: { account_id: string }, y: { account_id: string }) => (x.account_id < y.account_id ? -1 : 1);
const assessments = async (versionId: string) =>
  (await db.client.query("select rev, account_id, supported from assessment where version_id = $1", [versionId])).rows.sort(byAccount);
/** The sources a wording cites, in code-point order. */
const cited = async (versionId: string) => [...(await version(versionId)).sourceIds].sort();

const EVIDENCE = { name: "Shift work survey, 2024", locator: "https://example.org/shift-work", finding: "Four in ten shift workers have Sunday as their only day off.", backsUp: "", limits: "" };

const addSource = (who: string, versionId: string, body: Record<string, unknown>) => api.post(`/api/boards/${b.board}/versions/${versionId}/sources`, { as: who, body });
const cite = (who: string, versionId: string, sourceId: string) => api.put(`/api/boards/${b.board}/versions/${versionId}/sources/${sourceId}`, { as: who });
const uncite = (who: string, versionId: string, sourceId: string) => api.delete(`/api/boards/${b.board}/versions/${versionId}/sources/${sourceId}`, { as: who });
const editSource = (who: string, sourceId: string, body: Record<string, unknown>) => api.put(`/api/boards/${b.board}/sources/${sourceId}`, { as: who, body });
const assess = (who: string, versionId: string, rev: number, supported: boolean | null) =>
  api.put(`/api/boards/${b.board}/versions/${versionId}/assessment`, { as: who, body: { rev, supported } });
const editWording = (who: string, versionId: string, baseRev: number, wording: string) =>
  api.put(`/api/boards/${b.board}/versions/${versionId}`, { as: who, body: { baseRev, wording, context: "" } });

/** The seeded source's fields, as an edit sends them. */
const SEEDED = { name: "City library survey, 2025", locator: "", finding: "Most weekday visitors can't come on weekdays.", backsUp: "", limits: "" };

/** Cites the seeded source on the other wording too, so two wordings share it. */
const share = async () => {
  await cite(b.ana, b.otherVersion, b.source);
};

describe("adding a source to a wording", () => {
  test("C-01: saves the source and a new revision of the wording that cites it", async () => {
    const id = ids.itemId();

    const { status, body } = await addSource(b.ben, b.version, { id, ...EVIDENCE });

    expect(status).toBe(200);
    expect(body).toEqual({ status: "done", seq: await boardSeq() });
    expect(await version(b.version)).toMatchObject({ rev: 2, wording: "Sunday is the only free day for many people." });
    expect(await cited(b.version)).toEqual([b.source, id].sort());
    expect(await revision(b.version, 2)).toEqual({ wording: "Sunday is the only free day for many people.", context: "", why: "sources_changed" });
    const ben = (await db.client.query("select username from account where id = $1", [b.ben])).rows[0].username;
    expect(await source(id)).toEqual({ id, addedBy: b.ben, addedByName: ben, changedSeq: body.seq, link: EVIDENCE.locator, unavailable: false, ...EVIDENCE });
  });

  test("C-01, B-03: credibility starts over; assessments of the old revision stay as history; importance and articulation votes stay", async () => {
    await assess(b.ben, b.version, 1, true);
    await assess(b.ana, b.version, 1, false);
    await api.put(`/api/boards/${b.board}/versions/${b.version}/articulation`, { as: b.ben, body: { value: 1 } });
    await api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: b.ben, body: { value: 1 } });

    await addSource(b.ben, b.version, { id: ids.itemId(), ...EVIDENCE });

    expect(await version(b.version, b.ben)).toMatchObject({ rev: 2, yes: 0, no: 0, myAssessment: null, articulation: 1, myVote: 1 });
    expect((await snapshot()).arguments.find((a: { id: string }) => a.id === b.argument)).toMatchObject({ importance: 1 });
    expect(await assessments(b.version)).toEqual(
      [
        { rev: 1, account_id: b.ben, supported: true },
        { rev: 1, account_id: b.ana, supported: false },
      ].sort(byAccount),
    );
  });

  test("C-01: sent twice, it is added once, and the second answer is 'already done'", async () => {
    const request = { id: ids.itemId(), ...EVIDENCE };
    await addSource(b.ben, b.version, request);
    const seq = await boardSeq();

    expect((await addSource(b.ben, b.version, request)).body).toEqual({ status: "already_done" });
    expect(await boardSeq()).toBe(seq);
    expect(await version(b.version)).toMatchObject({ rev: 2 });
  });

  test("C-01: sent again after it was taken off, it stays off", async () => {
    const request = { id: ids.itemId(), ...EVIDENCE };
    await addSource(b.ben, b.version, request);
    await uncite(b.ben, b.version, request.id);

    expect((await addSource(b.ben, b.version, request)).body).toEqual({ status: "already_done" });
    expect(await version(b.version)).toMatchObject({ sourceIds: [b.source] });
  });

  test("C-01: an ID someone else already used is refused", async () => {
    const request = { id: ids.itemId(), ...EVIDENCE };
    await addSource(b.ben, b.version, request);

    expect((await addSource(b.ana, b.version, request)).body).toEqual({ status: "refused", reason: "id_taken" });
    expect((await addSource(b.ben, b.otherVersion, request)).body).toEqual({ status: "refused", reason: "id_taken" });
  });

  test("C-01: the source follows the input limits; a name is needed, and nothing else may be sent", async () => {
    const tries = [
      { ...EVIDENCE, name: "   " },
      { ...EVIDENCE, name: "x".repeat(121) },
      { ...EVIDENCE, locator: "x".repeat(2001) },
      { ...EVIDENCE, finding: "x".repeat(501) },
      { ...EVIDENCE, backsUp: "x".repeat(301) },
      { ...EVIDENCE, limits: "x".repeat(301) },
      { ...EVIDENCE, addedBy: b.ana },
    ];
    for (const fields of tries) {
      expect((await addSource(b.ben, b.version, { id: ids.itemId(), ...fields })).status, JSON.stringify(fields).slice(0, 80)).toBe(400);
    }
    expect((await addSource(b.ben, b.version, { id: "short", ...EVIDENCE })).status).toBe(400);
    expect(await version(b.version)).toMatchObject({ rev: 1 });
  });

  test("C-01: its description (finding) may be left empty (the builder, Nov 15)", async () => {
    const id = ids.itemId();

    expect((await addSource(b.ben, b.version, { id, ...EVIDENCE, finding: "" })).body.status).toBe("done");
    expect(await source(id)).toMatchObject({ finding: "" });
  });

  test("C-01: text is tidied the way the prototype does", async () => {
    const id = ids.itemId();

    await addSource(b.ben, b.version, { id, ...EVIDENCE, name: "  Shift   work survey  ", backsUp: " Sundays\n off " });

    expect(await source(id)).toMatchObject({ name: "Shift work survey", backsUp: "Sundays off" });
  });

  test("C-01: where to find it is kept as text, and is a link only when it is an http or https address", async () => {
    const cases = [
      ["https://example.org/shift-work", "https://example.org/shift-work"],
      ["http://example.org/report.pdf", "http://example.org/report.pdf"],
      ["javascript:alert(1)", null],
      ["data:text/html,<script>alert(1)</script>", null],
      ["ftp://example.org/report", null],
      ["Chapter 3, page 41", null],
      ["", null],
    ] as const;
    for (const [locator, link] of cases) {
      const id = ids.itemId();
      await addSource(b.ben, b.version, { id, ...EVIDENCE, locator });

      expect(await source(id), locator).toMatchObject({ locator, link });
    }
  });

  test("C-01: adding a source isn't an edit of the wording, so it shows no 'edited' mark", async () => {
    await addSource(b.ben, b.version, { id: ids.itemId(), ...EVIDENCE });

    expect(await version(b.version)).toMatchObject({ rev: 2, previousWording: null });
  });

  test("A-06, C-01: a wording edited before a source was added still shows the wording it replaced", async () => {
    await editWording(b.ana, b.version, 1, "Sunday is the only free day for most shift workers.");
    await addSource(b.ben, b.version, { id: ids.itemId(), ...EVIDENCE });

    expect(await version(b.version)).toMatchObject({ rev: 3, wording: "Sunday is the only free day for most shift workers.", previousWording: "Sunday is the only free day for many people." });
  });

  test("C-01: on a wording that was deleted, it is refused", async () => {
    await api.post(`/api/boards/${b.board}/arguments/${b.argument}/versions`, { as: b.ana, body: { id: ids.itemId(), wording: "Keeps the argument.", context: "" } });
    await api.delete(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana });

    const { status, body } = await addSource(b.ben, b.version, { id: ids.itemId(), ...EVIDENCE });

    expect(status).toBe(409);
    expect(body).toEqual({ status: "refused", reason: "version_deleted" });
  });

  test("C-01: on a wording that isn't on this board, it is not found", async () => {
    const other = await seedBoard(db.client, ids);

    expect((await addSource(b.ben, other.version, { id: ids.itemId(), ...EVIDENCE })).status).toBe(404);
  });

  test("C-01: it is in the change log, by ID, with no text", async () => {
    const id = ids.itemId();
    const { body } = await addSource(b.ben, b.version, { id, ...EVIDENCE });

    const log = (await api.get(`/api/boards/${b.board}/changes?after=${body.seq - 1}`, { as: b.ana })).body.log;
    expect(log).toEqual([expect.objectContaining({ seq: body.seq, kind: "source_added", subjectKind: "source", subjectId: id })]);
    const row = (await db.client.query("select before, after from change where board_id = $1 and seq = $2", [b.board, body.seq])).rows[0];
    expect(JSON.stringify(row)).not.toContain("survey");
  });
});

describe("a wording an editor hid", () => {
  const hide = (versionId: string) =>
    write(db.client, b.board, (seq) => db.client.query("update version set hidden_at = $2, hidden_by = $3, changed_seq = $4 where id = $1", [versionId, NOON, b.ana, seq]));

  test("C-01: takes no new source, by adding or citing", async () => {
    await hide(b.otherVersion);

    expect((await addSource(b.ben, b.otherVersion, { id: ids.itemId(), ...EVIDENCE })).body).toEqual({ status: "refused", reason: "version_deleted" });
    expect((await cite(b.ben, b.otherVersion, b.source)).body).toEqual({ status: "refused", reason: "version_deleted" });
  });

  test("C-01: still starts over when a source it cites changes, so it does if it's restored", async () => {
    await hide(b.version);

    await editSource(b.ana, b.source, { ...SEEDED, finding: "Changed." });

    expect(await revision(b.version, 2)).toEqual({ wording: "Sunday is the only free day for many people.", context: "", why: "source_changed" });
  });
});

describe("citing a source already on the board", () => {
  test("C-01: one source can back several wordings; citing it saves a new revision of the wording", async () => {
    await assess(b.ben, b.otherVersion, 1, false);

    const { body } = await cite(b.ben, b.otherVersion, b.source);

    expect(body.status).toBe("done");
    expect(await version(b.otherVersion, b.ben)).toMatchObject({ rev: 2, sourceIds: [b.source], no: 0, myAssessment: null });
    expect(await version(b.version)).toMatchObject({ rev: 1, sourceIds: [b.source] });
    expect(await revision(b.otherVersion, 2)).toMatchObject({ why: "sources_changed" });
  });

  test("C-01: a wording that already cites it is already done", async () => {
    expect((await cite(b.ben, b.version, b.source)).body).toEqual({ status: "already_done" });
  });

  test("C-01: sent twice, it is cited once", async () => {
    await cite(b.ben, b.otherVersion, b.source);
    const seq = await boardSeq();

    expect((await cite(b.ben, b.otherVersion, b.source)).body).toEqual({ status: "already_done" });
    expect(await boardSeq()).toBe(seq);
  });

  test("C-01: a source from another board is not found", async () => {
    const other = await seedBoard(db.client, ids);

    expect((await cite(b.ben, b.otherVersion, other.source)).status).toBe(404);
  });
});

describe("taking a source off a wording", () => {
  test("C-01: saves a new revision without it; the source stays on the board", async () => {
    await share();
    await assess(b.ben, b.version, 1, true);

    const { body } = await uncite(b.ana, b.version, b.source);

    expect(body.status).toBe("done");
    expect(await version(b.version, b.ben)).toMatchObject({ rev: 2, sourceIds: [], yes: 0, myAssessment: null });
    expect(await version(b.otherVersion)).toMatchObject({ sourceIds: [b.source] });
    expect(await source(b.source)).toMatchObject({ name: SEEDED.name });
    expect(await revision(b.version, 2)).toMatchObject({ why: "sources_changed" });
    expect(await assessments(b.version)).toEqual([{ rev: 1, account_id: b.ben, supported: true }]);
  });

  test("B-03, C-01: then 'yes' has no evidence, and is refused", async () => {
    await uncite(b.ana, b.version, b.source);

    const { status, body } = await assess(b.ben, b.version, 2, true);

    expect(status).toBe(409);
    expect(body).toEqual({ status: "refused", reason: "needs_evidence" });
    expect((await assess(b.ben, b.version, 2, false)).body.status).toBe("done");
  });

  test("C-01: sent twice, it is taken off once", async () => {
    await uncite(b.ana, b.version, b.source);
    const seq = await boardSeq();

    expect((await uncite(b.ana, b.version, b.source)).body).toEqual({ status: "already_done" });
    expect(await boardSeq()).toBe(seq);
    expect(await version(b.version)).toMatchObject({ rev: 2 });
  });

  test("C-01: someone who neither added the source nor wrote the wording can't take it off", async () => {
    const { status, body } = await uncite(b.ben, b.version, b.source);

    expect(status).toBe(403);
    expect(body).toEqual({ status: "refused", reason: "not_author" });
    expect(await version(b.version)).toMatchObject({ rev: 1, sourceIds: [b.source] });
  });

  test("C-01: the wording's author may take off a source someone else cited there; the person who cited it may not", async () => {
    const carol = await addAccount(db.client, ids, "carol");
    await addMember(db.client, b.board, carol, "contributor");
    const carols = ids.itemId();
    await api.post(`/api/boards/${b.board}/arguments/${b.argument}/versions`, { as: carol, body: { id: carols, wording: "Carol's wording.", context: "" } });
    await cite(b.ben, carols, b.source); // Ana's source, cited by Ben on Carol's wording

    expect((await uncite(b.ben, carols, b.source)).body).toEqual({ status: "refused", reason: "not_author" });
    expect((await uncite(carol, carols, b.source)).body.status).toBe("done");
    expect(await version(carols)).toMatchObject({ rev: 3, sourceIds: [] });
  });

  test("C-01: the Owner may take any source off any wording", async () => {
    const carol = await addAccount(db.client, ids, "carol");
    await addMember(db.client, b.board, carol, "contributor");
    const carols = ids.itemId();
    const bens = ids.itemId();
    await api.post(`/api/boards/${b.board}/arguments/${b.argument}/versions`, { as: carol, body: { id: carols, wording: "Carol's wording.", context: "" } });
    await addSource(b.ben, carols, { id: bens, ...EVIDENCE }); // Ben's source on Carol's wording: Ana, the Owner, wrote neither

    expect((await uncite(b.ana, carols, bens)).body.status).toBe("done");
    expect(await version(carols)).toMatchObject({ sourceIds: [] });
  });

  test("C-01: it is in the change log", async () => {
    const { body } = await uncite(b.ana, b.version, b.source);

    const log = (await api.get(`/api/boards/${b.board}/changes?after=${body.seq - 1}`, { as: b.ana })).body.log;
    expect(log).toEqual([expect.objectContaining({ kind: "source_removed", subjectKind: "version", subjectId: b.version })]);
  });
});

describe("a wording with no source", () => {
  test("B-03, C-01: 'yes' is refused until a source is added", async () => {
    const id = ids.itemId();
    await api.post(`/api/boards/${b.board}/arguments/${b.argument}/versions`, { as: b.ben, body: { id, wording: "Shift workers can only come on Sundays.", context: "" } });

    expect((await assess(b.ana, id, 1, true)).body).toEqual({ status: "refused", reason: "needs_evidence" });

    await addSource(b.ben, id, { id: ids.itemId(), ...EVIDENCE });

    expect((await assess(b.ana, id, 2, true)).body.status).toBe("done");
    expect(await version(id, b.ana)).toMatchObject({ rev: 2, yes: 1, myAssessment: true });
  });
});

describe("editing a source (Q10)", () => {
  test("C-01: a change to its finding gives every wording that cites it a new revision, so their credibility starts over", async () => {
    await share();
    await assess(b.ben, b.version, 1, true);
    await assess(b.ben, b.otherVersion, 2, true);
    const untouched = ids.itemId();
    await api.post(`/api/boards/${b.board}/arguments/${b.argument}/versions`, { as: b.ben, body: { id: untouched, wording: "Cites nothing.", context: "" } });

    const { body } = await editSource(b.ana, b.source, { ...SEEDED, finding: "61% of weekday visitors can't come on weekdays." });

    expect(body.status).toBe("done");
    expect(await version(b.version, b.ben)).toMatchObject({ rev: 2, yes: 0, myAssessment: null, sourceIds: [b.source] });
    expect(await version(b.otherVersion, b.ben)).toMatchObject({ rev: 3, yes: 0, myAssessment: null, sourceIds: [b.source] });
    expect(await version(untouched)).toMatchObject({ rev: 1 });
    expect(await revision(b.version, 2)).toEqual({ wording: "Sunday is the only free day for many people.", context: "", why: "source_changed" });
    expect(await revision(b.otherVersion, 3)).toMatchObject({ why: "source_changed" });
    expect(await source(b.source)).toMatchObject({ finding: "61% of weekday visitors can't come on weekdays.", changedSeq: body.seq });
    // The old assessments stay, as history.
    expect(await assessments(b.version)).toEqual([{ rev: 1, account_id: b.ben, supported: true }]);
    expect(await assessments(b.otherVersion)).toEqual([{ rev: 2, account_id: b.ben, supported: true }]);
  });

  test("C-01: where to find it is evidence too; a change to it starts credibility over", async () => {
    await assess(b.ben, b.version, 1, true);

    expect((await editSource(b.ana, b.source, { ...SEEDED, locator: "https://example.org/survey" })).body.status).toBe("done");

    expect(await version(b.version)).toMatchObject({ rev: 2, yes: 0 });
  });

  test("C-01: what it backs up and its limits, which the screens no longer ask for, start nothing over", async () => {
    await assess(b.ben, b.version, 1, true);

    expect((await editSource(b.ana, b.source, { ...SEEDED, backsUp: "Most visitors work weekdays.", limits: "One city only." })).body.status).toBe("done");

    expect(await version(b.version, b.ben)).toMatchObject({ rev: 1, yes: 1, myAssessment: true });
    expect(await source(b.source)).toMatchObject({ backsUp: "Most visitors work weekdays.", limits: "One city only." });
  });

  test("C-01: fixing only its name starts nothing over", async () => {
    await share();
    await assess(b.ben, b.version, 1, true);

    const { body } = await editSource(b.ana, b.source, { ...SEEDED, name: "City Library Survey (2025)" });

    expect(body.status).toBe("done");
    expect(await source(b.source)).toMatchObject({ name: "City Library Survey (2025)", changedSeq: body.seq });
    expect(await version(b.version, b.ben)).toMatchObject({ rev: 1, yes: 1, myAssessment: true });
    expect(await version(b.otherVersion)).toMatchObject({ rev: 2 });
  });

  test("C-01: text tidied to what it already says is no change at all", async () => {
    const { body } = await editSource(b.ana, b.source, { ...SEEDED, name: `  ${SEEDED.name} ` });

    expect(body).toEqual({ status: "already_done" });
  });

  test("C-01: a wording that cited it only in an earlier revision, or was deleted, gets no new revision", async () => {
    const second = ids.itemId();
    await api.post(`/api/boards/${b.board}/arguments/${b.argument}/versions`, { as: b.ana, body: { id: second, wording: "Keeps the argument.", context: "" } });
    await cite(b.ana, second, b.source);
    await share();
    await uncite(b.ana, b.otherVersion, b.source); // otherVersion: rev 3, citing nothing
    await api.delete(`/api/boards/${b.board}/versions/${second}`, { as: b.ana }); // second: deleted at rev 2

    await editSource(b.ana, b.source, { ...SEEDED, finding: "Changed." });

    expect(await version(b.version)).toMatchObject({ rev: 2 });
    expect(await version(b.otherVersion)).toMatchObject({ rev: 3 });
    expect(await version(second)).toMatchObject({ rev: 2, deleted: true, wording: null });
    const erased = await db.client.query("select count(*)::int as n from version_revision where version_id = $1 and wording is not null", [second]);
    expect(erased.rows[0].n).toBe(0);
  });

  test("C-01: sent twice, it changes things once", async () => {
    const edit = { ...SEEDED, finding: "61% of weekday visitors can't come on weekdays." };
    await editSource(b.ana, b.source, edit);
    const seq = await boardSeq();

    expect((await editSource(b.ana, b.source, edit)).body).toEqual({ status: "already_done" });
    expect(await boardSeq()).toBe(seq);
    expect(await version(b.version)).toMatchObject({ rev: 2 });
  });

  test("C-01: only the person who added it can edit it", async () => {
    const { status, body } = await editSource(b.ben, b.source, { ...SEEDED, finding: "Mine now." });

    expect(status).toBe(403);
    expect(body).toEqual({ status: "refused", reason: "not_author" });
    expect(await source(b.source)).toMatchObject({ finding: SEEDED.finding });
  });

  test("C-01: it follows the same input limits as adding one", async () => {
    expect((await editSource(b.ana, b.source, { ...SEEDED, name: "" })).status).toBe(400);
    expect((await editSource(b.ana, b.source, { ...SEEDED, id: b.source })).status).toBe(400);
    expect((await editSource(b.ana, "nosuchsource00000000", SEEDED)).status).toBe(404);
  });

  test("M-02, B-03: an assessment of the revision before the source changed is refused, with the wording as it is now", async () => {
    await editSource(b.ana, b.source, { ...SEEDED, finding: "Changed." });

    const { status, body } = await assess(b.ben, b.version, 1, true);

    expect(status).toBe(409);
    expect(body).toMatchObject({ status: "refused", reason: "revision_changed", current: { id: b.version, rev: 2 } });
  });

  test("M-01, C-01: readers asking for changes get the source and every wording it gave a new revision", async () => {
    await share();
    const before = await boardSeq();

    await editSource(b.ana, b.source, { ...SEEDED, finding: "Changed." });

    const changes = (await api.get(`/api/boards/${b.board}/changes?after=${before}`, { as: b.ben })).body;
    expect(changes.sources.map((s: { id: string }) => s.id)).toEqual([b.source]);
    expect(changes.versions.map((v: { id: string }) => v.id).sort()).toEqual([b.version, b.otherVersion].sort());
  });

  test("C-01: it is in the change log, by ID, with no text", async () => {
    const { body } = await editSource(b.ana, b.source, { ...SEEDED, finding: "A finding nobody should find in the log." });

    const log = (await api.get(`/api/boards/${b.board}/changes?after=${body.seq - 1}`, { as: b.ana })).body.log;
    expect(log).toEqual([expect.objectContaining({ kind: "source_edited", subjectKind: "source", subjectId: b.source })]);
    const row = (await db.client.query("select before, after from change where board_id = $1 and seq = $2", [b.board, body.seq])).rows[0];
    expect(JSON.stringify(row)).not.toContain("nobody");
    expect(row.after).toEqual({ revised: [{ version: b.version, rev: 2 }] });
  });
});

describe("an edit of the wording after its sources changed", () => {
  test("A-06, C-01: an edit made before someone added a source still saves, and keeps the new source", async () => {
    const id = ids.itemId();
    await addSource(b.ben, b.version, { id, ...EVIDENCE }); // rev 2, while Ana was editing rev 1

    const { body } = await editWording(b.ana, b.version, 1, "Sunday is the only free day for most shift workers.");

    expect(body.status).toBe("done");
    expect(await version(b.version)).toMatchObject({ rev: 3, wording: "Sunday is the only free day for most shift workers." });
    expect(await cited(b.version)).toEqual([b.source, id].sort());
  });

  test("A-06, C-01: sent twice, around a source being added, it saves one revision", async () => {
    await editWording(b.ana, b.version, 1, "Sharper.");
    await addSource(b.ben, b.version, { id: ids.itemId(), ...EVIDENCE });
    const seq = await boardSeq();

    expect((await editWording(b.ana, b.version, 1, "Sharper.")).body).toEqual({ status: "already_done" });
    expect(await boardSeq()).toBe(seq);
    expect(await version(b.version)).toMatchObject({ rev: 3 });
  });

  test("A-06: an edit made against a revision another edit replaced is still refused", async () => {
    await editWording(b.ana, b.version, 1, "First edit.");
    await addSource(b.ben, b.version, { id: ids.itemId(), ...EVIDENCE });

    const { status, body } = await editWording(b.ana, b.version, 1, "A different edit, from an older tab.");

    expect(status).toBe(409);
    expect(body).toMatchObject({ status: "refused", reason: "revision_changed", current: { rev: 3, wording: "First edit." } });
  });
});

// ---------------------------------------------------------------------------
// Who may do what with sources (plans/architecture.md §7): adding or citing
// one needs Contributor; editing one, or taking it off a wording, is for the
// person who added it (taking off is also for others, tested above). The same
// shape as the role matrix in roles.test.ts.

const PERSONAS = ["owner", "contributor", "voter", "signed out", "non-member"] as const;
type Persona = (typeof PERSONAS)[number];

interface Cast {
  people: Record<Persona, string | undefined>;
  /** A source each persona added, cited on `version`. Signed out added none. */
  own: Record<Persona, string | undefined>;
}

/** An invited-only board with one of each persona. The non-member once added a source, so their own exists. */
async function castBoard(): Promise<Cast> {
  await db.client.query("update board set general_access = 'invited' where id = $1", [b.board]);
  const voter = await addAccount(db.client, ids, "vic", { confirmed: true });
  await addMember(db.client, b.board, voter, "voter");
  const stranger = await addAccount(db.client, ids, "sam", { confirmed: true });
  const people: Cast["people"] = { owner: b.ana, contributor: b.ben, voter, "signed out": undefined, "non-member": stranger };
  const own = { "signed out": undefined } as Cast["own"];
  await write(db.client, b.board, async (seq) => {
    for (const persona of ["owner", "contributor", "voter", "non-member"] as const) {
      const id = ids.itemId();
      await db.client.query(
        `insert into source (id, board_id, name, locator, finding, backs_up, limits, added_by, created_at, changed_seq)
         values ($1, $2, $3, '', 'A finding.', '', '', $4, $5, $6)`,
        [id, b.board, `Added by the ${persona}`, people[persona], NOON, seq],
      );
      await db.client.query("insert into revision_source (version_id, rev, source_id, board_id) values ($1, 1, $2, $3)", [b.version, id, b.board]);
      own[persona] = id;
    }
  });
  return { people, own };
}

const SOURCE_ACTIONS: { name: string; least: "contributor"; run: (cast: Cast, as: string | undefined, persona: Persona) => Promise<{ status: number; body: { reason?: string } }> }[] = [
  { name: "add a source to a wording", least: "contributor", run: (_cast, as) => addSource(as!, b.otherVersion, { id: ids.itemId(), ...EVIDENCE }) },
  { name: "cite a source on another wording", least: "contributor", run: (_cast, as) => cite(as!, b.otherVersion, b.source) },
  { name: "edit a source they added", least: "contributor", run: ({ own }, as, persona) => editSource(as!, own[persona] ?? b.source, { ...SEEDED, finding: "Edited." }) },
  { name: "take a source they added off a wording", least: "contributor", run: ({ own }, as, persona) => uncite(as!, b.version, own[persona] ?? b.source) },
];

function expected(persona: Persona): { status: number; reason?: string } {
  if (persona === "signed out") return { status: 401, reason: "signed_out" };
  if (persona === "non-member") return { status: 403, reason: "no_access" };
  return persona === "voter" ? { status: 403, reason: "not_allowed" } : { status: 200 };
}

describe("the role matrix for sources", () => {
  let cast: Cast;
  beforeEach(async () => {
    cast = await castBoard();
  });

  for (const action of SOURCE_ACTIONS) {
    for (const persona of PERSONAS) {
      const answer = expected(persona);
      test(`C-01, H-03: ${persona === "signed out" ? "someone signed out" : persona === "owner" ? "an owner" : `a ${persona}`} ${answer.status === 200 ? "may" : "may not"} ${action.name}`, async () => {
        const before = await boardSeq();

        const { status, body } = await action.run(cast, cast.people[persona], persona);

        expect(status).toBe(answer.status);
        if (answer.reason) {
          expect(body.reason).toBe(answer.reason);
          expect(await boardSeq()).toBe(before);
        } else {
          expect(await boardSeq()).toBe(before + 1);
        }
      });
    }
  }

  test("C-01, H-03: on a closed board, no one may add, cite, edit, or take off a source", async () => {
    await db.client.query("update board set closed_at = now() where id = $1", [b.board]);

    for (const persona of ["owner", "contributor"] as const) {
      for (const action of SOURCE_ACTIONS) {
        expect((await action.run(cast, cast.people[persona], persona)).body.reason, `${persona}: ${action.name}`).toBe("board_closed");
      }
    }
  });
});
