import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, asRole, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// Invariant 7 (plans/architecture.md §2): the change log never copies what
// people wrote.
// Invariant 8: the change log is append-only.

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(304);
let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const log = (row: { kind?: string; subjectKind?: string; before?: unknown; after?: unknown }) =>
  write(db.client, b.board, (seq) =>
    db.client.query(
      `insert into change (board_id, seq, at, actor_id, kind, subject_kind, subject_id, before, after)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [b.board, seq, NOON, b.ana, row.kind ?? "version_edited", row.subjectKind ?? "version", b.version, JSON.stringify(row.before ?? {}), JSON.stringify(row.after ?? {})],
    ),
  );

describe("invariant 7: the change log points at things, and never copies what people wrote", () => {
  test("M-01, J-03: a change row holding IDs and numbers is accepted", async () => {
    await log({ before: { rev: 1 }, after: { rev: 2, sources: [b.source], argument: b.argument } });

    const rows = await db.client.query("select kind, after from change where board_id = $1", [b.board]);
    expect(rows.rows).toEqual([{ kind: "version_edited", after: { rev: 2, sources: [b.source], argument: b.argument } }]);
  });

  test("M-01, J-03: a change row holding a wording is refused", async () => {
    await expect(log({ before: { wording: "Sunday is the only free day for many people." } })).rejects.toThrow(/check constraint/);
    await expect(log({ after: { nested: { deep: ["Staff need a day off."] } } })).rejects.toThrow(/check constraint/);
  });

});

describe("invariant 8: the change log is append-only", () => {
  beforeEach(async () => {
    await log({ after: { rev: 2 } });
  });

  test("M-01, J-03: the service's database role can add a change row", async () => {
    await asRole(db.client, "steelman_app", () =>
      write(db.client, b.board, (seq) =>
        db.client.query(
          "insert into change (board_id, seq, at, actor_id, kind, subject_kind, subject_id) values ($1, $2, $3, $4, 'version_deleted', 'version', $5)",
          [b.board, seq, NOON, b.ana, b.version],
        ),
      ),
    );

    const rows = await db.client.query("select count(*)::int as n from change where board_id = $1", [b.board]);
    expect(rows.rows[0].n).toBe(2);
  });

  test("M-01, J-03: it can't change one", async () => {
    await expect(asRole(db.client, "steelman_app", () => db.client.query("update change set kind = 'version_deleted' where board_id = $1", [b.board]))).rejects.toThrow(/permission denied/);
    await expect(asRole(db.client, "steelman_app", () => db.client.query("update change set actor_id = $2 where board_id = $1", [b.board, b.ben]))).rejects.toThrow(/permission denied/);
  });

  test("M-01, J-03: it can't remove one", async () => {
    await expect(asRole(db.client, "steelman_app", () => db.client.query("delete from change where board_id = $1", [b.board]))).rejects.toThrow(/permission denied/);
    await expect(asRole(db.client, "steelman_app", () => db.client.query("truncate change"))).rejects.toThrow(/permission denied/);
  });

  test("M-07: the account-deletion role can scrub who did it, and nothing else", async () => {
    const deletion = <T>(work: () => Promise<T>) => asRole(db.client, "steelman_account_deletion", work);

    await deletion(() => db.client.query("update change set actor_id = $2, before = '{}', after = '{}' where board_id = $1", [b.board, b.ben]));
    const scrubbed = await db.client.query("select actor_id from change where board_id = $1", [b.board]);
    expect(scrubbed.rows).toEqual([{ actor_id: b.ben }]);

    await expect(deletion(() => db.client.query("update change set kind = 'version_deleted' where board_id = $1", [b.board]))).rejects.toThrow(/permission denied/);
    await expect(deletion(() => db.client.query("delete from change where board_id = $1", [b.board]))).rejects.toThrow(/permission denied/);
  });
});
