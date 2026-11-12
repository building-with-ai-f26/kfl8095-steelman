import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, seedBoard, takeChangeNumber, transaction, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// Invariant 9 (plans/architecture.md §2): every write takes the board's next
// change number and stamps the rows it touched, in one transaction. This is
// what makes "everything stamped after N" safe to ask: a reader who has seen
// change N can never later be handed a change numbered N or lower.

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(305);
let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const lastSeq = async () => (await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq as string;

const insertArgument = (seq: string | number) =>
  db.client.query("insert into argument (id, board_id, option_id, created_by, created_at, created_seq, changed_seq) values ($1, $2, $3, $4, $5, $6, $6)", [
    ids.itemId(),
    b.board,
    b.yes,
    b.ana,
    NOON,
    seq,
  ]);

describe("invariant 9: every write takes the board's next change number and stamps its rows", () => {
  test("M-02: taking a number moves the board's counter up by one", async () => {
    const before = Number(await lastSeq());
    const taken = await write(db.client, b.board, async (seq) => seq);

    expect(Number(taken)).toBe(before + 1);
    expect(Number(await lastSeq())).toBe(before + 1);
  });

  test("M-02: a row added without taking a change number is refused", async () => {
    await expect(transaction(db.client, async () => insertArgument(await lastSeq()))).rejects.toThrow(/take .* next change number/);
  });

  test("M-02: a row stamped with any number but the one just taken is refused", async () => {
    await expect(write(db.client, b.board, (seq) => insertArgument(Number(seq) - 1))).rejects.toThrow(/must be stamped/);
    await expect(write(db.client, b.board, (seq) => insertArgument(Number(seq) + 1))).rejects.toThrow(/must be stamped/);
  });

  test("M-02: changing a row without restamping it is refused (the skipped stamp)", async () => {
    const quiet = write(db.client, b.board, () => db.client.query("update argument set importance = 1, importance_voters = 1 where id = $1", [b.argument]));

    await expect(quiet).rejects.toThrow(/must be stamped/);
  });

  test("M-02: every kind of row a reader is sent is held to it", async () => {
    const unstamped = (sql: string, id: string) => transaction(db.client, () => db.client.query(sql, [id]));

    await expect(unstamped("update option set name = 'Maybe' where id = $1", b.yes)).rejects.toThrow(/next change number/);
    await expect(unstamped("update version set articulation = 1, articulation_voters = 1 where id = $1", b.version)).rejects.toThrow(/next change number/);
    await expect(unstamped("update source set name = 'Renamed' where id = $1", b.source)).rejects.toThrow(/next change number/);
  });

  test("B-01, B-02, B-03: a vote can't be saved outside a write that took a change number", async () => {
    const vote = () => transaction(db.client, () =>
      db.client.query("insert into importance_vote (argument_id, account_id, board_id, value, voted_at) values ($1, $2, $3, 1, $4)", [b.argument, b.ben, b.board, NOON]),
    );
    const assess = () => transaction(db.client, () =>
      db.client.query("insert into assessment (version_id, rev, account_id, board_id, supported, assessed_at) values ($1, 1, $2, $3, false, $4)", [b.version, b.ben, b.board, NOON]),
    );

    await expect(vote()).rejects.toThrow(/next change number/);
    await expect(assess()).rejects.toThrow(/next change number/);
  });

  test("B-02: an articulation vote is held to it as well", async () => {
    const vote = transaction(db.client, () =>
      db.client.query("insert into articulation_vote (version_id, account_id, board_id, value, voted_at) values ($1, $2, $3, 1, $4)", [b.version, b.ben, b.board, NOON]),
    );

    await expect(vote).rejects.toThrow(/next change number/);
  });

  test("A-06, C-01: a revision or a citation can't be saved outside a write that took a change number", async () => {
    const revise = () =>
      transaction(db.client, () =>
        db.client.query(
          "insert into version_revision (version_id, board_id, rev, wording, context, why, created_by, created_at) values ($1, $2, 2, 'Sharper.', '', 'edited', $3, $4)",
          [b.version, b.board, b.ana, NOON],
        ),
      );
    const cite = () =>
      transaction(db.client, () => db.client.query("insert into revision_source (version_id, rev, source_id, board_id) values ($1, 1, $2, $3)", [b.otherVersion, b.source, b.board]));

    await expect(revise()).rejects.toThrow(/next change number/);
    await expect(cite()).rejects.toThrow(/next change number/);
  });

  test("B-05: the saved shared order is stamped like any other row readers are sent", async () => {
    const save = (stamp: (seq: string) => number) =>
      write(db.client, b.board, (seq) =>
        db.client.query(
          `insert into published_order (board_id, computed_at, arguments, versions, changed_seq) values ($1, $2, $3, $4, $5)
           on conflict (board_id) do update set computed_at = excluded.computed_at, arguments = excluded.arguments, versions = excluded.versions, changed_seq = excluded.changed_seq`,
          [b.board, NOON, JSON.stringify({ [b.yes]: [b.argument] }), JSON.stringify({ [b.argument]: [b.version] }), stamp(seq)],
        ),
      );

    await save((seq) => Number(seq));
    await save((seq) => Number(seq));
    await expect(save((seq) => Number(seq) - 1)).rejects.toThrow(/must be stamped/);

    // One row per board, replaced each time. The refused save rolled back, counter and all.
    const saved = await db.client.query("select count(*)::int as n, max(changed_seq) = (select last_seq from board where id = $1) as newest from published_order where board_id = $1", [b.board]);
    expect(saved.rows[0]).toEqual({ n: 1, newest: true });
  });

  test("B-01: withdrawing a vote is a write too", async () => {
    await write(db.client, b.board, () =>
      db.client.query("insert into importance_vote (argument_id, account_id, board_id, value, voted_at) values ($1, $2, $3, 1, $4)", [b.argument, b.ben, b.board, NOON]),
    );

    await expect(transaction(db.client, () => db.client.query("delete from importance_vote where argument_id = $1", [b.argument]))).rejects.toThrow(/next change number/);
  });

  test("M-02: a number taken for one board doesn't cover a write to another", async () => {
    const other = await seedBoard(db.client, ids);
    const crossed = write(db.client, other.board, (seq) => db.client.query("update option set name = 'Maybe', changed_seq = $2 where id = $1", [b.yes, seq]));

    await expect(crossed).rejects.toThrow(/next change number/);
  });

  test("M-02: a number taken in one transaction doesn't carry into the next", async () => {
    const seq = await write(db.client, b.board, async (taken) => taken);

    await expect(transaction(db.client, () => insertArgument(seq))).rejects.toThrow(/next change number/);
  });

  test("M-02: the counter can't be set back, or jumped forward", async () => {
    await expect(db.client.query("update board set last_seq = last_seq - 1 where id = $1", [b.board])).rejects.toThrow(/one at a time/);
    await expect(db.client.query("update board set last_seq = 0 where id = $1", [b.board])).rejects.toThrow(/one at a time/);
    await expect(db.client.query("update board set last_seq = last_seq + 5 where id = $1", [b.board])).rejects.toThrow(/one at a time/);
  });

  test("M-02: a change-log row carries the number its write took", async () => {
    const wrong = write(db.client, b.board, (seq) =>
      db.client.query("insert into change (board_id, seq, at, actor_id, kind, subject_kind, subject_id) values ($1, $2, $3, $4, 'version_deleted', 'version', $5)", [
        b.board,
        Number(seq) + 1,
        NOON,
        b.ana,
        b.version,
      ]),
    );

    await expect(wrong).rejects.toThrow(/must be numbered/);
  });

  test("A-03: a new row records the change number it was added at, for good", async () => {
    const added = await db.client.query("select created_seq, changed_seq from argument where id = $1", [b.argument]);
    expect(added.rows[0].created_seq).toBe(added.rows[0].changed_seq);

    const backdate = (table: string, id: string) =>
      write(db.client, b.board, (seq) => db.client.query(`update ${table} set created_seq = 0, changed_seq = $2 where id = $1`, [id, seq]));
    await expect(backdate("argument", b.argument)).rejects.toThrow(/added at/);
    await expect(backdate("version", b.version)).rejects.toThrow(/added at/);
  });

  test("M-02: taking a number for a board that doesn't exist is refused", async () => {
    await expect(takeChangeNumber(db.client, "nosuchboard1")).rejects.toThrow(/No such board/);
  });
});

describe("invariant 9: writes to one board take turns", () => {
  let second: pg.Client;
  beforeAll(async () => {
    second = new pg.Client({ connectionString: db.url });
    await second.connect();
  });
  afterAll(async () => {
    await second.end();
  });

  test("M-02: a second write waits for the first to finish, then gets the next number", async () => {
    await db.client.query("begin");
    const first = Number(await takeChangeNumber(db.client, b.board));

    await second.query("begin");
    const secondPid = (await second.query("select pg_backend_pid() as pid")).rows[0].pid;
    let secondTook: number | undefined;
    const waiting = takeChangeNumber(second, b.board).then((seq) => {
      secondTook = Number(seq);
    });

    // Watch from a third connection until Postgres reports the second write is waiting on a lock.
    const watcher = new pg.Client({ connectionString: db.url });
    await watcher.connect();
    let blocked = false;
    for (let attempt = 0; attempt < 5000 && !blocked; attempt++) {
      const state = await watcher.query("select wait_event_type from pg_stat_activity where pid = $1", [secondPid]);
      blocked = state.rows[0]?.wait_event_type === "Lock";
    }
    await watcher.end();
    expect(blocked).toBe(true);
    expect(secondTook).toBeUndefined();

    await db.client.query("commit");
    await waiting;
    await second.query("commit");

    expect(secondTook).toBe(first + 1);
  });
});
