import { beforeAll, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// Invariant 1 (plans/architecture.md §2): one judgment per person per target.
// Invariant 10: every write is safe to send twice.

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(301);
let b: SeededBoard;
beforeAll(async () => {
  b = await seedBoard(db.client, ids);
});

describe("invariant 1: one judgment per person per target", () => {
  test("B-01, M-01: a second importance vote by the same person on the same argument is refused", async () => {
    const vote = "insert into importance_vote (argument_id, account_id, board_id, value, voted_at) values ($1, $2, $3, 1, $4)";
    await write(db.client, b.board, () => db.client.query(vote, [b.argument, b.ana, b.board, NOON]));

    await expect(write(db.client, b.board, () => db.client.query(vote, [b.argument, b.ana, b.board, NOON]))).rejects.toThrow(/duplicate key/);
  });

  test("B-02, M-01: a second articulation vote by the same person on the same wording is refused", async () => {
    const vote = "insert into articulation_vote (version_id, account_id, board_id, value, voted_at) values ($1, $2, $3, -1, $4)";
    await write(db.client, b.board, () => db.client.query(vote, [b.version, b.ana, b.board, NOON]));

    await expect(write(db.client, b.board, () => db.client.query(vote, [b.version, b.ana, b.board, NOON]))).rejects.toThrow(/duplicate key/);
  });

  test("B-03, M-01: a second assessment by the same person of the same revision is refused", async () => {
    const assess = "insert into assessment (version_id, rev, account_id, board_id, supported, assessed_at) values ($1, 1, $2, $3, false, $4)";
    await write(db.client, b.board, () => db.client.query(assess, [b.version, b.ana, b.board, NOON]));

    await expect(write(db.client, b.board, () => db.client.query(assess, [b.version, b.ana, b.board, NOON]))).rejects.toThrow(/duplicate key/);
  });

  test("B-01: a vote is +1 or −1, nothing else", async () => {
    const vote = (value: number) =>
      write(db.client, b.board, () =>
        db.client.query("insert into importance_vote (argument_id, account_id, board_id, value, voted_at) values ($1, $2, $3, $4, $5)", [
          b.otherArgument,
          b.ben,
          b.board,
          value,
          NOON,
        ]),
      );

    await expect(vote(2)).rejects.toThrow(/check constraint/);
    await expect(vote(0)).rejects.toThrow(/check constraint/);
  });

  test("B-01, B-02: two different people may vote on the same thing", async () => {
    await write(db.client, b.board, () =>
      db.client.query("insert into importance_vote (argument_id, account_id, board_id, value, voted_at) values ($1, $2, $3, -1, $4)", [b.argument, b.ben, b.board, NOON]),
    );

    const votes = await db.client.query("select count(*)::int as n from importance_vote where argument_id = $1", [b.argument]);
    expect(votes.rows[0].n).toBe(2);
  });
});

describe("invariant 10: sending a write twice is the same as sending it once", () => {
  test("B-01: 'set my vote to +1', sent twice, leaves one vote of +1", async () => {
    const setVote = `insert into importance_vote (argument_id, account_id, board_id, value, voted_at) values ($1, $2, $3, 1, $4)
                     on conflict (argument_id, account_id) do update set value = excluded.value, voted_at = excluded.voted_at`;
    await write(db.client, b.board, () => db.client.query(setVote, [b.otherArgument, b.ana, b.board, NOON]));
    await write(db.client, b.board, () => db.client.query(setVote, [b.otherArgument, b.ana, b.board, NOON]));

    const votes = await db.client.query("select value from importance_vote where argument_id = $1 and account_id = $2", [b.otherArgument, b.ana]);
    expect(votes.rows).toEqual([{ value: 1 }]);
  });

  test("A-03: an argument sent again with the ID the browser gave it is refused as already there", async () => {
    const again = () =>
      write(db.client, b.board, (seq) =>
        db.client.query(
          "insert into argument (id, board_id, option_id, created_by, created_at, created_seq, changed_seq) values ($1, $2, $3, $4, $5, $6, $6)",
          [b.argument, b.board, b.yes, b.ana, NOON, seq],
        ),
      );

    await expect(again()).rejects.toThrow(/duplicate key/);
  });

  test("A-05, C-01: so are a wording and a source", async () => {
    await expect(
      write(db.client, b.board, (seq) =>
        db.client.query(
          "insert into version (id, board_id, argument_id, author_id, created_at, created_seq, current_rev, changed_seq) values ($1, $2, $3, $4, $5, $6, 1, $6)",
          [b.version, b.board, b.argument, b.ana, NOON, seq],
        ),
      ),
    ).rejects.toThrow(/duplicate key/);
    await expect(
      write(db.client, b.board, (seq) =>
        db.client.query(
          "insert into source (id, board_id, name, locator, finding, backs_up, limits, added_by, created_at, changed_seq) values ($1, $2, 'n', '', 'f', '', '', $3, $4, $5)",
          [b.source, b.board, b.ana, NOON, seq],
        ),
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  test("A-06: an edit sent again finds its revision already saved", async () => {
    const fresh = await seedBoard(db.client, ids);
    const edit = () =>
      write(db.client, fresh.board, async (seq) => {
        await db.client.query(
          "insert into version_revision (version_id, board_id, rev, wording, context, why, created_by, created_at) values ($1, $2, 2, 'Sharper.', '', 'edited', $3, $4)",
          [fresh.version, fresh.board, fresh.ana, NOON],
        );
        await db.client.query("update version set current_rev = 2, changed_seq = $2 where id = $1", [fresh.version, seq]);
      });
    await edit();

    await expect(edit()).rejects.toThrow(/duplicate key/);
  });
});
