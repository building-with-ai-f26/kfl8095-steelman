// Spaces (G-03, G-04, M3d-17; plans/architecture.md §2 and §7): making one,
// its settings and visibility, its members and their roles, and reading it.
//
// Every write but making one goes through `writeToSpace`, which does what the
// board write path does (write-path.ts), in one transaction:
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
// number. Boards join spaces in M3d-18; public spaces, joining, and space
// links come later (M3d-20), so nothing here lets a non-member find a space.
// Making a space and inviting someone both record them as added by name
// (joined_via "invite", migration 0019); M3d-20's Join will record "join".
//
// A removal sticks (M3d-35, migration 0020; finding F3 of the public-spaces
// security review): when an Admin or the Owner removes someone, a block is
// kept in the same transaction, and M3d-20's Join and Find spaces ask
// blockedFrom before letting them back. Leaving keeps no block. An invite
// from an Admin or the Owner lifts the block, and its change row says so.

import { sql } from "kysely";
import { canInSpace, itemIdInput } from "@steelman/shared";
import type { RefusalReason, SpaceAction, SpaceMember, SpaceRole, SpaceSummary, SpaceWriteAnswer } from "@steelman/shared";
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
      const space = await trx.selectFrom("space").select("id").where("id", "=", spaceId).where("deleted_at", "is", null).forUpdate().executeTakeFirst();
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
 * Anyone signed in makes a space and becomes its one Owner (G-03; the builder, Nov 24). It starts private, as
 * visibility accepts nothing else yet. The browser makes its ID, so sending it twice makes one space: the same ID from
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

/** Only the Owner changes who can find the space. Only "private" is accepted until M3d-20, so today this is always already done. */
export async function setSpaceVisibility({ db, clock }: Services, spaceId: string, person: string | null, visibility: string): Promise<SpaceWriteResult> {
  return writeToSpace(db, spaceId, person, {
    action: "space_visibility",
    load: async (trx) => (await trx.selectFrom("space").select("visibility").where("id", "=", spaceId).executeTakeFirst()) ?? null,
    async change(trx, now) {
      if (now.visibility === visibility) return "already_done";
      await trx.updateTable("space").set({ visibility }).where("id", "=", spaceId).execute();
      await logChange(trx, { space: spaceId, at: clock.now(), actor: person!, kind: "visibility_changed", before: { visibility: now.visibility }, after: { visibility } });
      return "done";
    },
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
 * M3d-20's Join refuses them with the 404 a private space gives, and Find spaces leaves the space out for them. Read it
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

/** One space, for a member; null for anyone else, and for a space that doesn't exist, was deleted, or whose ID is malformed. */
export async function readSpace(db: Db, person: string, spaceId: string): Promise<SpaceSummary | null> {
  if (!itemIdInput.safeParse(spaceId).success) return null;
  const row = await summaries(db, person).where("s.id", "=", spaceId).executeTakeFirst();
  return row ? asSummary(person, row) : null;
}

/** Your spaces: only the ones you belong to (nothing here finds anyone else's), by name. */
export async function listSpaces(db: Db, person: string): Promise<SpaceSummary[]> {
  const rows = await summaries(db, person).orderBy(sql`lower(s.name)`).orderBy("s.id").execute();
  return rows.flatMap((row) => asSummary(person, row) ?? []);
}

const ROLE_ORDER: Record<SpaceRole, number> = { owner: 0, admin: 1, member: 2 };

/**
 * A space's members, for a member (architecture §7, "Who sees what about people"): the Owner first, then Admins, then
 * Members, each by username, never with an email. Null for anyone else, as readSpace answers. One snapshot, so the
 * reader's membership and the list can't disagree.
 */
export async function listSpacePeople(db: Db, person: string, spaceId: string): Promise<SpaceMember[] | null> {
  if (!itemIdInput.safeParse(spaceId).success) return null;
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const space = await summaries(trx, person).where("s.id", "=", spaceId).executeTakeFirst();
      if (!space || asSummary(person, space) === null) return null;
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
