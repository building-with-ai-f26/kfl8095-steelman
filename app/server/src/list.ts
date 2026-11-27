// The list (E-03, M2-7): the boards a person is a member of, including those
// they came into by the link (access.ts records them as members the first
// time they open the board). Someone the link let in is removed when the
// owner turns the link off, so the board leaves their list with them.
//
// It also holds the boards shared with everyone in a space the person is in
// (G-05, M3d-18), at the role the space gives them, without an invitation,
// as access.ts's spaceBoards finds them. A board they also have a role on is
// listed once, at their own role. Leaving the space, or being removed from
// it, takes those boards out of the list at once.
//
// "When it last changed" is the latest of every write's own time: the board's
// creation, the change log (edits, deletions, sources, access), new arguments
// and wordings, the votes and assessments as they stand, and each comment's
// times: added, resolved, and deleted (M3b-10), since comments add nothing to
// the change log. A vote that was withdrawn leaves no time behind, so it
// doesn't count, and nor does reopening a thread, which clears its resolved
// time. A comment counts even when its wording or option has gone since.
//
// Each board also lists its open comment count and when it was made (M3d-13,
// E-03 to E-05). The count is the board's speech-bubble rule (openCount in
// shared/src/comments.ts) over the comments read.ts sends a reader: replies
// count, and deleted comments, resolved threads, and comments whose wording
// is deleted or hidden or whose option is deleted don't. A comment a
// moderator hid still counts, as it does on the board, so the count is the
// same for every reader. Nothing is stored for it: it's read each time.
//
// A board in a space names that space by its ID (G-05, E-08, M3d-19), so the
// sidebar counts a space's boards and the list shows them under it, but only
// to a reader who is in that space now, by the rule the board's own answer
// follows (access.ts's spaceShownTo): someone invited to the board from
// outside the space, or who has left it, isn't told which space it's in. A
// board in no space keeps its listing's shape.

import { sql } from "kysely";
import { ROLES, SPACE_ROLES, closingOf } from "@steelman/shared";
import type { BoardListing, Clock, Role } from "@steelman/shared";
import { spaceBoards } from "./access.ts";
import type { Db } from "./db/database.ts";

export async function listBoards(db: Db, clock: Clock, person: string): Promise<{ now: string; boards: BoardListing[] }> {
  const boards = await sql<{ id: string; question: string; role: string; owner: string; changed_at: Date; created_at: Date; comments: string; closed_at: Date | null; closes_at: Date | null; space: string | null }>`
    select b.id, b.question, m.role, owner.username as owner, b.closed_at, b.closes_at, b.created_at,
      -- Its space, only while the reader is in it and it isn't deleted.
      (select s.id from space s
         join space_member sm on sm.space_id = s.id and sm.account_id = ${person} and sm.role = any(${[...SPACE_ROLES]})
       where s.id = b.space_id and s.deleted_at is null) as space,
      -- A comment counts while it isn't deleted, its thread isn't resolved (a reply goes by its first comment), and
      -- its subject stands, as read.ts's commentRows decides.
      (select count(*) from comment c
         left join comment thread on thread.board_id = c.board_id and thread.id = c.parent_id
         left join version v on v.board_id = c.board_id and v.id = c.version_id
         left join option o on o.board_id = c.board_id and o.id = c.option_id
       where c.board_id = b.id
         and c.deleted_at is null
         and (case when c.parent_id is null then c.resolved_at is null else thread.resolved_at is null end)
         and (c.version_id is null or (v.deleted_at is null and v.hidden_at is null))
         and (c.option_id is null or o.deleted_at is null)) as comments,
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
    from (
      select board_id, role from board_member where account_id = ${person} and role = any(${[...ROLES]})
      union all ${spaceBoards(person)}
    ) m
    join board b on b.id = m.board_id
    -- Its owner: the maker, or whoever it was handed to when they deleted their account (M-07).
    join account owner on owner.id = b.created_by
    where b.deleted_at is null
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
      createdAt: new Date(board.created_at).toISOString(),
      comments: Number(board.comments),
      // Only for a board that's closed or has a closing time (M3b-3), so other listings keep their shape.
      ...closingKey(board, clock),
      // Only for a board in a space the reader is in (M3d-19), so other listings keep their shape.
      ...(board.space ? { space: board.space } : {}),
    })),
  };
}

function closingKey(board: { closed_at: Date | null; closes_at: Date | null }, clock: Clock): Pick<BoardListing, "closing"> {
  const closing = closingOf({ closedAt: board.closed_at && new Date(board.closed_at), closesAt: board.closes_at && new Date(board.closes_at) }, clock.now());
  return closing ? { closing } : {};
}
