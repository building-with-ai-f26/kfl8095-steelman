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
//
// New steelman's Space menu (G-05, M3d-19) starts a board in a space its
// maker is in, in the same transaction, so it is never left outside its
// space, or open more widely than its maker chose, by a second write that
// failed. A space they aren't in, or one that was deleted, is refused as no
// space, as putting a board in a space is (sharing.ts's setBoardSpace), and
// nothing is made. The change row names the space by its ID (invariant 7).
//
// In a public space, only its Admins and its Owner start a board (M3d-34,
// the policy's space_post; security review F1), as GitHub lets an
// organization keep repository creation to its owners. A Member who tries is
// refused as "space_admins_post", and nothing is made. In a private space,
// any member still may.

import { sql } from "kysely";
import { canInSpace, postingIn } from "@steelman/shared";
import type { Clock, IdSource, NewBoard } from "@steelman/shared";
import type { Db } from "./db/database.ts";
import { asSpaceRole } from "./spaces.ts";

/** Thrown when the space a new board names isn't one its maker is in; the transaction rolls back and nothing is made. */
export class NoSpace extends Error {
  constructor() {
    super("no_space");
  }
}

/** Thrown when a Member names a public space, where only its Admins and Owner start a board (M3d-34); nothing is made. */
export class SpaceAdminsPost extends Error {
  constructor() {
    super("space_admins_post");
  }
}

/** Makes the board in one transaction and returns its ID. Only the local seed passes `id`, for its example boards' fixed links. */
export async function createBoard(db: Db, clock: Clock, ids: IdSource, person: string, board: NewBoard, id = ids.boardId()): Promise<string> {
  const now = clock.now();
  await db.transaction().execute(async (trx) => {
    if (board.space !== undefined) {
      const mine = await trx
        .selectFrom("space_member as sm")
        .innerJoin("space as s", "s.id", "sm.space_id")
        .select(["sm.role", "s.visibility"])
        .where("sm.space_id", "=", board.space)
        .where("sm.account_id", "=", person)
        .where("s.deleted_at", "is", null)
        .executeTakeFirst();
      if (!mine || canInSpace(person, asSpaceRole(mine.role), "space_read") !== null) throw new NoSpace();
      if (canInSpace(person, asSpaceRole(mine.role), postingIn(mine.visibility)) !== null) throw new SpaceAdminsPost();
    }
    await trx
      .insertInto("board")
      .values({
        id,
        question: board.question,
        created_by: person,
        created_at: now,
        general_access: board.access?.general ?? "link",
        link_role: board.access?.linkRole ?? "contributor",
        ...(board.space !== undefined ? { space_id: board.space } : {}),
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
      .values({ board_id: id, seq, at: now, actor_id: person, kind: "board_created", subject_kind: "board", subject_id: id, ...(board.space !== undefined ? { after: JSON.stringify({ space: board.space }) } : {}) })
      .execute();
  });
  return id;
}
