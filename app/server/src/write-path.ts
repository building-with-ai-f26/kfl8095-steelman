// The one write path (plans/architecture.md §4). Every change to a board goes
// through `writeToBoard`, which does the same six things in one transaction:
//
//   1. lock:  take the board's next change number (this also locks it, so
//             writes to one board take turns and commit in number order);
//   2. load:  read what the write refers to;
//   3. can(): ask the policy whether this person, with their role on the
//             board, may do it;
//   4. stale: refuse it if what it was made against has changed;
//   5. change it,
//   6. stamping every row it touches with the change number.
//
// Each kind of write supplies only steps 2, 4, and 5. A write that is
// refused, or turns out to be already done, is rolled back, so it uses up no
// change number and readers see nothing.

import { sql } from "kysely";
import type { Transaction } from "kysely";
import { can } from "@steelman/shared";
import type { Action, Clock, RefusalReason, VersionRow, WriteAnswer } from "@steelman/shared";
import { entryTo } from "./access.ts";
import type { Database, Db } from "./db/database.ts";

export type Trx = Transaction<Database>;

/** What every kind of write is handed. */
export interface Services {
  db: Db;
  clock: Clock;
}

/** What a write's own steps can conclude. */
export type Outcome = "done" | "already_done" | { refused: RefusalReason; current?: VersionRow };

export interface WriteSteps<Loaded> {
  action: Action;
  /** Step 2. Null when the thing isn't on this board. */
  load(trx: Trx): Promise<Loaded | null>;
  /** For actions only an author may take. */
  authorOf?(loaded: Loaded): string;
  /** Step 4: why the write is stale, if it is. */
  stale?(trx: Trx, loaded: Loaded): Promise<Outcome | null>;
  /** Steps 5 and 6: make the change, stamping each row with `seq`. */
  change(trx: Trx, loaded: Loaded, seq: number): Promise<Outcome>;
}

export type WriteResult = WriteAnswer | { status: "not_found" };

/** Thrown inside the transaction to roll it back with an answer. */
class RollBack extends Error {
  constructor(readonly answer: WriteResult) {
    super("rolled back");
  }
}

export async function writeToBoard<Loaded>(db: Db, boardId: string, person: string | null, steps: WriteSteps<Loaded>): Promise<WriteResult> {
  try {
    return await db.transaction().execute(async (trx) => {
      // 1. Lock.
      const taken = await sql<{ seq: string }>`select take_change_number(${boardId}) as seq`.execute(trx);
      const seq = Number(taken.rows[0]!.seq);
      const board = await trx.selectFrom("board").select("closed_at").where("id", "=", boardId).executeTakeFirstOrThrow();

      // 2. Load.
      const loaded = await steps.load(trx);
      if (loaded === null) throw new RollBack({ status: "not_found" });

      // 3. May they? (Someone who gets in by the link is recorded as a member when they open the board, not here.)
      const { role } = await entryTo(trx, boardId, person);
      const refusal = can(person, role, steps.action, { closed: board.closed_at !== null }, steps.authorOf?.(loaded));
      if (refusal) throw new RollBack({ status: "refused", reason: refusal });

      // 4. Stale?
      const stale = await steps.stale?.(trx, loaded);
      if (stale) throw new RollBack(answerFor(stale, seq));

      // 5 and 6. Change and stamp.
      const outcome = await steps.change(trx, loaded, seq);
      if (outcome !== "done") throw new RollBack(answerFor(outcome, seq));
      return { status: "done", seq };
    });
  } catch (error) {
    if (error instanceof RollBack) return error.answer;
    throw error;
  }
}

function answerFor(outcome: Outcome, seq: number): WriteAnswer {
  if (outcome === "done") return { status: "done", seq };
  if (outcome === "already_done") return { status: "already_done" };
  return outcome.current ? { status: "refused", reason: outcome.refused, current: outcome.current } : { status: "refused", reason: outcome.refused };
}
