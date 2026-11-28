// Spaces (G-03, G-04, G-07, M3d-17, M3d-20; plans/architecture.md §2 and §7):
// making one, its settings and visibility, its members and their roles,
// reading it, and finding and joining a public one.
//
// Every write by a person, but making a space, goes through `writeToSpace`,
// which does what the board write path does (write-path.ts), in one transaction:
//
//   0. first, for a removal only: the removed person's account row, which
//              their own deletion locks before their spaces (M3d-35);
//   1. lock:   the space's row, so writes to one space take turns, and
//              "exactly one owner" holds without a database rule (Q24);
//   2. load:   the person's own role in it; none, and the space isn't found,
//              so a non-member can't learn that it exists;
//   3. can:    ask the space policy (canInSpace) before looking anything up,
//              so a Member can't try usernames;
//   4. load what the write refers to;
//   5. change it, and add a change row that holds no text.
//
// A write that is refused, or turns out to be already done, is rolled back.
// A space isn't synced live as a board is, so a write answers no change
// number. Boards join spaces in M3d-18. A private space is found by no one
// outside it. A public space (M3d-20) is found by anyone signed in, in Find
// spaces (findSpaces) and by its address (readSpace), which give its name,
// about text, canvas, and member count, and never its members or its boards.
// Join (joinSpace) is the one write by someone who isn't a member yet, so it
// has its own transaction, with the same lock and the same 404 a private
// space gives. Making a space and inviting someone both record them as added
// by name (joined_via "invite", migration 0019); Join records "join".
//
// A removal sticks (M3d-35, migration 0020; finding F3 of the public-spaces
// security review): when an Admin or the Owner removes someone, a block is
// kept in the same transaction, and Join and Find spaces ask blockedFrom
// before letting them back. Leaving keeps no block. An invite
// from an Admin or the Owner lifts the block, and its change row says so.
//
// The builder's make-private (J-06, M3d-36; finding F8 of the review) is the
// one write that doesn't: the operator job is no member, so it takes the same
// row lock and writes the same change row as the Owner's visibility change,
// without asking the space policy, and credits the row to the `steelman`
// stand-in.

import { sql } from "kysely";
import { PUBLIC_SPACES, canInSpace, itemIdInput, peopleIn } from "@steelman/shared";
import type { Clock, FoundSpace, MakePublicCounts, RefusalReason, SpaceAction, SpaceMember, SpaceRole, SpaceSummary, SpaceWriteAnswer } from "@steelman/shared";
import { OPERATOR_ACCOUNT } from "./account.ts";
import type { Db } from "./db/database.ts";
import type { Services, Trx } from "./write-path.ts";

export type SpaceWriteResult = SpaceWriteAnswer | { status: "not_found" };

type SpaceOutcome = "done" | "already_done" | { refused: RefusalReason };

interface SpaceWriteSteps<Loaded> {
  action: SpaceAction;
  /**
   * Step 0, before the space is locked: hold a row the change will need that an account deletion locks before it locks
   * the space, so the two take their locks in the same order and can't wait on each other.
   */
  preLock?(trx: Trx): Promise<void>;
  /**
   * Step 1 takes the space's row FOR NO KEY UPDATE instead of FOR UPDATE. A board's foreign key to its space takes the
   * space's row FOR KEY SHARE, whenever a write updates the board twice (its change number, then the change), and only
   * FOR UPDATE makes that wait. A space write that then waits on boards takes this lock, so no board write waits on it.
   */
  boardsAfter?: true;
  /** Step 4. Null when the thing isn't there. */
  load(trx: Trx, role: SpaceRole): Promise<Loaded | null>;
  /** Step 5: make the change and add its change row. */
  change(trx: Trx, loaded: Loaded, role: SpaceRole): Promise<SpaceOutcome>;
}

/** Thrown inside the transaction to roll it back with an answer. */
class RollBack extends Error {
  constructor(readonly answer: SpaceWriteResult) {
    super("rolled back");
  }
}

const SPACE_ROLE_WORDS: readonly string[] = ["owner", "admin", "member"];
export const asSpaceRole = (role: string): SpaceRole | null => (SPACE_ROLE_WORDS.includes(role) ? (role as SpaceRole) : null);

async function writeToSpace<Loaded>(db: Db, spaceId: string, person: string | null, steps: SpaceWriteSteps<Loaded>): Promise<SpaceWriteResult> {
  if (person === null) return { status: "refused", reason: "signed_out" };
  // An ID that isn't the shape of one names no space.
  if (!itemIdInput.safeParse(spaceId).success) return { status: "not_found" };
  try {
    return await db.transaction().execute(async (trx) => {
      // 0. What an account deletion locks first.
      await steps.preLock?.(trx);
      // 1. Lock.
      const locking = trx.selectFrom("space").select("id").where("id", "=", spaceId).where("deleted_at", "is", null);
      const space = await (steps.boardsAfter ? locking.forNoKeyUpdate() : locking.forUpdate()).executeTakeFirst();
      if (!space) throw new RollBack({ status: "not_found" });
      // 2. Their role, which a non-member hasn't: to them, the space isn't there.
      const mine = await trx.selectFrom("space_member").select("role").where("space_id", "=", spaceId).where("account_id", "=", person).executeTakeFirst();
      const role = mine ? asSpaceRole(mine.role) : null;
      if (role === null) throw new RollBack({ status: "not_found" });
      // 3. May they?
      const refusal = canInSpace(person, role, steps.action);
      if (refusal) throw new RollBack({ status: "refused", reason: refusal });
      // 4. Load.
      const loaded = await steps.load(trx, role);
      if (loaded === null) throw new RollBack({ status: "not_found" });
      // 5. Change.
      const outcome = await steps.change(trx, loaded, role);
      if (outcome === "already_done") throw new RollBack({ status: "already_done" });
      if (outcome !== "done") throw new RollBack({ status: "refused", reason: outcome.refused });
      return { status: "done" } as const;
    });
  } catch (error) {
    if (error instanceof RollBack) return error.answer;
    throw error;
  }
}

/** A change row: IDs and keywords only, never the space's name or about text (invariant 7). */
async function logChange(trx: Trx, row: { space: string; at: Date; actor: string; kind: string; before?: object; after?: object }): Promise<void> {
  await trx
    .insertInto("space_change")
    .values({
      space_id: row.space,
      at: row.at,
      actor_id: row.actor,
      kind: row.kind,
      ...(row.before ? { before: JSON.stringify(row.before) } : {}),
      ...(row.after ? { after: JSON.stringify(row.after) } : {}),
    })
    .execute();
}

export interface NewSpace {
  id: string;
  name: string;
  about?: string | undefined;
  canvas?: string | undefined;
}

/**
 * Anyone signed in makes a space and becomes its one Owner (G-03; the builder, Nov 24). It starts private, as a new
 * space's visibility accepts nothing else (NEW_SPACE_VISIBILITIES); only its Owner makes it public afterwards. The browser makes its ID, so sending it twice makes one space: the same ID from
 * the same maker is already done, and from anyone else is taken.
 */
export async function createSpace({ db, clock }: Services, person: string, space: NewSpace): Promise<SpaceWriteAnswer> {
  const existing = async (): Promise<SpaceWriteAnswer | null> => {
    const made = await db.selectFrom("space").select("created_by").where("id", "=", space.id).executeTakeFirst();
    if (!made) return null;
    return made.created_by === person ? { status: "already_done" } : { status: "refused", reason: "id_taken" };
  };
  const before = await existing();
  if (before) return before;
  const now = clock.now();
  try {
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("space")
        .values({ id: space.id, name: space.name, about: space.about ?? "", canvas: space.canvas ?? "stone", visibility: "private", created_by: person, created_at: now })
        .execute();
      await trx.insertInto("space_member").values({ space_id: space.id, account_id: person, role: "owner", joined_via: "invite", joined_at: now }).execute();
      await logChange(trx, { space: space.id, at: now, actor: person, kind: "space_created" });
    });
  } catch (error) {
    // The same ID sent twice at once: the second finds the first's.
    if ((error as { code?: unknown }).code === "23505") return (await existing()) ?? { status: "refused", reason: "id_taken" };
    throw error;
  }
  return { status: "done" };
}

export interface SpaceSettings {
  name: string;
  about: string;
  canvas: string;
}

/** An Admin or the Owner renames the space, and changes its about text and canvas. The change row says only which changed. */
export async function updateSpaceSettings({ db, clock }: Services, spaceId: string, person: string | null, next: SpaceSettings): Promise<SpaceWriteResult> {
  return writeToSpace(db, spaceId, person, {
    action: "space_edit",
    load: async (trx) => (await trx.selectFrom("space").select(["name", "about", "canvas"]).where("id", "=", spaceId).executeTakeFirst()) ?? null,
    async change(trx, now) {
      const changed = (["name", "about", "canvas"] as const).filter((field) => now[field] !== next[field]);
      if (changed.length === 0) return "already_done";
      await trx.updateTable("space").set({ name: next.name, about: next.about, canvas: next.canvas }).where("id", "=", spaceId).execute();
      await logChange(trx, { space: spaceId, at: clock.now(), actor: person!, kind: "space_edited", after: { changed } });
      return "done";
    },
  });
}

/**
 * Only the Owner changes who can find the space (G-03, G-07), as only a board's Owner changes General access. Making it
 * public (M3d-20) is refused when they own 3 public spaces already (security review F9), and stops sharing every board
 * in it that someone else owns, as setBoardSpace does on a move, so no one's board opens to strangers without its
 * Owner's choice (F4); their own boards stay shared. Making it private again keeps everyone who joined, as Slack keeps a
 * channel's members. Sent twice, the second is already done, and doesn't stop sharing a board shared again since.
 */
export async function setSpaceVisibility({ db, clock }: Services, spaceId: string, person: string | null, visibility: string): Promise<SpaceWriteResult> {
  return writeToSpace(db, spaceId, person, {
    action: "space_visibility",
    // The Owner's account row, held before the space as their own deletion holds it, so two of their visibility changes
    // take turns and the count of their public spaces can't be beaten by sending two at once.
    preLock: async (trx) => {
      await trx.selectFrom("account").select("id").where("id", "=", person!).forNoKeyUpdate().execute();
    },
    // Make public waits on the space's boards below, and a board write holding one of them can need its key to the space.
    boardsAfter: true,
    load: async (trx) => (await trx.selectFrom("space").select("visibility").where("id", "=", spaceId).executeTakeFirst()) ?? null,
    async change(trx, now) {
      if (now.visibility === visibility) return "already_done";
      const at = clock.now();
      if (visibility !== "public") {
        await trx.updateTable("space").set({ visibility }).where("id", "=", spaceId).execute();
        await logChange(trx, { space: spaceId, at, actor: person!, kind: "visibility_changed", before: { visibility: now.visibility }, after: { visibility } });
        return "done";
      }
      if ((await publicSpacesOwned(trx, person!)) >= PUBLIC_SPACES.perOwner) return { refused: "too_many_public_spaces" };
      // Every board in the space, held in ID order, as every board write takes its board, before the list below is
      // read. A share with the space that commits meanwhile is then waited for and seen, and stops too. The space is
      // held FOR NO KEY UPDATE (boardsAfter), so a board write's key share on it doesn't wait; a new board or a move in
      // waits for this one by FOR SHARE before it holds any board in the space, so no wait goes in a circle.
      await trx.selectFrom("board").select("id").where("space_id", "=", spaceId).orderBy("id").forNoKeyUpdate().execute();
      const unshared = await othersSharedBoards(trx, spaceId, person!);
      for (const board of unshared) await stopSharing(trx, board, person!, at);
      await trx.updateTable("space").set({ visibility }).where("id", "=", spaceId).execute();
      // Which boards stopped being shared, by ID (invariant 7: no text).
      await logChange(trx, { space: spaceId, at, actor: person!, kind: "visibility_changed", before: { visibility: now.visibility }, after: { visibility, unshared: unshared.map((board) => board.id) } });
      return "done";
    },
  });
}

/** How many spaces that aren't deleted `person` owns and are public (M3d-20). Count it while their account row is held. */
async function publicSpacesOwned(trx: Trx, person: string): Promise<number> {
  const row = await trx
    .selectFrom("space as s")
    .innerJoin("space_member as m", "m.space_id", "s.id")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("m.account_id", "=", person)
    .where("m.role", "=", "owner")
    .where("s.visibility", "=", "public")
    .where("s.deleted_at", "is", null)
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

/**
 * The boards in the space, not deleted, shared with everyone in it, whose Owner (their board_member Owner, not who made
 * them) isn't `owner`, in ID order, so they're taken in the order every write takes boards. Make public stops sharing
 * these, closed boards and boards whose Owner has left the space among them, and its question counts them.
 */
function othersSharedBoards(trx: Db | Trx, spaceId: string, owner: string) {
  return trx
    .selectFrom("board as b")
    .select(["b.id", "b.link_role as linkRole"])
    .where("b.space_id", "=", spaceId)
    .where("b.deleted_at", "is", null)
    .where("b.general_access", "=", "space")
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("board_member as bo")
            .select("bo.board_id")
            .whereRef("bo.board_id", "=", "b.id")
            .where("bo.role", "=", "owner")
            .where("bo.account_id", "=", owner),
        ),
      ),
    )
    .orderBy("b.id")
    .execute();
}

/** One board stops being shared with its space, under its own change number, with the change row History reads, credited to the space's Owner. */
async function stopSharing(trx: Trx, board: { id: string; linkRole: string }, actor: string, at: Date): Promise<void> {
  const seq = Number((await sql<{ seq: string }>`select take_change_number(${board.id}) as seq`.execute(trx)).rows[0]!.seq);
  await trx.updateTable("board").set({ general_access: "invited" }).where("id", "=", board.id).execute();
  await trx
    .insertInto("change")
    .values({
      board_id: board.id,
      seq,
      at,
      actor_id: actor,
      kind: "access_changed",
      subject_kind: "board",
      subject_id: board.id,
      before: JSON.stringify({ general: "space", linkRole: board.linkRole }),
      after: JSON.stringify({ general: "invited", linkRole: board.linkRole }),
    })
    .execute();
}

/**
 * What Make public's question counts (G-07, M3d-20), for the space's Owner alone: its members (deleted accounts aside),
 * their own steelmen shared with everyone in it, and the other members' steelmen shared with it, which stop being
 * shared. Null, so a 404, for anyone outside the space; an Admin or a Member is refused as not allowed.
 */
export async function readMakePublicCounts(db: Db, person: string, spaceId: string): Promise<MakePublicCounts | "not_allowed" | null> {
  if (!itemIdInput.safeParse(spaceId).success) return null;
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const space = await summaries(trx, person).where("s.id", "=", spaceId).executeTakeFirst();
      if (!space) return null;
      const role = asSpaceRole(space.role);
      if (role === null) return null;
      if (canInSpace(person, role, "space_visibility") !== null) return "not_allowed";
      const own = await trx
        .selectFrom("board as b")
        .innerJoin("board_member as bo", (join) => join.onRef("bo.board_id", "=", "b.id").on("bo.role", "=", "owner").on("bo.account_id", "=", person))
        .select((eb) => eb.fn.countAll<string>().as("n"))
        .where("b.space_id", "=", spaceId)
        .where("b.deleted_at", "is", null)
        .where("b.general_access", "=", "space")
        .executeTakeFirst();
      return { members: Number(space.members ?? 0), shared: Number(own?.n ?? 0), unshared: (await othersSharedBoards(trx, spaceId, person)).length };
    });
}

/**
 * Join (G-07, M3d-20): anyone signed in becomes a Member of a public space at once, with no request, recorded as having
 * joined (joined_via "join", M3d-33), as Slack's Join Channel does. It can't go through writeToSpace, whose second step
 * refuses anyone who isn't a member, so it takes the same locks in the same order itself: the joiner's account row, as
 * their deletion holds it, then the space's row. Under that lock it checks that the space is public and that no Admin
 * removed them (M3d-35); otherwise it answers 404, as a space that doesn't exist does, so a removed person can't tell
 * it from a private one. A member already in it is already done. There is no policy action for this: someone outside
 * a space has no role in it to ask about.
 */
export async function joinSpace({ db, clock }: Services, spaceId: string, person: string | null): Promise<SpaceWriteResult> {
  if (person === null) return { status: "refused", reason: "signed_out" };
  if (!itemIdInput.safeParse(spaceId).success) return { status: "not_found" };
  try {
    return await db.transaction().execute(async (trx) => {
      const account = await trx.selectFrom("account").select("id").where("id", "=", person).where("deleted_at", "is", null).forKeyShare().executeTakeFirst();
      if (!account) throw new RollBack({ status: "not_found" });
      const space = await trx.selectFrom("space").select("visibility").where("id", "=", spaceId).where("deleted_at", "is", null).forUpdate().executeTakeFirst();
      if (!space) throw new RollBack({ status: "not_found" });
      const mine = await trx.selectFrom("space_member").select("role").where("space_id", "=", spaceId).where("account_id", "=", person).executeTakeFirst();
      if (mine) throw new RollBack({ status: "already_done" });
      // Exactly "public": a word the service doesn't know lets no one in.
      if (space.visibility !== "public" || (await blockedFrom(trx, spaceId, person))) throw new RollBack({ status: "not_found" });
      const now = clock.now();
      await trx.insertInto("space_member").values({ space_id: spaceId, account_id: person, role: "member", joined_via: "join", joined_at: now }).execute();
      await logChange(trx, { space: spaceId, at: now, actor: person, kind: "member_joined", after: { account: person } });
      return { status: "done" } as const;
    });
  } catch (error) {
    if (error instanceof RollBack) return error.answer;
    throw error;
  }
}

/**
 * The builder makes a space private (J-06, M3d-36), from the operator job, with no member's say: under the space's row
 * lock, as the Owner's change takes it, keeping every member, with a change row credited to the `steelman` stand-in,
 * which the first such change makes. A space that is already private, or isn't there (deleted, or an ID of the wrong
 * shape), changes nothing.
 */
export async function makeSpacePrivate(db: Db, clock: Clock, spaceId: string): Promise<"done" | "already_private" | "not_found"> {
  if (!itemIdInput.safeParse(spaceId).success) return "not_found";
  return db.transaction().execute(async (trx) => {
    const space = await trx.selectFrom("space").select("visibility").where("id", "=", spaceId).where("deleted_at", "is", null).forUpdate().executeTakeFirst();
    if (!space) return "not_found";
    if (space.visibility === "private") return "already_private";
    const now = clock.now();
    await trx
      .insertInto("account")
      .values({ id: OPERATOR_ACCOUNT, username: OPERATOR_ACCOUNT, created_at: now, deleted_at: now })
      .onConflict((c) => c.column("id").doNothing())
      .execute();
    await trx.updateTable("space").set({ visibility: "private" }).where("id", "=", spaceId).execute();
    await logChange(trx, { space: spaceId, at: now, actor: OPERATOR_ACCOUNT, kind: "visibility_changed", before: { visibility: space.visibility }, after: { visibility: "private" } });
    return "done";
  });
}

/**
 * An Admin or the Owner adds a classmate by username, as Admin or Member (G-04), by a board invite's rules: they are
 * in at once, with no Accept step; someone already in at another role gets the new one; an unknown or deleted
 * username isn't found; the Owner keeps their role.
 */
export async function inviteToSpace({ db, clock }: Services, spaceId: string, person: string | null, username: string, role: "admin" | "member"): Promise<SpaceWriteResult> {
  return writeToSpace(db, spaceId, person, {
    action: "space_invite",
    load: async (trx) => {
      // Capitals don't count, as they don't when a username is picked.
      const account = await trx.selectFrom("account").select("id").where(sql<string>`lower(username)`, "=", username).where("deleted_at", "is", null).executeTakeFirst();
      if (!account) return null;
      const member = await trx.selectFrom("space_member").select("role").where("space_id", "=", spaceId).where("account_id", "=", account.id).executeTakeFirst();
      if (member) return { account: account.id, member: member.role };
      // Someone new: hold their account while they're added, so a deletion of it running now waits, then finds the
      // membership to end, or finishes first and they aren't found here.
      const still = await trx.selectFrom("account").select("id").where("id", "=", account.id).where("deleted_at", "is", null).forKeyShare().executeTakeFirst();
      return still ? { account: account.id, member: null } : null;
    },
    async change(trx, { account, member }) {
      if (member === "owner") return { refused: "owner_keeps_role" };
      if (member === role) return "already_done";
      const now = clock.now();
      if (member) {
        await trx.updateTable("space_member").set({ role }).where("space_id", "=", spaceId).where("account_id", "=", account).execute();
        await logChange(trx, { space: spaceId, at: now, actor: person!, kind: "role_changed", before: { account, role: member }, after: { account, role } });
      } else {
        // Someone who was removed is invited back: the invite lifts the block (M3d-35), and the change row says so.
        const lifted = await trx.deleteFrom("space_block").where("space_id", "=", spaceId).where("account_id", "=", account).executeTakeFirst();
        await trx.insertInto("space_member").values({ space_id: spaceId, account_id: account, role, joined_via: "invite", joined_at: now }).execute();
        const unblocked = Number(lifted.numDeletedRows) > 0;
        await logChange(trx, { space: spaceId, at: now, actor: person!, kind: "member_added", after: unblocked ? { account, role, unblocked } : { account, role } });
      }
      return "done";
    },
  });
}

/** An Admin or the Owner switches a member's role between Admin and Member (G-04). Someone not in the space isn't found; the Owner keeps their role. */
export async function setSpaceRole({ db, clock }: Services, spaceId: string, person: string | null, account: string, role: "admin" | "member"): Promise<SpaceWriteResult> {
  return writeToSpace(db, spaceId, person, {
    action: "space_role",
    load: async (trx) => (await trx.selectFrom("space_member").select("role").where("space_id", "=", spaceId).where("account_id", "=", account).executeTakeFirst()) ?? null,
    async change(trx, member) {
      if (member.role === "owner") return { refused: "owner_keeps_role" };
      if (member.role === role) return "already_done";
      await trx.updateTable("space_member").set({ role }).where("space_id", "=", spaceId).where("account_id", "=", account).execute();
      await logChange(trx, { space: spaceId, at: clock.now(), actor: person!, kind: "role_changed", before: { account, role: member.role }, after: { account, role } });
      return "done";
    },
  });
}

/**
 * An Admin or the Owner removes a member (G-04), who loses the space at once; anyone but the Owner removes themself
 * to leave. The Owner keeps their role, so no one removes them and they can't leave. Removing someone not in the space
 * is already done; an account that doesn't exist isn't found. A removal keeps a block, so the person can't come back
 * by themselves until an Admin or the Owner invites them (G-07, M3d-35); leaving keeps none.
 */
export async function removeFromSpace({ db, clock }: Services, spaceId: string, person: string | null, account: string): Promise<SpaceWriteResult> {
  const leaving = account === person;
  let exists = false;
  return writeToSpace(db, spaceId, person, {
    action: leaving ? "space_leave" : "space_remove",
    // The block names their account, so it's held before the space, as their own deletion holds it (M3d-35). A
    // deletion running now finishes first, and then they're already out, or waits for the removal to finish.
    preLock: async (trx) => {
      exists = (await trx.selectFrom("account").select("id").where("id", "=", account).forKeyShare().executeTakeFirst()) !== undefined;
    },
    load: async (trx) => {
      if (!exists) return null;
      const member = await trx.selectFrom("space_member").select("role").where("space_id", "=", spaceId).where("account_id", "=", account).executeTakeFirst();
      return { member: member?.role ?? null };
    },
    async change(trx, { member }) {
      if (member === "owner") return { refused: "owner_keeps_role" };
      if (member === null) return "already_done";
      const now = clock.now();
      await trx.deleteFrom("space_member").where("space_id", "=", spaceId).where("account_id", "=", account).execute();
      // The service may not change a block, so one already there is left as it is.
      if (!leaving) {
        await trx
          .insertInto("space_block")
          .values({ space_id: spaceId, account_id: account, blocked_by: person!, at: now })
          .onConflict((c) => c.columns(["space_id", "account_id"]).doNothing())
          .execute();
      }
      await logChange(trx, { space: spaceId, at: now, actor: person!, kind: leaving ? "member_left" : "member_removed", after: { account } });
      return "done";
    },
  });
}

/**
 * Whether an Admin or the Owner removed `account` from the space and no one has invited them back (G-07, M3d-35).
 * Join refuses them with the 404 a private space gives, and Find spaces leaves the space out for them. Read it
 * in the caller's transaction, after the space's row is locked, so a removal or an invite can't change it meanwhile.
 */
export async function blockedFrom(db: Db | Trx, spaceId: string, account: string): Promise<boolean> {
  const block = await db.selectFrom("space_block").select("space_id").where("space_id", "=", spaceId).where("account_id", "=", account).executeTakeFirst();
  return block !== undefined;
}

/** The spaces `person` is in that aren't deleted, with their role and how many members each has (deleted accounts aside). */
function summaries(db: Db | Trx, person: string) {
  return db
    .selectFrom("space as s")
    .innerJoin("space_member as m", "m.space_id", "s.id")
    .select((eb) => [
      "s.id",
      "s.name",
      "s.about",
      "s.canvas",
      "s.visibility",
      "m.role",
      eb
        .selectFrom("space_member as all")
        .innerJoin("account as a", "a.id", "all.account_id")
        .select((count) => count.fn.countAll<string>().as("n"))
        .whereRef("all.space_id", "=", "s.id")
        .where("a.deleted_at", "is", null)
        .as("members"),
    ])
    .where("m.account_id", "=", person)
    .where("s.deleted_at", "is", null);
}

type SummaryRow = { id: string; name: string; about: string; canvas: string; visibility: string; role: string; members: string | null };
/** A row the reader may see, as the space policy says (space_read), or null when the policy refuses them. */
const asSummary = (person: string, row: SummaryRow): SpaceSummary | null => {
  const role = asSpaceRole(row.role);
  if (canInSpace(person, role, "space_read") !== null) return null;
  return { id: row.id, name: row.name, about: row.about, canvas: row.canvas, visibility: row.visibility, role, members: Number(row.members ?? 0) } as SpaceSummary;
};

/** A public space's columns as anyone signed in reads them (G-07): no role, no members, no boards. */
function publicSpaces(db: Db | Trx) {
  return db
    .selectFrom("space as s")
    .select((eb) => [
      "s.id",
      "s.name",
      "s.about",
      "s.canvas",
      eb
        .selectFrom("space_member as all")
        .innerJoin("account as a", "a.id", "all.account_id")
        .select((count) => count.fn.countAll<string>().as("n"))
        .whereRef("all.space_id", "=", "s.id")
        .where("a.deleted_at", "is", null)
        .as("members"),
    ])
    .where("s.visibility", "=", "public")
    .where("s.deleted_at", "is", null);
}

const asFound = (row: { id: string; name: string; about: string; canvas: string; members: string | null }): FoundSpace =>
  ({ id: row.id, name: row.name, about: row.about, canvas: row.canvas, visibility: "public", members: Number(row.members ?? 0) }) as FoundSpace;

/**
 * One space: for a member, as they see it; for anyone else signed in, a public space's name, about text, canvas, and
 * member count (G-07, M3d-20), unless an Admin removed them. Null for anyone else, and for a space that doesn't exist,
 * was deleted, or whose ID is malformed, so a private space can't be told from no space.
 */
export async function readSpace(db: Db, person: string, spaceId: string): Promise<SpaceSummary | FoundSpace | null> {
  if (!itemIdInput.safeParse(spaceId).success) return null;
  const row = await summaries(db, person).where("s.id", "=", spaceId).executeTakeFirst();
  if (row) return asSummary(person, row);
  const found = await publicSpaces(db).where("s.id", "=", spaceId).executeTakeFirst();
  if (!found || (await blockedFrom(db, spaceId, person))) return null;
  return asFound(found);
}

/**
 * Find spaces (G-07, M3d-20; security review F9): the public spaces `person` isn't in and wasn't removed from, most
 * members first, then by ID, so the order is the same each time, and at most PUBLIC_SPACES.found of them. It takes no
 * search text: the browser filters this answer by name and about text, so what someone types never leaves it.
 */
export async function findSpaces(db: Db, person: string): Promise<FoundSpace[]> {
  const rows = await publicSpaces(db)
    .where((eb) => eb.not(eb.exists(eb.selectFrom("space_member as mine").select("mine.space_id").whereRef("mine.space_id", "=", "s.id").where("mine.account_id", "=", person))))
    .where((eb) => eb.not(eb.exists(eb.selectFrom("space_block as kept").select("kept.space_id").whereRef("kept.space_id", "=", "s.id").where("kept.account_id", "=", person))))
    .orderBy(sql`members desc`)
    .orderBy("s.id")
    .limit(PUBLIC_SPACES.found)
    .execute();
  return rows.map(asFound);
}

/** Your spaces: only the ones you belong to (nothing here finds anyone else's), by name. */
export async function listSpaces(db: Db, person: string): Promise<SpaceSummary[]> {
  const rows = await summaries(db, person).orderBy(sql`lower(s.name)`).orderBy("s.id").execute();
  return rows.flatMap((row) => asSummary(person, row) ?? []);
}

const ROLE_ORDER: Record<SpaceRole, number> = { owner: 0, admin: 1, member: 2 };

/**
 * A space's members (architecture §7, "Who sees what about people"): the Owner first, then Admins, then Members, each
 * by username, never with an email. Every member of a private space reads it; in a public space only its Admins and its
 * Owner do (peopleIn; the builder, Nov 28; security review F6), and a Member, someone who joined among them, is refused
 * as not allowed. Null for anyone outside the space, as readSpace answers to a private one. One snapshot, so the
 * reader's membership and the list can't disagree.
 */
export async function listSpacePeople(db: Db, person: string, spaceId: string): Promise<SpaceMember[] | "not_allowed" | null> {
  if (!itemIdInput.safeParse(spaceId).success) return null;
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const space = await summaries(trx, person).where("s.id", "=", spaceId).executeTakeFirst();
      if (!space || asSummary(person, space) === null) return null;
      if (canInSpace(person, asSpaceRole(space.role), peopleIn(space.visibility)) !== null) return "not_allowed";
      const rows = await trx
        .selectFrom("space_member as m")
        .innerJoin("account as a", "a.id", "m.account_id")
        .select(["a.id", "a.username", "m.role"])
        .where("m.space_id", "=", spaceId)
        .where("a.deleted_at", "is", null)
        .execute();
      const people = rows.flatMap((row) => {
        const role = asSpaceRole(row.role);
        return role ? [{ id: row.id, name: row.username, role }] : [];
      });
      const key = (member: SpaceMember) => (member.name ?? "￿").toLowerCase();
      return people.sort((x, y) => ROLE_ORDER[x.role] - ROLE_ORDER[y.role] || key(x).localeCompare(key(y)) || (x.id < y.id ? -1 : 1));
    });
}
