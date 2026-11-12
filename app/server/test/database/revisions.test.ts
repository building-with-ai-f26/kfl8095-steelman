import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, asRole, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// Invariant 2 (plans/architecture.md §2): credibility belongs to a revision,
// by structure: an assessment is keyed to the revision it judged.
// Invariant 3: writes name what they were made against.
//
// Refusing an assessment of an old revision, and a "yes" with no evidence
// (invariant 5), are the service's job (Q24); M0-4's API tests cover them.

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(302);
let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const assess = (version: string, rev: number, who: string, supported: boolean) =>
  write(db.client, b.board, () =>
    db.client.query("insert into assessment (version_id, rev, account_id, board_id, supported, assessed_at) values ($1, $2, $3, $4, $5, $6)", [
      version,
      rev,
      who,
      b.board,
      supported,
      NOON,
    ]),
  );

/** Saves revision 2 of the seeded wording the way an edit does. */
const edit = (changes: { yes?: number; no?: number } = {}) =>
  write(db.client, b.board, async (seq) => {
    await db.client.query(
      "insert into version_revision (version_id, board_id, rev, wording, context, why, created_by, created_at) values ($1, $2, 2, 'Sunday is the only free day for most shift workers.', '', 'edited', $3, $4)",
      [b.version, b.board, b.ana, NOON],
    );
    await db.client.query("update version set current_rev = 2, yes = $2, no = $3, changed_seq = $4 where id = $1", [b.version, changes.yes ?? 0, changes.no ?? 0, seq]);
  });

describe("invariant 2: credibility belongs to a revision", () => {
  test("B-03: an assessment of the current revision is accepted", async () => {
    await edit();
    await assess(b.version, 2, b.ben, false);

    const saved = await db.client.query("select rev, supported from assessment where version_id = $1", [b.version]);
    expect(saved.rows).toEqual([{ rev: 2, supported: false }]);
  });

  test("B-03: old assessments stay as history when the wording changes", async () => {
    await assess(b.version, 1, b.ben, true);
    await edit();

    const saved = await db.client.query("select rev, supported from assessment where version_id = $1", [b.version]);
    expect(saved.rows).toEqual([{ rev: 1, supported: true }]);
  });

  test("A-06: a version can't point at a revision that was never saved", async () => {
    const skip = write(db.client, b.board, (seq) => db.client.query("update version set current_rev = 2, changed_seq = $2 where id = $1", [b.version, seq]));

    await expect(skip).rejects.toThrow(/foreign key/);
  });

  test("C-01: the service's database role can't remove or change a citation", async () => {
    await expect(asRole(db.client, "steelman_app", () => db.client.query("delete from revision_source where version_id = $1", [b.version]))).rejects.toThrow(/permission denied/);
    await expect(asRole(db.client, "steelman_app", () => db.client.query("update revision_source set rev = 2 where version_id = $1", [b.version]))).rejects.toThrow(/permission denied/);
  });
});

describe("invariant 3: writes name what they were made against", () => {
  test("B-03: an assessment of a revision that doesn't exist is refused", async () => {
    await expect(assess(b.version, 7, b.ben, false)).rejects.toThrow(/foreign key/);
  });

  test("B-01, B-02: a vote on something that doesn't exist is refused", async () => {
    const ghost = ids.itemId();
    const importance = () => write(db.client, b.board, () =>
      db.client.query("insert into importance_vote (argument_id, account_id, board_id, value, voted_at) values ($1, $2, $3, 1, $4)", [ghost, b.ben, b.board, NOON]),
    );
    const articulation = () => write(db.client, b.board, () =>
      db.client.query("insert into articulation_vote (version_id, account_id, board_id, value, voted_at) values ($1, $2, $3, 1, $4)", [ghost, b.ben, b.board, NOON]),
    );

    await expect(importance()).rejects.toThrow(/foreign key/);
    await expect(articulation()).rejects.toThrow(/foreign key/);
  });
});

