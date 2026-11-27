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
//
// A board in a space may be shared with everyone in it (G-05, M3d-18;
// architecture §7, point 4). Then, failing a board_member row, a member of
// that space gets the link's role, read from space_member each time and never
// recorded as a board membership, so leaving the space or being removed from
// it ends their access at once. Someone with a board role of their own keeps
// it, whatever the space does. A deleted space lets no one in.

import { sql } from "kysely";
import type { Kysely } from "kysely";
import { LINK_ROLES, ROLES, SPACE_ROLES } from "@steelman/shared";
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
export function asRole(stored: string): Role | null {
  return (ROLES as readonly string[]).includes(stored) ? (stored as Role) : null;
}

function asLinkRole(stored: string): Access["linkRole"] | null {
  return (LINK_ROLES as readonly string[]).includes(stored) ? (stored as Access["linkRole"]) : null;
}

/** How this person gets in to the board, if they do. */
export async function entryTo(db: Reader, boardId: string, person: string | null): Promise<Entry> {
  if (person === null) return NO_ROLE;
  const member = await db.selectFrom("board_member").select("role").where("board_id", "=", boardId).where("account_id", "=", person).executeTakeFirst();
  if (member) return { role: asRole(member.role), joiningByLink: false };

  // Everyone in the board's space, at the link's role, while they're in it. Never recorded, so it ends when they leave.
  const bySpace = await sql<{ link_role: string }>`
    select b.link_role from board b
    join space s on s.id = b.space_id and s.deleted_at is null
    join space_member sm on sm.space_id = s.id and sm.account_id = ${person}
    where b.id = ${boardId} and b.general_access = 'space' and sm.role = any(${[...SPACE_ROLES]})`.execute(db);
  if (bySpace.rows[0]) {
    const role = asLinkRole(bySpace.rows[0].link_role);
    return role === null ? NO_ROLE : { role, joiningByLink: false };
  }

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
  // Only a role a link may give: a stored Editor or Owner, or a word the service doesn't know, gives nothing.
  const role = asLinkRole(byLink.link_role);
  return role === null ? NO_ROLE : { role, joiningByLink: true };
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
  const board = await db
    .selectFrom("board as b")
    .leftJoin("space as s", (join) => join.onRef("s.id", "=", "b.space_id").on("s.deleted_at", "is", null))
    .select(["b.general_access", "b.link_role", "s.id as space"])
    .where("b.id", "=", boardId)
    .executeTakeFirst();
  return board ? asAccess(board) : null;
}

/**
 * `space` is the board's space if it isn't deleted, else null. A board shared with a space that was deleted (its last
 * member deleted their account) lets no one in through it (entryTo), so it reads as open only to invited people, and
 * Share never tells its Owner that everyone in the space can open it (M3d-18).
 */
export function asAccess(board: { general_access: string; link_role: string; space: string | null }): Access {
  const general = board.general_access === "link" || (board.general_access === "space" && board.space !== null) ? board.general_access : "invited";
  return {
    general,
    linkRole: asLinkRole(board.link_role) ?? "contributor",
  };
}

/**
 * The boards `person` reaches through a space they're in and no board role of their own (M3d-18), with the role the
 * space gives them: those shared with everyone in a space that isn't deleted, at a role a link may give, and not
 * deleted. The list, profiles, and statistics each add these to the person's board_member rows, so all three agree
 * with entryTo, which lets them in.
 */
export function spaceBoards(person: string) {
  return sql`
    select b.id as board_id, b.link_role as role from board b
    join space s on s.id = b.space_id and s.deleted_at is null
    where b.general_access = 'space' and b.deleted_at is null and b.link_role = any(${[...LINK_ROLES]})
      and exists (select 1 from space_member sm where sm.space_id = b.space_id and sm.account_id = ${person} and sm.role = any(${[...SPACE_ROLES]}))
      and not exists (select 1 from board_member own where own.board_id = b.id and own.account_id = ${person})`;
}

/** The board's space, for a reader who is in it (M3d-18); null for anyone else, and for a board in no space or a deleted one. */
export async function spaceShownTo(db: Reader, boardId: string, person: string | null): Promise<{ id: string; name: string } | null> {
  if (person === null) return null;
  const space = await db
    .selectFrom("board as b")
    .innerJoin("space as s", "s.id", "b.space_id")
    .innerJoin("space_member as sm", (join) => join.onRef("sm.space_id", "=", "s.id").on("sm.account_id", "=", person))
    .select(["s.id", "s.name"])
    .where("b.id", "=", boardId)
    .where("s.deleted_at", "is", null)
    .executeTakeFirst();
  return space ?? null;
}
