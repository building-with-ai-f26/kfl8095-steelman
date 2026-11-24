// Board settings (M3b-2, I-01): the Owner renames the board's question. One
// write through the write path, safe to send twice (invariant 10): the
// question it already has changes nothing. Its change row says only that the
// question was renamed, never what to (invariant 7), so History says who and
// when, and the question itself is read from the board.

import { writeToBoard } from "./write-path.ts";
import type { Services, WriteResult } from "./write-path.ts";

export function renameQuestion({ db, clock }: Services, boardId: string, person: string | null, question: string): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "settings",
    load: async (trx) => (await trx.selectFrom("board").select("question").where("id", "=", boardId).executeTakeFirst()) ?? null,
    async change(trx, board, seq) {
      if (board.question === question) return "already_done";
      await trx.updateTable("board").set({ question }).where("id", "=", boardId).execute();
      await trx.insertInto("change").values({ board_id: boardId, seq, at: clock.now(), actor_id: person!, kind: "question_renamed", subject_kind: "board", subject_id: boardId }).execute();
      return "done";
    },
  });
}
