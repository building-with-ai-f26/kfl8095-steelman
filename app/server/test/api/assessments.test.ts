import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Credibility assessments (B-03): "does the cited evidence support this
// wording, as worded?" An assessment names the revision the person read
// (invariant 3); "yes" needs evidence (invariant 5). Both are the service's
// to check (Q24).

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(403);
let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const assess = (who: string, rev: number, supported: boolean | null, version = b.version) =>
  api.put(`/api/boards/${b.board}/versions/${version}/assessment`, { as: who, body: { rev, supported } });
const counts = async (id = b.version) => (await db.client.query("select yes, no from version where id = $1", [id])).rows[0];
const boardSeq = async () => Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);

/** Saves revision 2 of the seeded wording, citing the same source, the way an edit will. */
const reviseWording = () =>
  write(db.client, b.board, async (seq) => {
    await db.client.query(
      "insert into version_revision (version_id, board_id, rev, wording, context, why, created_by, created_at) values ($1, $2, 2, 'Sunday is the only free day for most shift workers.', '', 'edited', $3, $4)",
      [b.version, b.board, b.ana, NOON],
    );
    await db.client.query("insert into revision_source (version_id, rev, source_id, board_id) values ($1, 2, $2, $3)", [b.version, b.source, b.board]);
    await db.client.query("update version set current_rev = 2, yes = 0, no = 0, changed_seq = $2 where id = $1", [b.version, seq]);
  });

describe("assessing the current revision", () => {
  test("B-03: 'yes' with an available cited source counts", async () => {
    const { status, body } = await assess(b.ben, 1, true);

    expect(status).toBe(200);
    expect(body).toEqual({ status: "done", seq: await boardSeq() });
    expect(await counts()).toEqual({ yes: 1, no: 0 });
  });

  test("B-03: 'no' counts, and needs no source", async () => {
    await assess(b.ben, 1, false, b.otherVersion);

    expect(await counts(b.otherVersion)).toEqual({ yes: 0, no: 1 });
  });

  test("B-03: changing an assessment replaces it; withdrawing removes it", async () => {
    await assess(b.ben, 1, true);
    await assess(b.ana, 1, true);
    await assess(b.ben, 1, false);
    expect(await counts()).toEqual({ yes: 1, no: 1 });

    await assess(b.ana, 1, null);
    expect(await counts()).toEqual({ yes: 0, no: 1 });
  });

  test("B-03: the same assessment sent twice is the same as once", async () => {
    await assess(b.ben, 1, true);
    const seq = await boardSeq();

    expect((await assess(b.ben, 1, true)).body).toEqual({ status: "already_done" });
    expect(await boardSeq()).toBe(seq);
    expect(await counts()).toEqual({ yes: 1, no: 0 });
  });

  test("B-03: an assessment must say which revision it judged", async () => {
    const missing = await api.put(`/api/boards/${b.board}/versions/${b.version}/assessment`, { as: b.ben, body: { supported: true } });

    expect(missing.status).toBe(400);
  });
});

describe("'yes' needs evidence (invariant 5)", () => {
  test("B-03: 'yes' on a wording that cites no source is refused", async () => {
    const { status, body } = await assess(b.ben, 1, true, b.otherVersion);

    expect(status).toBe(409);
    expect(body).toEqual({ status: "refused", reason: "needs_evidence" });
    expect(await counts(b.otherVersion)).toEqual({ yes: 0, no: 0 });
  });

  test("B-03: 'yes' is refused when the only cited source is marked unavailable", async () => {
    await write(db.client, b.board, (seq) =>
      db.client.query("update source set unavailable_at = $2, unavailable_by = $3, changed_seq = $4 where id = $1", [b.source, NOON, b.ben, seq]),
    );

    expect((await assess(b.ben, 1, true)).body).toEqual({ status: "refused", reason: "needs_evidence" });
  });

  test("B-03: changing a 'no' to 'yes' is held to the same rule", async () => {
    await assess(b.ben, 1, false, b.otherVersion);

    expect((await assess(b.ben, 1, true, b.otherVersion)).body).toEqual({ status: "refused", reason: "needs_evidence" });
    expect(await counts(b.otherVersion)).toEqual({ yes: 0, no: 1 });
  });
});

describe("an assessment of a revision that is no longer current (invariant 3)", () => {
  test("B-03: is refused, and the answer carries the wording as it is now", async () => {
    await reviseWording();

    const { status, body } = await assess(b.ben, 1, true);

    expect(status).toBe(409);
    expect(body.status).toBe("refused");
    expect(body.reason).toBe("revision_changed");
    expect(body.current).toMatchObject({ id: b.version, rev: 2, wording: "Sunday is the only free day for most shift workers." });
    expect(await counts()).toEqual({ yes: 0, no: 0 });
  });

  test("B-03: only assessments of the current revision count; old ones stay as history", async () => {
    await assess(b.ben, 1, true);
    await reviseWording();
    await assess(b.ana, 2, false);

    expect(await counts()).toEqual({ yes: 0, no: 1 });
    const history = await db.client.query("select rev, account_id from assessment where version_id = $1 order by rev", [b.version]);
    expect(history.rows).toEqual([
      { rev: 1, account_id: b.ben },
      { rev: 2, account_id: b.ana },
    ]);
  });

  test("B-03: a revision that never existed is refused the same way", async () => {
    expect((await assess(b.ben, 5, false)).body).toMatchObject({ status: "refused", reason: "revision_changed" });
  });
});

describe("assessing what can't be assessed", () => {
  test("B-03: a deleted wording", async () => {
    await write(db.client, b.board, async (seq) => {
      await db.client.query("update version_revision set wording = null, context = null where version_id = $1", [b.version]);
      await db.client.query("update version set deleted_at = $2, changed_seq = $3 where id = $1", [b.version, NOON, seq]);
    });

    expect((await assess(b.ben, 1, false)).body).toEqual({ status: "refused", reason: "version_deleted" });
  });

  test("B-03: anything on a closed board", async () => {
    await db.client.query("update board set closed_at = $2 where id = $1", [b.board, NOON]);

    expect((await assess(b.ben, 1, false)).body).toEqual({ status: "refused", reason: "board_closed" });
  });
});
