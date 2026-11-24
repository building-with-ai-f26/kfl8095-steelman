// Changing who can get in to a board (H-02): its general access and its link
// role, and each member's role (Share's people list, M2-2b). Only the owner
// may (the policy's "share"). People who came by the link follow it: a new
// link role becomes theirs, and turning the link off removes them
// (server/src/access.ts). Once the owner sets someone's role by name, they
// count as added by name ('invite'), so the role stays theirs whatever the
// link does afterwards.

import type { Access, Person, Role } from "@steelman/shared";
import { asAccess, asRole } from "./access.ts";
import type { Db } from "./db/database.ts";
import { writeToBoard } from "./write-path.ts";
import type { Services, WriteResult } from "./write-path.ts";

/** The owner changes who can get in. Setting what's already set is "already done". */
export async function setAccess({ db, clock }: Services, boardId: string, person: string | null, next: Access): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "share",
    load: async (trx) => {
      const board = await trx.selectFrom("board").select(["general_access", "link_role"]).where("id", "=", boardId).executeTakeFirst();
      return board ? asAccess(board) : null;
    },
    async change(trx, now, seq) {
      if (now.general === next.general && now.linkRole === next.linkRole) return "already_done";
      await trx.updateTable("board").set({ general_access: next.general, link_role: next.linkRole }).where("id", "=", boardId).execute();
      if (next.general === "invited") {
        await trx.deleteFrom("board_member").where("board_id", "=", boardId).where("joined_via", "=", "link").execute();
      } else if (next.linkRole !== now.linkRole) {
        await trx.updateTable("board_member").set({ role: next.linkRole }).where("board_id", "=", boardId).where("joined_via", "=", "link").execute();
      }
      await trx
        .insertInto("change")
        .values({
          board_id: boardId,
          seq,
          at: clock.now(),
          actor_id: person!,
          kind: "access_changed",
          subject_kind: "board",
          subject_id: boardId,
          before: JSON.stringify(now),
          after: JSON.stringify(next),
        })
        .execute();
      return "done";
    },
  });
}

/** Everyone on the board: the owner first, then the others by username. */
export async function listPeople(db: Db, boardId: string): Promise<Person[]> {
  const rows = await db
    .selectFrom("board_member as m")
    .innerJoin("account as a", "a.id", "m.account_id")
    .select(["a.id", "a.username", "m.role"])
    .where("m.board_id", "=", boardId)
    .where("a.deleted_at", "is", null)
    .execute();
  const people = rows.flatMap((row) => {
    const role = asRole(row.role);
    return role ? [{ id: row.id, name: row.username, role }] : [];
  });
  const key = (person: Person) => `${person.role === "owner" ? 0 : 1}${(person.name ?? "\uffff").toLowerCase()}`;
  return people.sort((x, y) => key(x).localeCompare(key(y)) || (x.id < y.id ? -1 : 1));
}

/**
 * The owner sets a member's role, from Viewer to Editor (Q27). The owner's
 * own row, and anyone not on the board, isn't found. Setting the role they
 * already have is "already done".
 */
export async function setRole({ db, clock }: Services, boardId: string, person: string | null, account: string, role: Exclude<Role, "owner">): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "share",
    load: async (trx) =>
      (await trx
        .selectFrom("board_member as m")
        .innerJoin("account as a", "a.id", "m.account_id")
        .select(["m.role", "m.joined_via"])
        .where("m.board_id", "=", boardId)
        .where("m.account_id", "=", account)
        .where("m.role", "!=", "owner")
        .where("a.deleted_at", "is", null)
        .executeTakeFirst()) ?? null,
    async change(trx, member, seq) {
      if (member.role === role && member.joined_via !== "link") return "already_done";
      await trx.updateTable("board_member").set({ role, joined_via: "invite" }).where("board_id", "=", boardId).where("account_id", "=", account).execute();
      // Their role is the same, only now it's theirs rather than the link's: nothing for the change log to show.
      if (member.role === role) return "done";
      await trx
        .insertInto("change")
        .values({
          board_id: boardId,
          seq,
          at: clock.now(),
          actor_id: person!,
          kind: "role_changed",
          subject_kind: "board",
          subject_id: boardId,
          before: JSON.stringify({ account, role: member.role }),
          after: JSON.stringify({ account, role }),
        })
        .execute();
      return "done";
    },
  });
}
