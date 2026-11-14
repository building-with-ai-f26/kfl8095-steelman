// Making a board (F-01, M1-6). The service chooses its ID: the ID is the
// board's link, and for a board open to anyone with the link, the link is the
// permission, so it must be unguessable (72 random bits, shared/src/ids.ts).
//
// Its creator is its Owner. Unless they choose otherwise on the sheet, a new
// board is open to anyone with the link, as Contributor (the builder's
// decision, Nov 14): sharing it is sending the link. The owner can change
// that later from the pill under the question (server/src/sharing.ts).
//
// It isn't safe to send twice the way other writes are (invariant 10): a
// second request makes a second, empty board. The sheet sends it once and
// waits for the answer.

import { sql } from "kysely";
import type { Clock, IdSource, NewBoard } from "@steelman/shared";
import type { Db } from "./db/database.ts";

/** Makes the board in one transaction and returns its ID. Only the local seed passes `id`, for its example boards' fixed links. */
export async function createBoard(db: Db, clock: Clock, ids: IdSource, person: string, board: NewBoard, id = ids.boardId()): Promise<string> {
  const now = clock.now();
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("board")
      .values({
        id,
        question: board.question,
        created_by: person,
        created_at: now,
        general_access: board.access?.general ?? "link",
        link_role: board.access?.linkRole ?? "contributor",
      })
      .execute();
    await trx.insertInto("board_member").values({ board_id: id, account_id: person, role: "owner", joined_via: "invite", joined_at: now }).execute();
    // Its first change: the options, and the change log's record that it was made.
    const seq = Number((await sql<{ seq: string }>`select take_change_number(${id}) as seq`.execute(trx)).rows[0]!.seq);
    await trx
      .insertInto("option")
      .values(board.options.map((name, index) => ({ id: ids.itemId(), board_id: id, name, position: index + 1, created_at: now, changed_seq: seq })))
      .execute();
    await trx
      .insertInto("change")
      .values({ board_id: id, seq, at: now, actor_id: person, kind: "board_created", subject_kind: "board", subject_id: id })
      .execute();
  });
  return id;
}
