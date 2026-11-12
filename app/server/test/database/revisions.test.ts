import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, asRole, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// Invariant 2 (plans/architecture.md §2): credibility belongs to a revision.
// Invariant 3: writes name what they were made against.
// Invariant 5: "supported" needs evidence.

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
  test("B-03: an assessment of an old revision is refused", async () => {
    await edit();

    await expect(assess(b.version, 1, b.ben, false)).rejects.toThrow(/current revision/);
  });

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

  test("B-03: a new revision can't carry the old revision's yes and no counts", async () => {
    await assess(b.version, 1, b.ben, true);

    await expect(edit({ yes: 1 })).rejects.toThrow(/start over/);
    await expect(edit({ no: 1 })).rejects.toThrow(/start over/);
  });

  test("A-06: a wording can't be rewritten in place, only replaced by a new revision", async () => {
    const rewrite = write(db.client, b.board, () =>
      db.client.query("update version_revision set wording = 'Something else entirely.' where version_id = $1 and rev = 1", [b.version]),
    );

    await expect(rewrite).rejects.toThrow(/can't be rewritten/);
  });

  test("A-06: revisions go up one at a time and never back", async () => {
    await edit();
    const set = (rev: number) =>
      write(db.client, b.board, (seq) => db.client.query("update version set current_rev = $2, yes = 0, no = 0, changed_seq = $3 where id = $1", [b.version, rev, seq]));

    await expect(set(1)).rejects.toThrow(/one at a time/);
    await expect(set(4)).rejects.toThrow(/one at a time/);
  });

  test("A-06: a version can't point at a revision that was never saved", async () => {
    const skip = write(db.client, b.board, (seq) => db.client.query("update version set current_rev = 2, changed_seq = $2 where id = $1", [b.version, seq]));

    await expect(skip).rejects.toThrow(/foreign key/);
  });

  test("A-06: a revision can't be saved ahead of the one its version is on", async () => {
    const ahead = write(db.client, b.board, () =>
      db.client.query(
        "insert into version_revision (version_id, board_id, rev, wording, context, why, created_by, created_at) values ($1, $2, 3, 'Too far.', '', 'edited', $3, $4)",
        [b.version, b.board, b.ana, NOON],
      ),
    );

    await expect(ahead).rejects.toThrow(/ahead/);
  });

  test("C-01: the sources of a revision someone has assessed can't be added to", async () => {
    await assess(b.version, 1, b.ben, true);
    const cite = write(db.client, b.board, async (seq) => {
      const another = ids.itemId();
      await db.client.query(
        "insert into source (id, board_id, name, locator, finding, backs_up, limits, added_by, created_at, changed_seq) values ($1, $2, 'Another', '', 'Finding.', '', '', $3, $4, $5)",
        [another, b.board, b.ana, NOON, seq],
      );
      await db.client.query("insert into revision_source (version_id, rev, source_id, board_id) values ($1, 1, $2, $3)", [b.version, another, b.board]);
    });

    await expect(cite).rejects.toThrow(/already been assessed/);
  });

  test("C-01: the service's database role can't remove or change a citation", async () => {
    await expect(asRole(db.client, "steelman_app", () => db.client.query("delete from revision_source where version_id = $1", [b.version]))).rejects.toThrow(/permission denied/);
    await expect(asRole(db.client, "steelman_app", () => db.client.query("update revision_source set rev = 2 where version_id = $1", [b.version]))).rejects.toThrow(/permission denied/);
  });
});

describe("invariant 3: writes name what they were made against", () => {
  test("B-03: an assessment of a revision that doesn't exist is refused", async () => {
    await expect(assess(b.version, 7, b.ben, false)).rejects.toThrow(/current revision|foreign key/);
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

describe("invariant 5: 'supported' needs evidence", () => {
  test("B-03: 'yes' on a wording with no cited source is refused", async () => {
    await expect(assess(b.otherVersion, 1, b.ben, true)).rejects.toThrow(/needs at least one cited source/);
  });

  test("B-03: 'yes' is refused when the only cited source is marked unavailable", async () => {
    await write(db.client, b.board, (seq) =>
      db.client.query("update source set unavailable_at = $2, unavailable_by = $3, changed_seq = $4 where id = $1", [b.source, NOON, b.ben, seq]),
    );

    await expect(assess(b.version, 1, b.ben, true)).rejects.toThrow(/needs at least one cited source/);
  });

  test("B-03: 'yes' with an available cited source is accepted", async () => {
    await assess(b.version, 1, b.ben, true);

    const saved = await db.client.query("select supported from assessment where version_id = $1", [b.version]);
    expect(saved.rows).toEqual([{ supported: true }]);
  });

  test("B-03: 'no' needs no source", async () => {
    await assess(b.otherVersion, 1, b.ben, false);

    const saved = await db.client.query("select supported from assessment where version_id = $1", [b.otherVersion]);
    expect(saved.rows).toEqual([{ supported: false }]);
  });

  test("B-03: changing a 'no' to 'yes' is held to the same rule", async () => {
    await assess(b.otherVersion, 1, b.ben, false);
    const flip = write(db.client, b.board, () =>
      db.client.query("update assessment set supported = true where version_id = $1 and account_id = $2", [b.otherVersion, b.ben]),
    );

    await expect(flip).rejects.toThrow(/needs at least one cited source/);
  });
});
