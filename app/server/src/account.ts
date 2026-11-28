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
// the account. A board in a space passes first to the space's Owner, else its
// longest-standing Admin, as they were before the deletion (M3d-18, M3d-33;
// architecture §2's deletion table). A space its Owner leaves passes to the
// longest-standing Admin, else the longest-standing Member who was invited;
// someone who joined by themselves never inherits it (M3d-33). Their blocks
// are deleted, and the blocks they wrote are credited to the stand-in (M3d-35).
// The username is held for 30 days. Analytics are anonymous, so PostHog
// isn't asked to delete anything.

import { sql } from "kysely";
import { emailAddress } from "@steelman/shared";
import type { Clock } from "@steelman/shared";
import type { Db } from "./db/database.ts";
import type { Trx } from "./write-path.ts";
import { heldUsername } from "./username.ts";

/** The stand-in that everything a deleted person wrote is credited to (migration 0009). */
export const DELETED_ACCOUNT = "deleted_account";

/**
 * The stand-in that the builder's operator changes are credited to, such as making a space private (J-06, M3d-36). The
 * first such change makes it, as the first deletion makes DELETED_ACCOUNT, and the name is reserved
 * (RESERVED_USERNAMES). It is made deleted, with no email, so it can't sign in and no one can find or invite it.
 */
export const OPERATOR_ACCOUNT = "steelman";

/** How long a deleted account's username stays unavailable to others (architecture §7, Retention). */
export const USERNAME_HELD_DAYS = 30;

/** Who should take a board its owner leaves, best first. Voters never do (the builder's decision, Nov 15). */
const HEIRS = ["owner", "editor", "contributor"];

export interface AccountSummary {
  username: string | null;
  email: string | null;
  /** How they have signed in: "Email code" for anyone with an email, and "Google" if linked. Used by Download your data; Your account lists both ways in for everyone (M2-8b). */
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
  const { created_at: joined, suspended_at: suspended } = await db.selectFrom("account").select(["created_at", "suspended_at"]).where("id", "=", person).executeTakeFirstOrThrow();

  const importance = await db
    .selectFrom("importance_vote")
    .select(["board_id", "argument_id", "value", "voted_at"])
    .where("account_id", "=", person)
    .orderBy("voted_at")
    .orderBy("argument_id")
    .execute();
  // Importance votes a combine set aside, kept so Undo can put them back (M3a-6).
  const setAside = await db
    .selectFrom("combine_vote")
    .select(["board_id", "seq", "from_id", "into_id", "from_value", "into_value", "asked_again"])
    .where("account_id", "=", person)
    .orderBy("board_id")
    .orderBy("seq")
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
  // Their comments (M3b-8): what each is on and what it says. One they deleted has no text left to give.
  const comments = await db
    .selectFrom("comment")
    .select(["id", "board_id", "option_id", "version_id", "body", "created_at"])
    .where("author_id", "=", person)
    .where("deleted_at", "is", null)
    .orderBy("created_at")
    .orderBy("id")
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
  // Every time they reported a source as one that can't be opened (C-02, M3a-3), from the change log, which keeps a
  // report after it's cleared; and whether it still stands: the source's latest report, still credited to them.
  const sourceReports = await db
    .selectFrom("change as c")
    .innerJoin("source as s", (join) => join.onRef("s.id", "=", "c.subject_id").onRef("s.board_id", "=", "c.board_id"))
    .select((eb) => [
      "c.board_id",
      "c.subject_id",
      "c.at",
      "c.seq",
      "s.unavailable_by",
      "s.unavailable_at",
      eb
        .selectFrom("change as later")
        .select((later) => later.fn.max("later.seq").as("seq"))
        .whereRef("later.board_id", "=", "c.board_id")
        .whereRef("later.subject_id", "=", "c.subject_id")
        .where("later.kind", "=", "source_unavailable")
        .as("latest"),
    ])
    .where("c.actor_id", "=", person)
    .where("c.kind", "=", "source_unavailable")
    .orderBy("c.seq")
    .execute();
  const memberships = await db.selectFrom("board_member").select(["board_id", "role"]).where("account_id", "=", person).execute();

  const boardIds = [...new Set([...memberships.map((m) => m.board_id), ...wrote.map((w) => w.board_id), ...sources.map((s) => s.board_id)])];
  const boards = boardIds.length
    ? await db.selectFrom("board").select(["id", "question", "created_by", "created_at", "space_id"]).where("id", "in", boardIds).where("deleted_at", "is", null).orderBy("created_at").orderBy("id").execute()
    : [];
  const options = boardIds.length ? await db.selectFrom("option").select(["board_id", "name"]).where("board_id", "in", boardIds).where("deleted_at", "is", null).orderBy("position").execute() : [];

  // An old username held for them after a change (L-04): which, and until when. Beside the account, not in it, so
  // the account's own fields stay as they were.
  const held = await heldUsername(db, person);
  // Their spaces (G-03, G-04, M3d-17): which, their role, and when they joined; a space's name and about text only
  // for one they made, as a board's question appears only on a board they asked. Never who else is in it. One they
  // joined by themselves says so (joinedVia, M3d-33); one they were invited to has no such key, so other exports
  // keep their shape.
  const spaces = await db
    .selectFrom("space_member as m")
    .innerJoin("space as s", "s.id", "m.space_id")
    .select(["m.space_id", "m.role", "m.joined_at", "m.joined_via", "s.name", "s.about", "s.created_by"])
    .where("m.account_id", "=", person)
    .where("s.deleted_at", "is", null)
    .orderBy("m.joined_at")
    .orderBy("m.space_id")
    .execute();
  // The spaces that removed them and haven't invited them back (G-07, M3d-35), with when. Never who removed them, and
  // not a space that was deleted since, as their memberships aren't listed for one.
  const removedFrom = await db
    .selectFrom("space_block as b")
    .innerJoin("space as s", "s.id", "b.space_id")
    .select(["b.space_id", "b.at"])
    .where("b.account_id", "=", person)
    .where("s.deleted_at", "is", null)
    .orderBy("b.at")
    .orderBy("b.space_id")
    .execute();

  return {
    exported: clock.now().toISOString(),
    account: { ...summary, joined: joined.toISOString() },
    heldUsername: held,
    // When the builder suspended the account (J-06, M3d-36), or null.
    suspended: suspended?.toISOString() ?? null,
    spaces: spaces.map((space) => ({
      space: space.space_id,
      role: space.role,
      joined: space.joined_at.toISOString(),
      ...(space.joined_via !== "invite" ? { joinedVia: space.joined_via } : {}),
      ...(space.created_by === person ? { name: space.name, about: space.about } : {}),
    })),
    removedFrom: removedFrom.map((block) => ({ space: block.space_id, at: block.at.toISOString() })),
    votes: {
      importance: importance.map((v) => ({ board: v.board_id, argument: v.argument_id, value: v.value, at: v.voted_at.toISOString() })),
      articulation: articulation.map((v) => ({ board: v.board_id, version: v.version_id, value: v.value, at: v.voted_at.toISOString() })),
      setAsideByCombine: setAside.map((v) => ({ board: v.board_id, combine: Number(v.seq), from: v.from_id, into: v.into_id, fromValue: v.from_value, intoValue: v.into_value, askedAgain: v.asked_again })),
      evidence: evidence.map((v) => ({ board: v.board_id, version: v.version_id, rev: v.rev, supported: v.supported, at: v.assessed_at.toISOString() })),
    },
    comments: comments.map((c) => ({ board: c.board_id, comment: c.id, version: c.version_id, option: c.option_id, body: c.body, at: c.created_at.toISOString() })),
    reports: reports.map((r) => ({ board: r.board_id, version: r.version_id, reason: r.reason, note: r.note, at: r.reported_at.toISOString(), withdrawn: r.withdrawn_at?.toISOString() ?? null })),
    sourceReports: sourceReports.map((r) => ({
      board: r.board_id,
      source: r.subject_id,
      at: r.at.toISOString(),
      standing: r.unavailable_at !== null && r.unavailable_by === person && String(r.latest) === String(r.seq),
    })),
    boards: boards.map((board) => ({
      board: board.id,
      link: `/b/${board.id}`,
      role: memberships.find((m) => m.board_id === board.id)?.role ?? null,
      // The space it's in (M3d-18), by ID, for a space they're in, as their memberships list it; no key otherwise.
      ...(board.space_id && spaces.some((space) => space.space_id === board.space_id) ? { space: board.space_id } : {}),
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

    // Who in each of their spaces may take a board, read before any space is handed over (M3d-33), so a Member whom
    // this deletion makes a space's Owner never takes the person's boards in it.
    const spaceHeirs = await boardHeirsBySpace(trx, person);
    // Their spaces next (M3d-17), each handed over or deleted.
    await handOverSpaces(trx, person, now);

    // Every board they're on or left a mark on, in one order, so two deletions can't wait on each other.
    const touched = await sql<{ board_id: string }>`
      select board_id from board_member where account_id = ${person}
      union select board_id from importance_vote where account_id = ${person}
      union select board_id from combine_vote where account_id = ${person}
      union select board_id from articulation_vote where account_id = ${person}
      union select board_id from assessment where account_id = ${person}
      union select board_id from argument where created_by = ${person}
      union select board_id from version where author_id = ${person} or hidden_by = ${person}
      union select board_id from version_revision where created_by = ${person}
      union select board_id from source where added_by = ${person} or unavailable_by = ${person}
      union select id from board where created_by = ${person}
      union select board_id from report where reporter_id = ${person} or resolved_by = ${person}
      union select board_id from comment where author_id = ${person} or hidden_by = ${person}
      order by 1`.execute(trx);

    for (const { board_id: boardId } of touched.rows) {
      const seq = Number((await sql<{ seq: string }>`select take_change_number(${boardId}) as seq`.execute(trx)).rows[0]!.seq);
      await withdrawJudgments(trx, boardId, person, seq);
      await deleteReports(trx, boardId, person, seq);
      await eraseComments(trx, boardId, person, now, seq);
      await credit(trx, boardId, person, seq);
      const stays = await handOver(trx, boardId, person, now, spaceHeirs);
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
      // In its one form (M3d-32), as Better Auth now keys codes, even for an account stored in another form before then.
      const email = emailAddress(account.email);
      // Better Auth names each code by its purpose and the address.
      const identifiers = ["sign-in-otp-", "email-verification-otp-", "forget-password-otp-"].map((purpose) => purpose + email);
      // A code for a new email (M2-8c) is named by the account's ID and the new address, since Better Auth 1.7.16
      // (GHSA-2f9c-7xj7-gh55; M3d-28). Codes asked for before that release were named by the old and new addresses,
      // and the second line erases those until the daily job does. starts_with, since _ would be a LIKE wildcard, and
      // the ID isn't lowered because IDs mix upper and lower case.
      await trx.deleteFrom("sign_in.sign_in_code").where(sql<boolean>`starts_with(identifier, ${`change-email-otp-${person}:`})`).execute();
      await trx.deleteFrom("sign_in.sign_in_code").where(sql<boolean>`starts_with(lower(identifier), ${`change-email-otp-${email}-`})`).execute();
      await trx
        .deleteFrom("sign_in.sign_in_code")
        .where(sql<string>`lower(identifier)`, "in", identifiers)
        .execute();
    }

    // The person: email erased, marked deleted. The username is held (releaseHeldUsernames). An old name held after
    // a username change (L-04) keeps its hold until it ends: username_hold isn't touched, so no one takes it at once.
    await trx.updateTable("account").set({ email: null, email_verified: false, name: "", image: null, updated_at: now, deleted_at: now }).where("id", "=", person).execute();
    return "done";
  });
}

/**
 * Who should take a space its Owner leaves, best first (architecture §2, the deletion table): an Admin, however they
 * came in, then a Member who was invited (joined_via "invite"). A Member who joined by themselves (joined_via "join",
 * M3d-20) never inherits a space (M3d-33).
 */
const SPACE_HEIRS = ["admin", "member"];

/**
 * Their spaces (G-03, G-04, M3d-17, M3d-33; architecture §2, the deletion table): each membership ends. A space they
 * own passes to the longest-standing Admin, else the longest-standing Member who was invited. With no such heir, it is
 * deleted, as a space with no one else in it is: its name and about text are erased and its row is kept, as a deleted
 * board's is, and the members who joined by themselves no longer find it. A space they made is credited to the
 * stand-in, and their ID is scrubbed from its change rows. Locked in ID order, so two deletions can't wait on each other.
 * Their blocks are deleted in every space, and a block they wrote is credited to the stand-in, as their change rows are
 * (M3d-35), so it keeps the person out after the remover's account is gone.
 */
async function handOverSpaces(trx: Trx, person: string, now: Date): Promise<void> {
  const touched = await sql<{ id: string }>`
    select space_id as id from space_member where account_id = ${person}
    union select id from space where created_by = ${person}
    order by 1`.execute(trx);
  for (const { id } of touched.rows) {
    await trx.selectFrom("space").select("id").where("id", "=", id).forUpdate().executeTakeFirst();
    const mine = await trx.selectFrom("space_member").select("role").where("space_id", "=", id).where("account_id", "=", person).executeTakeFirst();
    await trx.deleteFrom("space_member").where("space_id", "=", id).where("account_id", "=", person).execute();
    if (mine?.role === "owner") {
      const heir = await trx
        .selectFrom("space_member")
        .select("account_id")
        .where("space_id", "=", id)
        .where((eb) => eb.or([eb("role", "=", "admin"), eb.and([eb("role", "=", "member"), eb("joined_via", "=", "invite")])]))
        .orderBy(sql`array_position(${sql.val(SPACE_HEIRS)}::text[], role)`)
        .orderBy("joined_at")
        .orderBy("account_id")
        .executeTakeFirst();
      if (heir) await trx.updateTable("space_member").set({ role: "owner" }).where("space_id", "=", id).where("account_id", "=", heir.account_id).execute();
      else await trx.updateTable("space").set({ name: "", about: "", deleted_at: now }).where("id", "=", id).execute();
    }
    await trx.updateTable("space").set({ created_by: DELETED_ACCOUNT }).where("id", "=", id).where("created_by", "=", person).execute();
  }
  // In every space, not only theirs: a person removed from a space isn't in it any more.
  await trx.deleteFrom("space_block").where("account_id", "=", person).execute();
  await trx.updateTable("space_block").set({ blocked_by: DELETED_ACCOUNT }).where("blocked_by", "=", person).execute();
  const quoted = JSON.stringify(person);
  await trx
    .updateTable("space_change")
    .set({
      actor_id: sql`case when actor_id = ${person} then ${DELETED_ACCOUNT} else actor_id end`,
      before: sql`replace(before::text, ${quoted}, ${JSON.stringify(DELETED_ACCOUNT)})::jsonb`,
      after: sql`replace(after::text, ${quoted}, ${JSON.stringify(DELETED_ACCOUNT)})::jsonb`,
    } as never)
    .where((eb) => eb.or([eb("actor_id", "=", person), eb(sql`before::text`, "like", `%${quoted}%`), eb(sql`after::text`, "like", `%${quoted}%`)]))
    .execute();
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

/**
 * Their comments lose their text and author and stay as deleted rows, as a deleted wording's do (M3b-8; architecture
 * §2, the deletion table), so a thread with replies still reads. A comment they hid as a moderator is credited to the
 * stand-in.
 */
async function eraseComments(trx: Trx, boardId: string, person: string, now: Date, seq: number): Promise<void> {
  await trx
    .updateTable("comment")
    .set({ body: null, author_id: DELETED_ACCOUNT, deleted_at: sql`coalesce(deleted_at, ${now})`, changed_seq: seq } as never)
    .where("board_id", "=", boardId)
    .where("author_id", "=", person)
    .execute();
  await trx.updateTable("comment").set({ hidden_by: DELETED_ACCOUNT, changed_seq: seq }).where("board_id", "=", boardId).where("hidden_by", "=", person).execute();
}

async function withdrawJudgments(trx: Trx, boardId: string, person: string, seq: number): Promise<void> {
  // Votes a combine set aside, to put back if it's undone, are votes too (M3a-6).
  await trx.deleteFrom("combine_vote").where("board_id", "=", boardId).where("account_id", "=", person).execute();
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
 * Who in a board's space should take it, best first (M3d-18, M3d-33; architecture §2, the deletion table): the space's
 * Owner, then its longest-standing Admin, as they were before the deletion. Someone the same deletion makes the
 * space's Owner doesn't count, so a Member it promotes never takes the deleted person's boards.
 */
const SPACE_BOARD_HEIRS = ["owner", "admin"];

/** For each space, who should take a board in it: an account, or null for no one. */
type SpaceBoardHeirs = ReadonlyMap<string, string | null>;

/**
 * Who would take a board in each space the person is in or made, read before handOverSpaces changes any of them
 * (M3d-33). The spaces are locked first, in the same ID order handOverSpaces locks them, so no role changes between
 * this read and the hand-over, and two deletions still can't wait on each other.
 */
async function boardHeirsBySpace(trx: Trx, person: string): Promise<SpaceBoardHeirs> {
  const touched = await sql<{ id: string }>`
    select space_id as id from space_member where account_id = ${person}
    union select id from space where created_by = ${person}
    order by 1`.execute(trx);
  const heirs = new Map<string, string | null>();
  for (const { id } of touched.rows) {
    await trx.selectFrom("space").select("id").where("id", "=", id).forUpdate().executeTakeFirst();
    heirs.set(id, (await spaceBoardHeir(trx, id, person))?.account_id ?? null);
  }
  return heirs;
}

/** A space's Owner, else its longest-standing Admin, leaving out the person; none in a deleted space. */
function spaceBoardHeir(trx: Trx, spaceId: string, person: string) {
  return trx
    .selectFrom("space_member as sm")
    .innerJoin("space as s", "s.id", "sm.space_id")
    .select("sm.account_id")
    .where("sm.space_id", "=", spaceId)
    .where("s.deleted_at", "is", null)
    .where("sm.role", "in", SPACE_BOARD_HEIRS)
    .where("sm.account_id", "!=", person)
    .orderBy(sql`array_position(${sql.val(SPACE_BOARD_HEIRS)}::text[], sm.role)`)
    .orderBy("sm.joined_at")
    .orderBy("sm.account_id")
    .executeTakeFirst();
}

/**
 * Their membership ends. A board they own in a space passes to the space's Owner, else its longest-standing Admin, as
 * they were before the deletion (`spaceHeirs`, read before their spaces were handed over), so a Member whom the same
 * deletion makes the space's Owner never takes it. A board in a space the person had already left is read now, since
 * this deletion changes nothing there. Without such an heir, the board passes to its longest-standing editor, else
 * contributor, unless it has another owner.
 *
 * @returns Whether the board stays: false when they owned it and nobody can take it.
 */
async function handOver(trx: Trx, boardId: string, person: string, now: Date, spaceHeirs: SpaceBoardHeirs): Promise<boolean> {
  const mine = await trx.selectFrom("board_member").select("role").where("board_id", "=", boardId).where("account_id", "=", person).executeTakeFirst();
  await trx.deleteFrom("board_member").where("board_id", "=", boardId).where("account_id", "=", person).execute();
  if (mine?.role !== "owner") return true;
  const { space_id: spaceId } = await trx.selectFrom("board").select("space_id").where("id", "=", boardId).executeTakeFirstOrThrow();
  const fromSpace = spaceId === null ? null : spaceHeirs.has(spaceId) ? spaceHeirs.get(spaceId)! : ((await spaceBoardHeir(trx, spaceId, person))?.account_id ?? null);
  if (fromSpace) {
    // They may not be on the board yet, or may have come by the link: either way, they're its Owner by name now.
    await trx
      .insertInto("board_member")
      .values({ board_id: boardId, account_id: fromSpace, role: "owner", joined_via: "invite", joined_at: now })
      .onConflict((c) => c.columns(["board_id", "account_id"]).doUpdateSet({ role: "owner", joined_via: "invite" }))
      .execute();
    return true;
  }
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
  await trx.updateTable("comment").set({ body: null, deleted_at: sql`coalesce(deleted_at, ${now})`, changed_seq: seq } as never).where("board_id", "=", boardId).execute();
  await trx.deleteFrom("importance_vote").where("board_id", "=", boardId).execute();
  await trx.deleteFrom("combine_vote").where("board_id", "=", boardId).execute();
  await trx.deleteFrom("articulation_vote").where("board_id", "=", boardId).execute();
  await trx.deleteFrom("assessment").where("board_id", "=", boardId).execute();
  await trx.updateTable("argument").set({ importance: 0, importance_voters: 0, changed_seq: seq }).where("board_id", "=", boardId).execute();
  await trx.updateTable("version").set({ articulation: 0, articulation_voters: 0, yes: 0, no: 0, changed_seq: seq }).where("board_id", "=", boardId).execute();
  await trx.deleteFrom("board_member").where("board_id", "=", boardId).execute();
}

/**
 * Releases the usernames of accounts deleted at least 30 days ago, so others
 * may take them, but never the two stand-ins'. The daily scheduled call runs it (M1-14).
 *
 * @returns How many were released.
 */
export async function releaseHeldUsernames(db: Db, clock: Pick<Clock, "now">): Promise<number> {
  const before = new Date(clock.now().getTime() - USERNAME_HELD_DAYS * 86_400_000);
  const released = await db.updateTable("account").set({ username: null }).where("deleted_at", "<=", before).where("username", "is not", null).where("id", "not in", [DELETED_ACCOUNT, OPERATOR_ACCOUNT]).executeTakeFirst();
  return Number(released.numUpdatedRows);
}
