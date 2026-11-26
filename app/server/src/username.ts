// Changing your username (L-04, M3d-15; plans/architecture.md §2, the
// username_hold table, and "Account deletion and anonymization").
//
// A changed name's old one is held for 30 days in username_hold, so no one
// else takes it and links to it keep working (the redirect is M3d-16's). The
// unique index on account can't cover a name in another table, so each way of
// claiming a name does it inside one transaction that first takes
// pg_advisory_xact_lock(hashtext(lower(name))), then checks account and
// username_hold in one statement: the change (PUT /api/account/username), and
// the first pick after signing in (a before-hook on Better Auth's
// /update-user, in sign-in.ts). The one-key lock is kept apart by Postgres from
// the two-key one sign-in's email limit takes (mayEmail).
//
// Taking your own held old name back ends its hold and doesn't count;
// otherwise a person changes their name once in 30 days, so an account holds
// at most one old name. A hold keeps the name from everyone else until the
// daily job deletes it once it has ended (releaseEndedHolds), as a deleted
// account's name stays taken until that job releases it.

import { sql } from "kysely";
import { RESERVED_USERNAMES, isAllowedUsername } from "@steelman/shared";
import type { Clock } from "@steelman/shared";
import type { Db } from "./db/database.ts";
import type { Trx } from "./write-path.ts";

/** How long a changed username's old name is held, and how often a name may change (architecture §7, Retention). */
export const USERNAME_HOLD_DAYS = 30;
const DAY_MS = 86_400_000;

/** Postgres's code for a row a unique index refuses. */
const UNIQUE_VIOLATION = "23505";

export type UsernameChange =
  | { status: "done"; username: string }
  | { status: "already_done" }
  | { status: "refused"; reason: "taken" | "invalid" | "reserved" | "signed_out" }
  | { status: "refused"; reason: "too_soon"; again: string };

/** Takes the lock every claim of this name waits on, until the transaction ends. `name` is in lower case. */
async function lockName(trx: Trx, name: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${name}))`.execute(trx);
}

/**
 * Whether someone other than `me` has the name now, and who holds it as an old name. A hold that has ended still
 * counts until the daily job deletes it, so the name is free only after that job runs.
 * One statement, so both tables are read at one moment: a claim of a name someone is changing away from sees either
 * their account still with it or their new hold on it, never neither. A deleted account's username stays on its row
 * for 30 days (releaseHeldUsernames), so it counts as taken.
 */
async function nameHolder(trx: Trx, name: string, me: string): Promise<{ taken: boolean; heldBy: string | null }> {
  const row = (
    await sql<{ taken: boolean; held_by: string | null }>`
      select exists (select 1 from account where lower(username) = ${name} and id <> ${me}) as taken,
             (select account_id from username_hold where lower(old_name) = ${name}) as held_by`.execute(trx)
  ).rows[0]!;
  return { taken: row.taken, heldBy: row.held_by };
}

/** Clears an ended hold, not yet deleted by the daily job, on the name a person is leaving, so it can be held again. */
async function clearEndedHold(trx: Trx, name: string, now: Date): Promise<void> {
  await trx.deleteFrom("username_hold").where(sql<string>`lower(old_name)`, "=", name).where("ends_at", "<=", now).execute();
}

/**
 * Changes a person's username to `typed`, under the rules for picking one at first sign-in (M1-2): the same shape,
 * no reserved name, and no name someone has or holds, whatever its capitals. Sending your current name again changes
 * nothing (invariant 10).
 */
export async function changeUsername(db: Db, clock: Clock, person: string, typed: string): Promise<UsernameChange> {
  const name = typed.trim().toLowerCase();
  if (RESERVED_USERNAMES.includes(name)) return { status: "refused", reason: "reserved" };
  if (!isAllowedUsername(name)) return { status: "refused", reason: "invalid" };
  try {
    return await db.transaction().execute(async (trx): Promise<UsernameChange> => {
      await lockName(trx, name);
      const account = await trx.selectFrom("account").select("username").where("id", "=", person).where("deleted_at", "is", null).forUpdate().executeTakeFirst();
      if (!account || account.username === null) return { status: "refused", reason: "signed_out" };
      if (account.username.toLowerCase() === name) return { status: "already_done" };
      const now = clock.now();
      const holder = await nameHolder(trx, name, person);
      if (holder.taken || (holder.heldBy !== null && holder.heldBy !== person)) return { status: "refused", reason: "taken" };

      if (holder.heldBy === person) {
        // Taking your own old name back ends its hold, holds nothing for the name you leave, and doesn't count.
        await trx.deleteFrom("username_hold").where("account_id", "=", person).execute();
        await trx.updateTable("account").set({ username: name, updated_at: now }).where("id", "=", person).execute();
        return { status: "done", username: name };
      }

      const holding = await trx.selectFrom("username_hold").select("ends_at").where("account_id", "=", person).where("ends_at", ">", now).executeTakeFirst();
      if (holding) return { status: "refused", reason: "too_soon", again: holding.ends_at.toISOString() };
      // Their own holds that have ended go now, so an account holds at most one old name.
      await trx.deleteFrom("username_hold").where("account_id", "=", person).execute();
      await clearEndedHold(trx, account.username.toLowerCase(), now);
      await trx
        .insertInto("username_hold")
        .values({ old_name: account.username, account_id: person, ends_at: new Date(now.getTime() + USERNAME_HOLD_DAYS * DAY_MS) })
        .execute();
      await trx.updateTable("account").set({ username: name, updated_at: now }).where("id", "=", person).execute();
      return { status: "done", username: name };
    });
  } catch (error) {
    // A name written some other way than these two claims (a seed, straight into account) can still collide.
    if ((error as { code?: unknown }).code === UNIQUE_VIOLATION) return { status: "refused", reason: "taken" };
    throw error;
  }
}

/**
 * The first pick of a username after signing in, as Better Auth's /update-user is asked for it. Claimed here, under
 * the name's lock, so a hold can't land between a check and Better Auth's own write; Better Auth then writes the same
 * name, which is already this person's. "skip" leaves the request to Better Auth's username plugin, which refuses a
 * name of the wrong shape or a second pick with its own codes.
 */
export async function claimFirstUsername(db: Db, clock: Clock, person: string, typed: string): Promise<"claimed" | "taken" | "skip"> {
  if (!isAllowedUsername(typed)) return "skip";
  const name = typed.toLowerCase();
  try {
    return await db.transaction().execute(async (trx) => {
      await lockName(trx, name);
      const account = await trx.selectFrom("account").select("username").where("id", "=", person).where("deleted_at", "is", null).forUpdate().executeTakeFirst();
      if (!account || account.username !== null) return "skip";
      const now = clock.now();
      const holder = await nameHolder(trx, name, person);
      if (holder.taken || (holder.heldBy !== null && holder.heldBy !== person)) return "taken";
      await trx.updateTable("account").set({ username: name, updated_at: now }).where("id", "=", person).where("username", "is", null).execute();
      return "claimed";
    });
  } catch (error) {
    if ((error as { code?: unknown }).code === UNIQUE_VIOLATION) return "taken";
    throw error;
  }
}

/**
 * Deletes the holds that have ended, so their names are free. The daily scheduled call runs it (M1-14).
 *
 * @returns How many were deleted.
 */
export async function releaseEndedHolds(db: Db, clock: Pick<Clock, "now">): Promise<number> {
  const released = await db.deleteFrom("username_hold").where("ends_at", "<=", clock.now()).executeTakeFirst();
  return Number(released.numDeletedRows);
}

/** The old name an account holds, for Download your data, or null. */
export async function heldUsername(db: Db, person: string): Promise<{ username: string; until: string } | null> {
  const hold = await db.selectFrom("username_hold").select(["old_name", "ends_at"]).where("account_id", "=", person).orderBy("ends_at", "desc").executeTakeFirst();
  return hold ? { username: hold.old_name, until: hold.ends_at.toISOString() } : null;
}
