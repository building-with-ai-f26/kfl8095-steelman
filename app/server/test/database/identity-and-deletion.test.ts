import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, asRole, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// Invariant 4 (plans/architecture.md §2): a version's ID never changes.
// Invariant 6: deleted and hidden items keep their place. (Erasing a deleted
// wording's text in the same transaction is the write path's job, Q24.)

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(303);
let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

describe("invariant 4: a version's ID never changes", () => {
  test("A-04, M-06: changing a version's ID is refused", async () => {
    const rename = write(db.client, b.board, (seq) => db.client.query("update version set id = $2, changed_seq = $3 where id = $1", [b.version, ids.itemId(), seq]));

    await expect(rename).rejects.toThrow(/foreign key/);
  });

  test("M-06: so is changing an argument's, an option's, or a board's", async () => {
    const rename = (table: string, id: string) =>
      write(db.client, b.board, (seq) => db.client.query(`update ${table} set id = $2, changed_seq = $3 where id = $1`, [id, ids.itemId(), seq]));

    await expect(rename("argument", b.argument)).rejects.toThrow(/foreign key/);
    await expect(rename("option", b.yes)).rejects.toThrow(/foreign key/);
    await expect(db.client.query("update board set id = $2 where id = $1", [b.board, ids.boardId()])).rejects.toThrow(/foreign key/);
  });

  test("A-04: moving a wording to another argument keeps its revisions, votes, assessments, and sources attached", async () => {
    await write(db.client, b.board, async () => {
      await db.client.query("insert into articulation_vote (version_id, account_id, board_id, value, voted_at) values ($1, $2, $3, 1, $4)", [b.version, b.ben, b.board, NOON]);
      await db.client.query("insert into assessment (version_id, rev, account_id, board_id, supported, assessed_at) values ($1, 1, $2, $3, true, $4)", [b.version, b.ben, b.board, NOON]);
    });

    await write(db.client, b.board, (seq) => db.client.query("update version set argument_id = $2, changed_seq = $3 where id = $1", [b.version, b.otherArgument, seq]));

    const attached = await db.client.query(
      `select (select argument_id from version where id = $1) as argument,
              (select count(*)::int from version_revision where version_id = $1) as revisions,
              (select count(*)::int from articulation_vote where version_id = $1) as votes,
              (select count(*)::int from assessment where version_id = $1) as assessments,
              (select count(*)::int from revision_source where version_id = $1) as citations`,
      [b.version],
    );
    expect(attached.rows[0]).toEqual({ argument: b.otherArgument, revisions: 1, votes: 1, assessments: 1, citations: 1 });
  });

  test("A-10: an argument can be marked as combined into another on its board, and keeps its row", async () => {
    await write(db.client, b.board, (seq) => db.client.query("update argument set merged_into = $2, changed_seq = $3 where id = $1", [b.argument, b.otherArgument, seq]));

    const kept = await db.client.query("select merged_into from argument where id = $1", [b.argument]);
    expect(kept.rows).toEqual([{ merged_into: b.otherArgument }]);
  });
});

describe("invariant 6: deleted and hidden items keep their place", () => {
  test("A-06, J-02: the service's database role can't remove a row of content", async () => {
    for (const table of ["version", "argument", "option", "source", "version_revision", "board"]) {
      await expect(asRole(db.client, "steelman_app", () => db.client.query(`delete from ${table}`))).rejects.toThrow(/permission denied/);
    }
  });

  test("A-06: deleting a wording can erase every revision's text, and its row stays", async () => {
    await write(db.client, b.board, async (seq) => {
      await db.client.query("update version_revision set wording = null, context = null where version_id = $1", [b.version]);
      await db.client.query("update version set deleted_at = $2, changed_seq = $3 where id = $1", [b.version, NOON, seq]);
    });

    const left = await db.client.query(
      "select v.deleted_at is not null as deleted, r.wording, r.context from version v join version_revision r on r.version_id = v.id where v.id = $1",
      [b.version],
    );
    expect(left.rows).toEqual([{ deleted: true, wording: null, context: null }]);
  });

});
