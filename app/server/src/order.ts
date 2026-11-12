// Publishing the shared order, lazily (plans/architecture.md §3). There is no
// timer: whenever a browser reads the board, this checks whether a new order
// is due, and if so saves it before answering. A new one is saved only when
//
//   1. the last published order is older than the board's tick, and
//   2. the votes (or what's on the board) now give a different order.
//
// Only the newest order is kept, one row per board, stamped like any other
// row a reader is sent.

import { sql } from "kysely";
import type { Kysely } from "kysely";
import { nextBoardOrder } from "@steelman/shared";
import type { BoardCounts, BoardOrder, Clock, Ranked } from "@steelman/shared";
import type { Database, Db } from "./db/database.ts";

type Reader = Kysely<Database>;

export async function publishOrderIfDue(db: Db, clock: Clock, boardId: string): Promise<void> {
  // First without the lock: on most requests nothing is due, and readers
  // shouldn't make writers wait.
  if (!(await candidateIfDue(db, clock, boardId))) return;

  await db.transaction().execute(async (trx) => {
    // Then again under the board's lock, in case another request published it meanwhile.
    const taken = await sql<{ seq: string }>`select take_change_number(${boardId}) as seq`.execute(trx);
    const candidate = await candidateIfDue(trx, clock, boardId);
    // Nothing to do after all: throwing rolls back, so the number taken is undone.
    if (!candidate) throw new NothingToPublish();
    const row = {
      board_id: boardId,
      computed_at: clock.now(),
      arguments: JSON.stringify(candidate.arguments),
      versions: JSON.stringify(candidate.versions),
      changed_seq: Number(taken.rows[0]!.seq),
    };
    await trx
      .insertInto("published_order")
      .values(row)
      .onConflict((conflict) => conflict.column("board_id").doUpdateSet({ computed_at: row.computed_at, arguments: row.arguments, versions: row.versions, changed_seq: row.changed_seq }))
      .execute();
  }).catch((error: unknown) => {
    if (!(error instanceof NothingToPublish)) throw error;
  });
}

class NothingToPublish extends Error {}

/** The order to publish now, or null if none is due. */
async function candidateIfDue(db: Reader, clock: Clock, boardId: string): Promise<BoardOrder | null> {
  const board = await db.selectFrom("board").select("tick_seconds").where("id", "=", boardId).executeTakeFirst();
  if (!board) return null;
  const saved = await db.selectFrom("published_order").select(["computed_at", "arguments", "versions"]).where("board_id", "=", boardId).executeTakeFirst();
  const previous: BoardOrder = saved ? { arguments: saved.arguments as BoardOrder["arguments"], versions: saved.versions as BoardOrder["versions"] } : { arguments: {}, versions: {} };

  if (saved && clock.now().getTime() < saved.computed_at.getTime() + board.tick_seconds * 1000) return null;
  const candidate = nextBoardOrder(previous, await boardCounts(db, boardId));
  if (saved && sameOrder(candidate, previous)) return null;
  return candidate;
}

/** Everything that takes part in the order, with its counts, in the order it was added. */
async function boardCounts(db: Reader, boardId: string): Promise<BoardCounts> {
  const options = await db.selectFrom("option").select("id").where("board_id", "=", boardId).where("deleted_at", "is", null).orderBy("position").execute();
  const args = await db
    .selectFrom("argument")
    .select(["id", "option_id", "importance", "importance_voters"])
    .where("board_id", "=", boardId)
    .where("deleted_at", "is", null)
    .where("merged_into", "is", null)
    .orderBy("created_seq")
    .orderBy("id")
    .execute();
  const versions = await db
    .selectFrom("version")
    .select(["id", "argument_id", "articulation", "articulation_voters"])
    .where("board_id", "=", boardId)
    .where("deleted_at", "is", null)
    .where("hidden_at", "is", null)
    .orderBy("created_seq")
    .orderBy("id")
    .execute();

  const counts: BoardCounts = { arguments: {}, versions: {} };
  const argumentsByOption: Record<string, Ranked[]> = Object.fromEntries(options.map((option) => [option.id, []]));
  const versionsByArgument: Record<string, Ranked[]> = {};
  for (const argument of args) {
    argumentsByOption[argument.option_id]?.push({ id: argument.id, score: argument.importance, voters: argument.importance_voters });
    versionsByArgument[argument.id] = [];
  }
  for (const version of versions) {
    versionsByArgument[version.argument_id]?.push({ id: version.id, score: version.articulation, voters: version.articulation_voters });
  }
  counts.arguments = argumentsByOption;
  counts.versions = versionsByArgument;
  return counts;
}

function sameOrder(a: BoardOrder, b: BoardOrder): boolean {
  const sameLists = (x: Record<string, string[]>, y: Record<string, string[]>) => {
    const keys = Object.keys(x);
    if (keys.length !== Object.keys(y).length) return false;
    return keys.every((key) => {
      const left = x[key];
      const right = y[key];
      return right !== undefined && left !== undefined && left.length === right.length && left.every((id, i) => id === right[i]);
    });
  };
  return sameLists(a.arguments, b.arguments) && sameLists(a.versions, b.versions);
}
