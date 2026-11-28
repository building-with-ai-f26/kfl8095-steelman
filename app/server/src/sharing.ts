// Changing who can get in to a board (H-02): its general access and its link
// role, and each member's role (Share's people list, M2-2b). Only the owner
// may (the policy's "share"). People who came by the link follow it: a new
// link role becomes theirs, and turning the link off removes them
// (server/src/access.ts). Once the owner sets someone's role by name, they
// count as added by name ('invite'), so the role stays theirs whatever the
// link does afterwards.
//
// A board in a space (G-05, M3d-18) may be shared with everyone in the space,
// at the link's role. Its members aren't recorded on the board (access.ts),
// so switching to the space removes the people who came by the link, as
// turning the link off does. The Owner puts their board in a space they are
// in, or takes it out; moving a board shared with its space stops sharing it,
// so it never opens to a group the Owner didn't choose. Into a public space,
// only an Owner who is one of its Admins, or its Owner, moves a board
// (M3d-34, the policy's space_post); a Member is refused as
// "space_admins_post", as a new board there is (boards.ts).

import { sql } from "kysely";
import { canInSpace, postingIn } from "@steelman/shared";
import type { Access, Person, Role } from "@steelman/shared";
import { asAccess, asRole } from "./access.ts";
import type { Db } from "./db/database.ts";
import { asSpaceRole } from "./spaces.ts";
import { writeToBoard } from "./write-path.ts";
import type { Services, WriteResult } from "./write-path.ts";

/** The owner changes who can get in. Setting what's already set is "already done". */
export async function setAccess({ db, clock }: Services, boardId: string, person: string | null, next: Access): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "share",
    load: async (trx) => {
      const board = await trx
        .selectFrom("board as b")
        .leftJoin("space as s", (join) => join.onRef("s.id", "=", "b.space_id").on("s.deleted_at", "is", null))
        // The Owner's own place in that space: sharing with it is theirs to choose only while they're in it.
        .leftJoin("space_member as sm", (join) => join.onRef("sm.space_id", "=", "s.id").on("sm.account_id", "=", person ?? ""))
        .select(["b.general_access", "b.link_role", "s.id as space", "sm.role as spaceRole"])
        .where("b.id", "=", boardId)
        .executeTakeFirst();
      return board ? { now: asAccess(board), space: board.space, inSpace: board.space !== null && board.spaceRole !== null && canInSpace(person, asSpaceRole(board.spaceRole), "space_read") === null } : null;
    },
    async change(trx, { now, space, inSpace }, seq) {
      if (now.general === next.general && now.linkRole === next.linkRole) return "already_done";
      // Only a board in a space that stands, and that the Owner is in, can be shared with everyone in it. A space they
      // have left answers as no space does, as putting the board in a space does (setBoardSpace).
      if (next.general === "space" && !inSpace) return { refused: "no_space" };
      await trx.updateTable("board").set({ general_access: next.general, link_role: next.linkRole }).where("id", "=", boardId).execute();
      if (next.general !== "link") {
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
          // Which space, by ID, so History can name it to its members (invariant 7: no name is kept).
          after: JSON.stringify(next.general === "space" ? { ...next, space } : next),
        })
        .execute();
      return "done";
    },
  });
}

/**
 * The Owner puts their board in a space they're in, or takes it out with null (G-05, M3d-18). A space they aren't
 * in answers as one that doesn't exist does, so they can't learn that it exists. A public space takes a board only from
 * its Admins and its Owner (M3d-34). A board shared with everyone in its
 * space stops being shared when it leaves that space, and is then open only to invited people. Putting it where it is
 * already is "already done".
 */
export async function setBoardSpace({ db, clock }: Services, boardId: string, person: string | null, space: string | null): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "share",
    load: async (trx) => (await trx.selectFrom("board").select(["space_id", "general_access"]).where("id", "=", boardId).executeTakeFirst()) ?? null,
    async change(trx, board, seq) {
      if (board.space_id === space) return "already_done";
      if (space !== null) {
        const mine = await trx
          .selectFrom("space_member as sm")
          .innerJoin("space as s", "s.id", "sm.space_id")
          .select(["sm.role", "s.visibility"])
          .where("sm.space_id", "=", space)
          .where("sm.account_id", "=", person!)
          .where("s.deleted_at", "is", null)
          .executeTakeFirst();
        if (!mine || canInSpace(person, asSpaceRole(mine.role), "space_read") !== null) return { refused: "no_space" };
        if (canInSpace(person, asSpaceRole(mine.role), postingIn(mine.visibility)) !== null) return { refused: "space_admins_post" };
      }
      const unshared = board.general_access === "space";
      await trx
        .updateTable("board")
        .set({ space_id: space, ...(unshared ? { general_access: "invited" } : {}) })
        .where("id", "=", boardId)
        .execute();
      await trx
        .insertInto("change")
        .values({
          board_id: boardId,
          seq,
          at: clock.now(),
          actor_id: person!,
          kind: "space_changed",
          subject_kind: "board",
          subject_id: boardId,
          // IDs and a keyword only (invariant 7): History reads the space's name for its members.
          ...(board.space_id ? { before: JSON.stringify({ space: board.space_id }) } : {}),
          after: JSON.stringify({ ...(space ? { space } : {}), ...(unshared ? { general: "invited" } : {}) }),
        })
        .execute();
      return "done";
    },
  });
}

/**
 * Everyone on the board: the owner first, then the others by username. A reader let in through the board's space
 * (M3d-18) isn't recorded on the board, so they're added, after the owner, with the role the space gives them, as the
 * prototype's Share always lists you. No one else in the space is listed.
 */
export async function listPeople(db: Db, boardId: string, reader: { id: string; role: Role } | null = null): Promise<Person[]> {
  const people = await recordedPeople(db, boardId);
  if (reader === null || people.some((person) => person.id === reader.id)) return people;
  const you = await db.selectFrom("account").select(["id", "username"]).where("id", "=", reader.id).where("deleted_at", "is", null).executeTakeFirst();
  if (!you) return people;
  const owners = people.filter((person) => person.role === "owner").length;
  return [...people.slice(0, owners), { id: you.id, name: you.username, role: reader.role }, ...people.slice(owners)];
}

async function recordedPeople(db: Db, boardId: string): Promise<Person[]> {
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

/**
 * The Owner adds someone to the board by their username, at a role (M3b-7, H-01), as Google Drive's Add people does.
 * They can open it at once, with no Accept step. Someone who came by the link takes the role and keeps it whatever
 * the link then does, as setRole works; someone added already at another role gets the new one. An unknown or deleted
 * username isn't found; the Owner's own is refused, as they have access already.
 */
export async function inviteByUsername({ db, clock }: Services, boardId: string, person: string | null, username: string, role: Exclude<Role, "owner">): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "share",
    load: async (trx) => {
      // Capitals don't count, as they don't when a username is picked.
      const account = await trx.selectFrom("account").select("id").where(sql<string>`lower(username)`, "=", username).where("deleted_at", "is", null).executeTakeFirst();
      if (!account) return null;
      const member = await trx.selectFrom("board_member").select(["role", "joined_via"]).where("board_id", "=", boardId).where("account_id", "=", account.id).executeTakeFirst();
      return { account: account.id, member: member ?? null };
    },
    async change(trx, { account, member }, seq) {
      if (member?.role === "owner") return { refused: "already_member" };
      if (member && member.role === role && member.joined_via === "invite") return "already_done";
      const now = clock.now();
      if (member) await trx.updateTable("board_member").set({ role, joined_via: "invite" }).where("board_id", "=", boardId).where("account_id", "=", account).execute();
      else await trx.insertInto("board_member").values({ board_id: boardId, account_id: account, role, joined_via: "invite", joined_at: now }).execute();
      // Someone already invited gets a new role, which History says as a role change; anyone else was added.
      const added = !member || member.joined_via === "link";
      await trx
        .insertInto("change")
        .values({
          board_id: boardId,
          seq,
          at: now,
          actor_id: person!,
          kind: added ? "member_added" : "role_changed",
          subject_kind: "board",
          subject_id: boardId,
          ...(added ? {} : { before: JSON.stringify({ account, role: member!.role }) }),
          after: JSON.stringify({ account, role }),
        })
        .execute();
      return "done";
    },
  });
}

/**
 * The Owner removes a member (M3b-7, H-01), never themself. What they wrote and their votes stay, as they do when
 * the link is turned off. On a board anyone with the link can open, they come back at the link's role when they next
 * open it. Removing someone who isn't on the board is already done.
 */
export async function removeMember({ db, clock }: Services, boardId: string, person: string | null, account: string): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "share",
    load: async (trx) => {
      const exists = await trx.selectFrom("account").select("id").where("id", "=", account).executeTakeFirst();
      if (!exists) return null;
      const member = await trx.selectFrom("board_member").select("role").where("board_id", "=", boardId).where("account_id", "=", account).executeTakeFirst();
      // The Owner isn't someone the board can lose: not found, as setRole answers for the Owner's own row.
      return member?.role === "owner" ? null : { member: member ?? null };
    },
    async change(trx, { member }, seq) {
      if (!member) return "already_done";
      await trx.deleteFrom("board_member").where("board_id", "=", boardId).where("account_id", "=", account).execute();
      await trx
        .insertInto("change")
        .values({ board_id: boardId, seq, at: clock.now(), actor_id: person!, kind: "member_removed", subject_kind: "board", subject_id: boardId, after: JSON.stringify({ account }) })
        .execute();
      return "done";
    },
  });
}
