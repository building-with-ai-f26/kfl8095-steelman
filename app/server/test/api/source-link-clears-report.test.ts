import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, addAccount, addMember, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Fixing a reported source's link clears the report (C-02; the builder,
// Nov 22), as a Wikipedia editor removes a dead-link tag when fixing the
// link. Only the person who added a source edits it, so they clear a report
// someone else made by changing where the source is found. A change to its
// name or its finding leaves the report standing. The change log allows one
// row per write, so the edit's own row says that it cleared the report.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(2211);
let b: SeededBoard;
let val: string;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  val = await addAccount(db.client, ids, "val", { confirmed: true });
  await addMember(db.client, b.board, val, "viewer");
});

/** The seeded source as it is, so an edit changes only what a test names. Ana added it, and `b.version` is the only wording that cites it. */
const SEEDED = { name: "City library survey, 2025", locator: "", finding: "Most weekday visitors can't come on weekdays.", backsUp: "", limits: "" };
const FIXED = { ...SEEDED, locator: "https://example.org/survey" };

const boardSeq = async () => Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);
const source = async (as: string = b.ana) => (await api.get(`/api/boards/${b.board}`, { as })).body.sources.find((s: { id: string }) => s.id === b.source);
const marked = async () => (await db.client.query("select unavailable_at, unavailable_by from source where id = $1", [b.source])).rows[0];
const report = (who: string) => api.put(`/api/boards/${b.board}/sources/${b.source}/unavailable`, { as: who });
const editSource = (who: string, body: Record<string, unknown>) => api.put(`/api/boards/${b.board}/sources/${b.source}`, { as: who, body });
const assess = (who: string, rev: number) => api.put(`/api/boards/${b.board}/versions/${b.version}/assessment`, { as: who, body: { rev, supported: true } });
const changes = async (seq: number) => (await db.client.query("select kind, subject_id, actor_id, after from change where board_id = $1 and seq = $2", [b.board, seq])).rows;

describe("fixing a reported source's link", () => {
  test("C-02: a change to a reported source's link clears the report, and another reader's next poll shows the source without one", async () => {
    await report(val);
    const after = await boardSeq();

    const { status, body } = await editSource(b.ana, FIXED);

    expect(status).toBe(200);
    expect(body).toEqual({ status: "done", seq: after + 1 });
    expect(await marked()).toEqual({ unavailable_at: null, unavailable_by: null });
    expect(await source()).toMatchObject({ locator: FIXED.locator, unavailable: false });
    expect((await source()).report).toBeUndefined();
    const poll = (await api.get(`/api/boards/${b.board}/changes?after=${after}`, { as: b.ben })).body;
    expect(poll.sources).toEqual([expect.objectContaining({ id: b.source, locator: FIXED.locator, unavailable: false })]);
    expect(poll.sources[0].report).toBeUndefined();
  });

  test("C-02: a change to its name, its finding, what it backs up, or its limits leaves the report standing", async () => {
    await report(val);

    expect((await editSource(b.ana, { ...SEEDED, name: "City Library Survey (2025)" })).body).toMatchObject({ status: "done" });
    expect((await editSource(b.ana, { ...SEEDED, name: "City Library Survey (2025)", finding: "61% of weekday visitors can't come on weekdays." })).body).toMatchObject({ status: "done" });
    expect((await editSource(b.ana, { ...SEEDED, name: "City Library Survey (2025)", finding: "61% of weekday visitors can't come on weekdays.", backsUp: "Most visitors work weekdays.", limits: "One city only." })).body).toMatchObject({ status: "done" });

    expect(await source()).toMatchObject({ unavailable: true, report: { by: val, at: new Date(NOON).toISOString() } });
    expect(await marked()).toMatchObject({ unavailable_by: val });
  });

  test("C-02, J-03: the edit is one change row, which says it cleared the report only when it did", async () => {
    // A link changed on a source nobody reported: nothing to clear.
    const unreported = (await editSource(b.ana, FIXED)).body.seq;
    expect(await changes(unreported)).toEqual([{ kind: "source_edited", subject_id: b.source, actor_id: b.ana, after: { revised: [{ version: b.version, rev: 2 }] } }]);

    // A reported source's name changed: the report stands.
    await report(val);
    const renamed = (await editSource(b.ana, { ...FIXED, name: "City Library Survey (2025)" })).body.seq;
    expect(await changes(renamed)).toEqual([{ kind: "source_edited", subject_id: b.source, actor_id: b.ana, after: { revised: [] } }]);

    // Its link changed: the same row says so.
    const fixed = (await editSource(b.ana, { ...FIXED, name: "City Library Survey (2025)", locator: "https://example.org/survey-2025" })).body.seq;
    expect(await changes(fixed)).toEqual([{ kind: "source_edited", subject_id: b.source, actor_id: b.ana, after: { revised: [{ version: b.version, rev: 3 }], cleared: true } }]);
    expect(fixed).toBe(await boardSeq());
  });

  test("C-02, B-03: a wording whose only source was reported can be assessed as supported again once the link is fixed", async () => {
    await report(val);
    expect((await assess(b.ben, 1)).body).toEqual({ status: "refused", reason: "needs_evidence" });

    await editSource(b.ana, FIXED);

    // The link is evidence, so the wording is at revision 2 (Q10).
    expect((await assess(b.ben, 2)).body).toMatchObject({ status: "done" });
    const version = (await api.get(`/api/boards/${b.board}`, { as: b.ben })).body.versions.find((v: { id: string }) => v.id === b.version);
    expect(version).toMatchObject({ rev: 2, yes: 1, myAssessment: true });
  });

  test("C-02: anyone can report it again afterwards, and the same edit sent again doesn't clear the new report", async () => {
    await report(val);
    await editSource(b.ana, FIXED);

    expect((await report(b.ben)).body).toMatchObject({ status: "done" });
    expect(await source()).toMatchObject({ unavailable: true, report: { by: b.ben } });

    const before = await boardSeq();
    expect((await editSource(b.ana, FIXED)).body).toEqual({ status: "already_done" });
    expect(await boardSeq()).toBe(before);
    expect(await source()).toMatchObject({ unavailable: true, report: { by: b.ben } });
  });

  test("C-02, M-07: Download your data keeps the report, and says it no longer stands", async () => {
    await report(val);
    await editSource(b.ana, FIXED);
    const at = new Date(NOON).toISOString();

    expect((await api.get("/api/account/data", { as: val })).body.sourceReports).toEqual([{ board: b.board, source: b.source, at, standing: false }]);

    await report(val);
    expect((await api.get("/api/account/data", { as: val })).body.sourceReports).toEqual([
      { board: b.board, source: b.source, at, standing: false },
      { board: b.board, source: b.source, at, standing: true },
    ]);
  });

  test("C-02, H-03: someone who didn't add the source can't clear a report by editing it", async () => {
    await report(val);

    expect((await editSource(b.ben, FIXED)).body).toEqual({ status: "refused", reason: "not_author" });

    expect(await source()).toMatchObject({ locator: "", unavailable: true, report: { by: val } });
  });
});
