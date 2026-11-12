import { beforeAll, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// "A row can only point at rows of the same board (the foreign keys include
// board_id). So 'scoped to one board' is something the database checks, not
// only the code." (plans/architecture.md §2, "On every row")

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(306);
let a: SeededBoard;
let b: SeededBoard;
beforeAll(async () => {
  a = await seedBoard(db.client, ids);
  b = await seedBoard(db.client, ids);
});

describe("a row can only point at rows of its own board", () => {
  test("M-01: an argument can't sit under another board's option", async () => {
    const stray = write(db.client, a.board, (seq) =>
      db.client.query("insert into argument (id, board_id, option_id, created_by, created_at, created_seq, changed_seq) values ($1, $2, $3, $4, $5, $6, $6)", [
        ids.itemId(),
        a.board,
        b.yes,
        a.ana,
        NOON,
        seq,
      ]),
    );

    await expect(stray).rejects.toThrow(/foreign key/);
  });

  test("M-01: a wording can't be moved under another board's argument", async () => {
    const stray = write(db.client, a.board, (seq) => db.client.query("update version set argument_id = $2, changed_seq = $3 where id = $1", [a.version, b.argument, seq]));

    await expect(stray).rejects.toThrow(/foreign key/);
  });

  test("M-01: a row can't move to another board", async () => {
    const move = write(db.client, b.board, (seq) => db.client.query("update argument set board_id = $2, option_id = $3, changed_seq = $4 where id = $1", [a.argument, b.board, b.yes, seq]));

    await expect(move).rejects.toThrow(/another board|foreign key/);
  });

  test("M-01: an argument can't be combined into another board's argument", async () => {
    const stray = write(db.client, a.board, (seq) => db.client.query("update argument set merged_into = $2, changed_seq = $3 where id = $1", [a.argument, b.argument, seq]));

    await expect(stray).rejects.toThrow(/foreign key/);
  });

  test("C-01: a wording can't cite another board's source", async () => {
    const stray = write(db.client, a.board, () =>
      db.client.query("insert into revision_source (version_id, rev, source_id, board_id) values ($1, 1, $2, $3)", [a.otherVersion, b.source, a.board]),
    );

    await expect(stray).rejects.toThrow(/foreign key/);
  });

  test("B-01, B-02, B-03: a vote filed under the wrong board is refused", async () => {
    const importance = () => write(db.client, b.board, () =>
      db.client.query("insert into importance_vote (argument_id, account_id, board_id, value, voted_at) values ($1, $2, $3, 1, $4)", [a.argument, a.ben, b.board, NOON]),
    );
    const articulation = () => write(db.client, b.board, () =>
      db.client.query("insert into articulation_vote (version_id, account_id, board_id, value, voted_at) values ($1, $2, $3, 1, $4)", [a.version, a.ben, b.board, NOON]),
    );
    const assessment = () => write(db.client, b.board, () =>
      db.client.query("insert into assessment (version_id, rev, account_id, board_id, supported, assessed_at) values ($1, 1, $2, $3, false, $4)", [a.version, a.ben, b.board, NOON]),
    );

    await expect(importance()).rejects.toThrow(/foreign key/);
    await expect(articulation()).rejects.toThrow(/foreign key/);
    await expect(assessment()).rejects.toThrow(/foreign key/);
  });
});
