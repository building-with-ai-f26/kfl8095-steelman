// Who may open a board, and as what (H-02; plans/architecture.md §7, point 4).
//
// A person's role is their board_member row. Failing that, if the board is
// open to anyone with the link and they have confirmed their email, it is
// the link's role. Failing that, they have no role, and can() refuses them.
//
// Someone who gets in by the link is recorded as a member, by the link, the
// first time they open the board (Q7). Their role then follows the link's:
// changing the link role changes theirs, and turning the link off removes
// them. People added by name (the owner, and invited people later) keep
// their role whatever the link does.

import { sql } from "kysely";
import type { Kysely } from "kysely";
import { LINK_ROLES, ROLES } from "@steelman/shared";
import type { Access, Clock, Role } from "@steelman/shared";
import type { Database } from "./db/database.ts";

type Reader = Kysely<Database>;

export interface Entry {
  role: Role | null;
  /** True when the role comes from the link and they aren't recorded as a member yet (see joinByLink). */
  joiningByLink: boolean;
}

const NO_ROLE: Entry = { role: null, joiningByLink: false };

/** A role as stored. Anything the service doesn't know gives no role, so an unknown word can't grant access. */
function asRole(stored: string): Role | null {
  return (ROLES as readonly string[]).includes(stored) ? (stored as Role) : null;
}

/** How this person gets in to the board, if they do. */
export async function entryTo(db: Reader, boardId: string, person: string | null): Promise<Entry> {
  if (person === null) return NO_ROLE;
  const member = await db.selectFrom("board_member").select("role").where("board_id", "=", boardId).where("account_id", "=", person).executeTakeFirst();
  if (member) return { role: asRole(member.role), joiningByLink: false };

  const byLink = await db
    .selectFrom("board")
    .innerJoin("account", (join) => join.on("account.id", "=", person))
    .select("board.link_role")
    .where("board.id", "=", boardId)
    .where("board.general_access", "=", "link")
    .where("account.email_verified", "=", true)
    .where("account.deleted_at", "is", null)
    .executeTakeFirst();
  if (!byLink) return NO_ROLE;
  const role = asRole(byLink.link_role);
  return role === "owner" ? NO_ROLE : { role, joiningByLink: role !== null };
}

/**
 * Records someone opening the board by its link as a member, and returns
 * their role, or null if the link no longer lets them in.
 *
 * It's one statement that holds the board's row while it checks, so it can't
 * slip between the owner turning the link off (or changing its role) and the
 * removal of the link's members that goes with it: if that change is under
 * way, this waits for it, then checks the board as it is after it.
 */
export async function joinByLink(db: Reader, clock: Clock, boardId: string, person: string): Promise<Role | null> {
  const joined = await sql<{ role: string }>`
    insert into board_member (board_id, account_id, role, joined_via, joined_at)
    select b.id, a.id, b.link_role, 'link', ${clock.now()}
    from board b join account a on a.id = ${person}
    where b.id = ${boardId}
      and b.general_access = 'link'
      and b.link_role = any(${[...LINK_ROLES]})
      and a.email_verified and a.deleted_at is null
    for share of b
    on conflict (board_id, account_id) do nothing
    returning role`.execute(db);
  if (joined.rows[0]) return asRole(joined.rows[0].role);
  // Nothing added: either another tab recorded them at the same moment, or the link no longer lets them in.
  const member = await db.selectFrom("board_member").select("role").where("board_id", "=", boardId).where("account_id", "=", person).executeTakeFirst();
  return member ? asRole(member.role) : null;
}

/** The board's general access and link role, as the API sends them. */
export async function accessOf(db: Reader, boardId: string): Promise<Access | null> {
  const board = await db.selectFrom("board").select(["general_access", "link_role"]).where("id", "=", boardId).executeTakeFirst();
  return board ? asAccess(board) : null;
}

export function asAccess(board: { general_access: string; link_role: string }): Access {
  return {
    general: board.general_access === "link" ? "link" : "invited",
    linkRole: board.link_role === "voter" ? "voter" : "contributor",
  };
}
