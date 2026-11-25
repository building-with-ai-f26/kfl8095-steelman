// The list (E-03, M2-7): the boards a person is a member of, including those
// they came into by the link (access.ts records them as members the first
// time they open the board). Someone the link let in is removed when the
// owner turns the link off, so the board leaves their list with them.
//
// "When it last changed" is the latest of every write's own time: the board's
// creation, the change log (edits, deletions, sources, access), new arguments
// and wordings, the votes and assessments as they stand, and each comment's
// times: added, resolved, and deleted (M3b-10), since comments add nothing to
// the change log. A vote that was withdrawn leaves no time behind, so it
// doesn't count, and nor does reopening a thread, which clears its resolved
// time. A comment counts even when its wording or option has gone since.

import { sql } from "kysely";
import { ROLES, closingOf } from "@steelman/shared";
import type { BoardListing, Clock, Role } from "@steelman/shared";
import type { Db } from "./db/database.ts";

export async function listBoards(db: Db, clock: Clock, person: string): Promise<{ now: string; boards: BoardListing[] }> {
  const boards = await sql<{ id: string; question: string; role: string; owner: string; changed_at: Date; closed_at: Date | null; closes_at: Date | null }>`
    select b.id, b.question, m.role, owner.username as owner, b.closed_at, b.closes_at,
      greatest(
        b.created_at,
        (select max(at) from change where board_id = b.id),
        (select max(created_at) from argument where board_id = b.id),
        (select max(created_at) from version where board_id = b.id),
        (select max(voted_at) from importance_vote where board_id = b.id),
        (select max(voted_at) from articulation_vote where board_id = b.id),
        (select max(assessed_at) from assessment where board_id = b.id),
        (select max(greatest(created_at, resolved_at, deleted_at)) from comment where board_id = b.id)
      ) as changed_at
    from board_member m
    join board b on b.id = m.board_id
    -- Its owner: the maker, or whoever it was handed to when they deleted their account (M-07).
    join account owner on owner.id = b.created_by
    where m.account_id = ${person}
      and b.deleted_at is null
      and m.role = any(${[...ROLES]})
    order by changed_at desc, b.created_at desc, b.id`.execute(db);

  const ids = boards.rows.map((board) => board.id);
  const options =
    ids.length === 0
      ? []
      : await db
          .selectFrom("option as o")
          .leftJoin("argument as a", (join) => join.onRef("a.option_id", "=", "o.id").onRef("a.board_id", "=", "o.board_id").on("a.deleted_at", "is", null).on("a.merged_into", "is", null))
          .select(["o.board_id", "o.name", (eb) => eb.fn.count<string>("a.id").as("arguments")])
          .where("o.board_id", "in", ids)
          .where("o.deleted_at", "is", null)
          .groupBy(["o.board_id", "o.id", "o.name", "o.position"])
          .orderBy("o.position")
          .execute();

  return {
    now: clock.now().toISOString(),
    boards: boards.rows.map((board) => ({
      id: board.id,
      question: board.question,
      options: options.filter((option) => option.board_id === board.id).map((option) => ({ name: option.name, arguments: Number(option.arguments) })),
      role: board.role as Role,
      owner: board.owner,
      changedAt: new Date(board.changed_at).toISOString(),
      // Only for a board that's closed or has a closing time (M3b-3), so other listings keep their shape.
      ...closingKey(board, clock),
    })),
  };
}

function closingKey(board: { closed_at: Date | null; closes_at: Date | null }, clock: Clock): Pick<BoardListing, "closing"> {
  const closing = closingOf({ closedAt: board.closed_at && new Date(board.closed_at), closesAt: board.closes_at && new Date(board.closes_at) }, clock.now());
  return closing ? { closing } : {};
}
