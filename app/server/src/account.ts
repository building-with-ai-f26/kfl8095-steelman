// Your account (M-07, M1-12): who you are, Download your data, and Delete
// account (plans/architecture.md §2, "Account deletion and anonymization",
// and §7, "Export and deletion").
//
// Deletion runs in one transaction under the database role made for it
// (migration 0009), so it can do exactly what that role is granted and
// nothing more. Each board it touches takes its next change number first,
// and every row it changes is stamped with it, so open boards pick up the
// new counts and names with their next poll.
//
// The builder's decisions (Nov 15): a board its owner leaves passes to its
// longest-standing editor, else contributor; with neither, it is deleted with
// the account (a community admin would come first, once communities exist).
// The username is held for 30 days. Analytics are anonymous, so PostHog
// isn't asked to delete anything.

import { sql } from "kysely";
import type { Clock } from "@steelman/shared";
import type { Db } from "./db/database.ts";
import type { Trx } from "./write-path.ts";

/** The stand-in that everything a deleted person wrote is credited to (migration 0009). */
export const DELETED_ACCOUNT = "deleted_account";

/** How long a deleted account's username stays unavailable to others (architecture §7, Retention). */
export const USERNAME_HELD_DAYS = 30;

/** Who should take a board its owner leaves, best first. Voters never do (the builder's decision, Nov 15). */
const HEIRS = ["owner", "editor", "contributor"];

export interface AccountSummary {
  username: string | null;
  email: string | null;
  /** How they can sign in: "Email code" for anyone with an email, and "Google" if linked. */
  signIn: string[];
}

export async function accountSummary(db: Db, person: string): Promise<AccountSummary | null> {
  const account = await db.selectFrom("account").select(["username", "email"]).where("id", "=", person).where("deleted_at", "is", null).executeTakeFirst();
  if (!account) return null;
  const methods = await db.selectFrom("sign_in.sign_in_method").select("provider").where("account_id", "=", person).orderBy("provider").execute();
  return {
    username: account.username,
    email: account.email,
    signIn: [...(account.email ? ["Email code"] : []), ...methods.map((method) => (method.provider === "google" ? "Google" : method.provider))],
  };
}

/** Whether the account has been shown the tour (L-02), or null when there's no such account. */
export async function tourSeen(db: Db, person: string): Promise<boolean | null> {
  const account = await db.selectFrom("account").select("tour_seen_at").where("id", "=", person).where("deleted_at", "is", null).executeTakeFirst();
  return account ? account.tour_seen_at !== null : null;
}

/** Records that the account has been shown the tour. Taken again, it keeps when it was first shown. */
export async function markTourSeen(db: Db, clock: Clock, person: string): Promise<boolean> {
  await db.updateTable("account").set({ tour_seen_at: clock.now() }).where("id", "=", person).where("deleted_at", "is", null).where("tour_seen_at", "is", null).execute();
  return (await tourSeen(db, person)) !== null;
}

/**
 * Download your data: the prototype's steelman-data.json, from the tables.
 * Everything the person wrote, and their votes and assessments by ID, and
 * nothing anyone else wrote: the question and the options appear only on a
 * board they asked.
 */
export async function exportData(db: Db, clock: Clock, person: string) {
  const summary = await accountSummary(db, person);
  if (!summary) return null;
  const joined = (await db.selectFrom("account").select("created_at").where("id", "=", person).executeTakeFirstOrThrow()).created_at;

  const importance = await db
    .selectFrom("importance_vote")
    .select(["board_id", "argument_id", "value", "voted_at"])
    .where("account_id", "=", person)
    .orderBy("voted_at")
    .orderBy("argument_id")
    .execute();
  const articulation = await db
    .selectFrom("articulation_vote")
    .select(["board_id", "version_id", "value", "voted_at"])
    .where("account_id", "=", person)
    .orderBy("voted_at")
    .orderBy("version_id")
    .execute();
  const evidence = await db
    .selectFrom("assessment")
    .select(["board_id", "version_id", "rev", "supported", "assessed_at"])
    .where("account_id", "=", person)
    .orderBy("assessed_at")
    .orderBy("version_id")
    .execute();
  // Their reports (M2-3): reason, note, and when, and whether withdrawn. Not who else reported.
  const reports = await db
    .selectFrom("report")
    .select(["board_id", "version_id", "reason", "note", "reported_at", "withdrawn_at"])
    .where("reporter_id", "=", person)
    .orderBy("reported_at")
    .orderBy("version_id")
    .execute();

  // Their own words: the revisions they wrote of their own wordings. (A revision made because a cited source changed is the source editor's.)
  const wrote = await db
    .selectFrom("version_revision as r")
    .innerJoin("version as v", "v.id", "r.version_id")
    .innerJoin("argument as a", "a.id", "v.argument_id")
    .innerJoin("option as o", "o.id", "a.option_id")
    .select(["r.board_id", "a.id as argument_id", "r.version_id", "r.rev", "r.wording", "r.context", "r.created_at"])
    .where("v.author_id", "=", person)
    .where("r.created_by", "=", person)
    .where("r.why", "in", ["created", "edited"])
    .where("r.wording", "is not", null)
    .orderBy("v.created_seq")
    .orderBy("o.position")
    .orderBy("v.id")
    .orderBy("r.rev")
    .execute();
  const sources = await db
    .selectFrom("source")
    .select(["board_id", "id", "name", "locator", "finding", "backs_up", "limits", "created_at"])
    .where("added_by", "=", person)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  const memberships = await db.selectFrom("board_member").select(["board_id", "role"]).where("account_id", "=", person).execute();

  const boardIds = [...new Set([...memberships.map((m) => m.board_id), ...wrote.map((w) => w.board_id), ...sources.map((s) => s.board_id)])];
  const boards = boardIds.length
    ? await db.selectFrom("board").select(["id", "question", "created_by", "created_at"]).where("id", "in", boardIds).where("deleted_at", "is", null).orderBy("created_at").orderBy("id").execute()
    : [];
  const options = boardIds.length ? await db.selectFrom("option").select(["board_id", "name"]).where("board_id", "in", boardIds).where("deleted_at", "is", null).orderBy("position").execute() : [];

  return {
    exported: clock.now().toISOString(),
    account: { ...summary, joined: joined.toISOString() },
    votes: {
      importance: importance.map((v) => ({ board: v.board_id, argument: v.argument_id, value: v.value, at: v.voted_at.toISOString() })),
      articulation: articulation.map((v) => ({ board: v.board_id, version: v.version_id, value: v.value, at: v.voted_at.toISOString() })),
      evidence: evidence.map((v) => ({ board: v.board_id, version: v.version_id, rev: v.rev, supported: v.supported, at: v.assessed_at.toISOString() })),
    },
    reports: reports.map((r) => ({ board: r.board_id, version: r.version_id, reason: r.reason, note: r.note, at: r.reported_at.toISOString(), withdrawn: r.withdrawn_at?.toISOString() ?? null })),
    boards: boards.map((board) => ({
      board: board.id,
      link: `/b/${board.id}`,
      role: memberships.find((m) => m.board_id === board.id)?.role ?? null,
      ...(board.created_by === person ? { asked: { question: board.question, options: options.filter((o) => o.board_id === board.id).map((o) => o.name) } } : {}),
      wrote: wrote
        .filter((w) => w.board_id === board.id)
        .map((w) => ({ argument: w.argument_id, version: w.version_id, rev: w.rev, wording: w.wording, context: w.context, at: w.created_at.toISOString() })),
      sources: sources
        .filter((s) => s.board_id === board.id)
        .map((s) => ({ source: s.id, name: s.name, link: s.locator, finding: s.finding, backsUp: s.backs_up, limits: s.limits, at: s.created_at.toISOString() })),
    })),
  };
}

export type DeleteOutcome = "done" | "wrong_username" | "not_found";

/** Delete account: the deletion table of architecture §2, in one transaction. `typed` is the username they typed to confirm. */
export async function deleteAccount(db: Db, clock: Clock, person: string, typed: string): Promise<DeleteOutcome> {
  return db.transaction().execute(async (trx) => {
    await sql`set local role steelman_account_deletion`.execute(trx);
    // Locked, so a second deletion of the same account waits for this one, then finds it gone.
    const account = await trx.selectFrom("account").select(["username", "email"]).where("id", "=", person).where("deleted_at", "is", null).forUpdate().executeTakeFirst();
    if (!account || account.username === null) return "not_found";
    if (account.username.toLowerCase() !== typed.trim().toLowerCase()) return "wrong_username";
    const now = clock.now();
    // The stand-in, the first time anyone is deleted. It can't sign in and isn't a test user.
    await trx
      .insertInto("account")
      .values({ id: DELETED_ACCOUNT, username: DELETED_ACCOUNT, created_at: now, deleted_at: now })
      .onConflict((c) => c.column("id").doNothing())
      .execute();

    // Every board they're on or left a mark on, in one order, so two deletions can't wait on each other.
    const touched = await sql<{ board_id: string }>`
      select board_id from board_member where account_id = ${person}
      union select board_id from importance_vote where account_id = ${person}
      union select board_id from articulation_vote where account_id = ${person}
      union select board_id from assessment where account_id = ${person}
      union select board_id from argument where created_by = ${person}
      union select board_id from version where author_id = ${person} or hidden_by = ${person}
      union select board_id from version_revision where created_by = ${person}
      union select board_id from source where added_by = ${person} or unavailable_by = ${person}
      union select id from board where created_by = ${person}
      union select board_id from report where reporter_id = ${person} or resolved_by = ${person}
      order by 1`.execute(trx);

    for (const { board_id: boardId } of touched.rows) {
      const seq = Number((await sql<{ seq: string }>`select take_change_number(${boardId}) as seq`.execute(trx)).rows[0]!.seq);
      await withdrawJudgments(trx, boardId, person, seq);
      await deleteReports(trx, boardId, person, seq);
      await credit(trx, boardId, person, seq);
      const stays = await handOver(trx, boardId, person);
      if (!stays) await deleteBoard(trx, boardId, now, seq);
    }

    // The change log: what they did stays, done by the stand-in, with their ID scrubbed from what it recorded.
    const quoted = JSON.stringify(person);
    await trx
      .updateTable("change")
      .set({
        actor_id: sql`case when actor_id = ${person} then ${DELETED_ACCOUNT} else actor_id end`,
        before: sql`replace(before::text, ${quoted}, ${JSON.stringify(DELETED_ACCOUNT)})::jsonb`,
        after: sql`replace(after::text, ${quoted}, ${JSON.stringify(DELETED_ACCOUNT)})::jsonb`,
      } as never)
      .where((eb) => eb.or([eb("actor_id", "=", person), eb(sql`before::text`, "like", `%${quoted}%`), eb(sql`after::text`, "like", `%${quoted}%`)]))
      .execute();

    // Sign-in: sessions end, ways of signing in go, and so do codes waiting for their address.
    await trx.deleteFrom("sign_in.session").where("account_id", "=", person).execute();
    await trx.deleteFrom("sign_in.sign_in_method").where("account_id", "=", person).execute();
    if (account.email) {
      const email = account.email.toLowerCase();
      // Better Auth names each code by its purpose and the address.
      const identifiers = ["sign-in-otp-", "email-verification-otp-", "forget-password-otp-"].map((purpose) => purpose + email);
      await trx
        .deleteFrom("sign_in.sign_in_code")
        .where(sql<string>`lower(identifier)`, "in", identifiers)
        .execute();
    }

    // The person: email erased, marked deleted. The username is held (releaseHeldUsernames).
    await trx.updateTable("account").set({ email: null, email_verified: false, name: "", image: null, updated_at: now, deleted_at: now }).where("id", "=", person).execute();
    return "done";
  });
}

/** Their votes and assessments are deleted, and the counts they were part of recounted. */
/**
 * Their reports go (the deletion table), and the wordings they were on are stamped, so an Editor's open board
 * learns the count changed. Reports they resolved as a moderator are credited to the stand-in.
 */
async function deleteReports(trx: Trx, boardId: string, person: string, seq: number): Promise<void> {
  const versionIds = (await trx.deleteFrom("report").where("board_id", "=", boardId).where("reporter_id", "=", person).returning("version_id").execute()).map((row) => row.version_id);
  if (versionIds.length > 0) await trx.updateTable("version").set({ changed_seq: seq }).where("id", "in", versionIds).execute();
  await trx.updateTable("report").set({ resolved_by: DELETED_ACCOUNT }).where("board_id", "=", boardId).where("resolved_by", "=", person).execute();
}

async function withdrawJudgments(trx: Trx, boardId: string, person: string, seq: number): Promise<void> {
  const argumentIds = (await trx.deleteFrom("importance_vote").where("board_id", "=", boardId).where("account_id", "=", person).returning("argument_id").execute()).map((row) => row.argument_id);
  if (argumentIds.length > 0) {
    await trx
      .updateTable("argument")
      .set({
        importance: sql<number>`(select coalesce(sum(value), 0) from importance_vote where argument_id = argument.id)`,
        importance_voters: sql<number>`(select count(*) from importance_vote where argument_id = argument.id)`,
        changed_seq: seq,
      })
      .where("id", "in", argumentIds)
      .execute();
  }
  const preferred = (await trx.deleteFrom("articulation_vote").where("board_id", "=", boardId).where("account_id", "=", person).returning("version_id").execute()).map((row) => row.version_id);
  const assessed = (await trx.deleteFrom("assessment").where("board_id", "=", boardId).where("account_id", "=", person).returning("version_id").execute()).map((row) => row.version_id);
  const versionIds = [...new Set([...preferred, ...assessed])];
  if (versionIds.length > 0) {
    await trx
      .updateTable("version")
      .set({
        articulation: sql<number>`(select coalesce(sum(value), 0) from articulation_vote where version_id = version.id)`,
        articulation_voters: sql<number>`(select count(*) from articulation_vote where version_id = version.id)`,
        yes: sql<number>`(select count(*) from assessment where version_id = version.id and rev = version.current_rev and supported)`,
        no: sql<number>`(select count(*) from assessment where version_id = version.id and rev = version.current_rev and not supported)`,
        changed_seq: seq,
      })
      .where("id", "in", versionIds)
      .execute();
  }
}

/** What they wrote stays, credited to the stand-in. */
async function credit(trx: Trx, boardId: string, person: string, seq: number): Promise<void> {
  await trx.updateTable("argument").set({ created_by: DELETED_ACCOUNT, changed_seq: seq }).where("board_id", "=", boardId).where("created_by", "=", person).execute();
  await trx.updateTable("version").set({ author_id: DELETED_ACCOUNT, changed_seq: seq }).where("board_id", "=", boardId).where("author_id", "=", person).execute();
  await trx.updateTable("version").set({ hidden_by: DELETED_ACCOUNT, changed_seq: seq }).where("board_id", "=", boardId).where("hidden_by", "=", person).execute();
  await trx.updateTable("version_revision").set({ created_by: DELETED_ACCOUNT }).where("board_id", "=", boardId).where("created_by", "=", person).execute();
  await trx.updateTable("source").set({ added_by: DELETED_ACCOUNT, changed_seq: seq }).where("board_id", "=", boardId).where("added_by", "=", person).execute();
  await trx.updateTable("source").set({ unavailable_by: DELETED_ACCOUNT, changed_seq: seq }).where("board_id", "=", boardId).where("unavailable_by", "=", person).execute();
  await trx.updateTable("board").set({ created_by: DELETED_ACCOUNT }).where("id", "=", boardId).where("created_by", "=", person).execute();
}

/**
 * Their membership ends. A board they own passes to the longest-standing
 * editor, else contributor, unless it has another owner.
 *
 * @returns Whether the board stays: false when they owned it and nobody can take it.
 */
async function handOver(trx: Trx, boardId: string, person: string): Promise<boolean> {
  const mine = await trx.selectFrom("board_member").select("role").where("board_id", "=", boardId).where("account_id", "=", person).executeTakeFirst();
  await trx.deleteFrom("board_member").where("board_id", "=", boardId).where("account_id", "=", person).execute();
  if (mine?.role !== "owner") return true;
  const heir = await trx
    .selectFrom("board_member")
    .select(["account_id", "role"])
    .where("board_id", "=", boardId)
    .where("role", "in", HEIRS)
    .orderBy(sql`array_position(${sql.val(HEIRS)}::text[], role)`)
    .orderBy("joined_at")
    .orderBy("account_id")
    .executeTakeFirst();
  if (!heir) return false;
  if (heir.role !== "owner") await trx.updateTable("board_member").set({ role: "owner" }).where("board_id", "=", boardId).where("account_id", "=", heir.account_id).execute();
  return true;
}

/**
 * A board nobody else can take is deleted with the account (Q11). Like a
 * deleted wording, its rows stay with every text erased (invariant 6), so the
 * change log stays as it is (invariant 8); its link answers that it doesn't
 * exist. The votes on it go too.
 */
async function deleteBoard(trx: Trx, boardId: string, now: Date, seq: number): Promise<void> {
  await trx.updateTable("board").set({ question: "", deleted_at: now }).where("id", "=", boardId).execute();
  await trx.updateTable("option").set({ name: "", changed_seq: seq }).where("board_id", "=", boardId).execute();
  await trx.updateTable("version_revision").set({ wording: null, context: null }).where("board_id", "=", boardId).execute();
  await trx.updateTable("source").set({ name: "", locator: "", finding: "", backs_up: "", limits: "", changed_seq: seq }).where("board_id", "=", boardId).execute();
  await trx.deleteFrom("importance_vote").where("board_id", "=", boardId).execute();
  await trx.deleteFrom("articulation_vote").where("board_id", "=", boardId).execute();
  await trx.deleteFrom("assessment").where("board_id", "=", boardId).execute();
  await trx.updateTable("argument").set({ importance: 0, importance_voters: 0, changed_seq: seq }).where("board_id", "=", boardId).execute();
  await trx.updateTable("version").set({ articulation: 0, articulation_voters: 0, yes: 0, no: 0, changed_seq: seq }).where("board_id", "=", boardId).execute();
  await trx.deleteFrom("board_member").where("board_id", "=", boardId).execute();
}

/**
 * Releases the usernames of accounts deleted at least 30 days ago, so others
 * may take them. The daily scheduled call runs it (M1-14).
 *
 * @returns How many were released.
 */
export async function releaseHeldUsernames(db: Db, clock: Pick<Clock, "now">): Promise<number> {
  const before = new Date(clock.now().getTime() - USERNAME_HELD_DAYS * 86_400_000);
  const released = await db.updateTable("account").set({ username: null }).where("deleted_at", "<=", before).where("username", "is not", null).where("id", "!=", DELETED_ACCOUNT).executeTakeFirst();
  return Number(released.numUpdatedRows);
}
