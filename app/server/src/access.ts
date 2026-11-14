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

import type { Kysely } from "kysely";
import { ROLES } from "@steelman/shared";
import type { Access, Clock, Role } from "@steelman/shared";
import type { Database } from "./db/database.ts";

type Reader = Kysely<Database>;

export interface Entry {
  role: Role | null;
  /** True when the role comes from the link and they aren't recorded as a member yet. */
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

/** Records someone who just opened the board by its link as a member. Opening it again changes nothing. */
export async function recordLinkMember(db: Reader, clock: Clock, boardId: string, person: string, role: Role): Promise<void> {
  await db
    .insertInto("board_member")
    .values({ board_id: boardId, account_id: person, role, joined_via: "link", joined_at: clock.now() })
    .onConflict((conflict) => conflict.columns(["board_id", "account_id"]).doNothing())
    .execute();
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
