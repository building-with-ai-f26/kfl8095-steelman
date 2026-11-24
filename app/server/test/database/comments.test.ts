import { beforeAll, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, asRole, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// The comment table (M3b-8, D-01; plans/architecture.md §2): what the
// database itself holds true, whatever the code does. A comment belongs to
// one board and points only at rows of that board; it has one target or none
// (the question); every write is stamped; and the service can't remove one
// (invariant 6).

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(3802);
let a: SeededBoard;
let b: SeededBoard;
beforeAll(async () => {
  a = await seedBoard(db.client, ids);
  b = await seedBoard(db.client, ids);
});

interface Comment {
  board: string;
  option?: string | null;
  version?: string | null;
  parent?: string | null;
}

const insert = (seq: string, c: Comment, id = ids.itemId()) =>
  db.client
    .query(
      `insert into comment (id, board_id, option_id, version_id, parent_id, author_id, body, created_at, changed_seq)
       values ($1, $2, $3, $4, $5, $6, 'A note.', $7, $8)`,
      [id, c.board, c.option ?? null, c.version ?? null, c.parent ?? null, c.board === a.board ? a.ben : b.ben, NOON, seq],
    )
    .then(() => id);

describe("the comment table", () => {
  test("D-01, M-01: a comment on the question, an option, or a wording of its own board is accepted", async () => {
    await write(db.client, a.board, async (seq) => {
      await insert(seq, { board: a.board });
      await insert(seq, { board: a.board, option: a.yes });
      await insert(seq, { board: a.board, version: a.version });
    });
  });

  test("D-01, M-01: a comment can't point at another board's version, option, or parent", async () => {
    const theirs = await write(db.client, b.board, (seq) => insert(seq, { board: b.board }));
    for (const stray of [{ version: b.version }, { option: b.yes }, { parent: theirs }]) {
      await expect(write(db.client, a.board, (seq) => insert(seq, { board: a.board, ...stray })), JSON.stringify(stray)).rejects.toThrow(/foreign key/);
    }
  });

  test("D-01, M-01: a comment can't have two targets", async () => {
    await expect(write(db.client, a.board, (seq) => insert(seq, { board: a.board, option: a.yes, version: a.version }))).rejects.toThrow(/check constraint|violates/);
  });

  test("D-01, M-02: an unstamped write is refused", async () => {
    await expect(insert("0", { board: a.board })).rejects.toThrow(/change number/);
    const id = await write(db.client, a.board, (seq) => insert(seq, { board: a.board }));
    await expect(db.client.query("update comment set body = 'Changed.' where id = $1", [id])).rejects.toThrow(/change number/);
  });

  test("D-01, M-01: the service's role can't delete a comment's row", async () => {
    const id = await write(db.client, a.board, (seq) => insert(seq, { board: a.board }));

    await expect(asRole(db.client, "steelman_app", () => db.client.query("delete from comment where id = $1", [id]))).rejects.toThrow(/permission denied/);
  });

  test("D-01, M-02: comments are indexed by board and change number, for live updates", async () => {
    const indexes = await db.client.query("select indexdef from pg_indexes where schemaname = 'public' and tablename = 'comment'");

    expect(indexes.rows.some((row) => /\(board_id, changed_seq\)/.test(row.indexdef))).toBe(true);
  });
});
