// Closing a board (M3b-3, I-05): the Owner closes it now, sets or clears a
// moment it closes, and reopens it, as Google Forms stops taking responses
// and Google Classroom closes work at a due time. Each is one write through
// the write path, safe to send twice (invariant 10), with a change row that
// holds no text (invariant 7): a closing time is kept in it as a number.
//
// `closed_at` means closed by hand; `closes_at` is the chosen moment. Nothing
// is written when that moment passes: closedSince asks the clock. Reopening
// clears a closing time that has passed and keeps one still ahead, as the
// prototype does. All three are allowed on a closed board (the `close` rule).

import { closedSince, closingOf } from "@steelman/shared";
import type { Closing } from "@steelman/shared";
import type { Db } from "./db/database.ts";
import { writeToBoard } from "./write-path.ts";
import type { Services, Trx, WriteResult } from "./write-path.ts";

const loadBoard = (boardId: string) => async (trx: Trx) =>
  (await trx.selectFrom("board").select(["closed_at", "closes_at"]).where("id", "=", boardId).executeTakeFirst()) ?? null;

const datesOf = (board: { closed_at: Date | null; closes_at: Date | null }) => ({ closedAt: board.closed_at, closesAt: board.closes_at });

/** Closes the board now. A board already closed, by hand or by its time, is already done. */
export function closeBoard({ db, clock }: Services, boardId: string, person: string | null): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "close",
    load: loadBoard(boardId),
    async change(trx, board, seq) {
      const now = clock.now();
      if (closedSince(datesOf(board), now)) return "already_done";
      await trx.updateTable("board").set({ closed_at: now }).where("id", "=", boardId).execute();
      await trx.insertInto("change").values({ board_id: boardId, seq, at: now, actor_id: person!, kind: "board_closed", subject_kind: "board", subject_id: boardId }).execute();
      return "done";
    },
  });
}

/** Reopens the board: it's no longer closed by hand, and a closing time that has passed is cleared. An open board is already done. */
export function reopenBoard({ db, clock }: Services, boardId: string, person: string | null): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "close",
    load: loadBoard(boardId),
    async change(trx, board, seq) {
      const now = clock.now();
      if (!closedSince(datesOf(board), now)) return "already_done";
      const passed = board.closes_at !== null && board.closes_at.getTime() <= now.getTime();
      await trx
        .updateTable("board")
        .set({ closed_at: null, ...(passed ? { closes_at: null } : {}) })
        .where("id", "=", boardId)
        .execute();
      await trx.insertInto("change").values({ board_id: boardId, seq, at: now, actor_id: person!, kind: "board_reopened", subject_kind: "board", subject_id: boardId }).execute();
      return "done";
    },
  });
}

/**
 * Sets the moment the board closes, or clears it with null. The route refuses a moment that isn't ahead of now, so
 * Close now is the way to close at once. The same moment again, or clearing none, is already done.
 */
export function setClosingTime({ db, clock }: Services, boardId: string, person: string | null, closesAt: Date | null): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "close",
    load: loadBoard(boardId),
    async change(trx, board, seq) {
      if ((board.closes_at?.getTime() ?? null) === (closesAt?.getTime() ?? null)) return "already_done";
      await trx.updateTable("board").set({ closes_at: closesAt }).where("id", "=", boardId).execute();
      await trx
        .insertInto("change")
        .values({
          board_id: boardId,
          seq,
          at: clock.now(),
          actor_id: person!,
          kind: closesAt ? "closing_date_set" : "closing_date_cleared",
          subject_kind: "board",
          subject_id: boardId,
          // The change log holds no text (invariant 7), so the moment is kept as a number.
          ...(closesAt ? { after: JSON.stringify({ at: closesAt.getTime() }) } : {}),
        })
        .execute();
      return "done";
    },
  });
}

/**
 * What a reader is told about the board's closing, or undefined when it's open with no closing time.
 * @param now The same moment the rest of the answer was read at, so the two can't disagree.
 */
export async function closingFor(db: Db, now: Date, boardId: string): Promise<Closing | undefined> {
  const board = await db.selectFrom("board").select(["closed_at", "closes_at"]).where("id", "=", boardId).executeTakeFirst();
  return board ? closingOf(datesOf(board), now) : undefined;
}
