// Profiles (L-03, M3d-16; plans/architecture.md §7 "Who sees what about
// people"): one person's arguments, wordings, and sources, gathered from the
// boards where the viewer already has a role. Any signed-in account may open
// anyone's profile (the builder, Nov 24), which says no more than inviting by
// username already says (M3b-7).
//
// The viewer's boards are their own board_member rows, the one recorded the
// first time they opened a board by its link included, on boards that aren't
// deleted, and the boards shared with everyone in a space the viewer is in
// (M3d-18), as the list finds them (access.ts's spaceBoards). Being able to open a
// board isn't enough: a board shared with anyone who has the link lets in
// every signed-in account with a confirmed email (access.ts's entryTo), so
// counting it would show a person's link-only boards to everyone, and the
// link is the only secret those boards have. So nothing here asks entryTo,
// and reading a profile records no membership. The person's own membership
// doesn't matter either: only what they wrote, and where.
//
// What stands is what Your statistics counts (statistics.ts): an argument
// that isn't deleted or merged, on an option that stands, with a wording
// still shown; a wording that is neither deleted nor hidden, on an argument
// that stands; and a source while a shown wording cites it now. Hidden items
// are left out for Editors and Owners too, so a profile reads the same to
// everyone who shares the board. As the prototype's tabs have it, the wording
// that started a person's own argument is that argument, and Wordings holds
// the rest. An argument shows only words its creator wrote: its earliest
// wording by them that is still shown. No vote, assessment, or comment table is read.
//
// A name held after a change (M3d-15) answers with the account's new name,
// and the page moves to the new address. A hold that has ended, a deleted
// account's name and its hold, and deleted_account itself answer as unknown.

import { sql } from "kysely";
import type { Kysely } from "kysely";
import { ROLES } from "@steelman/shared";
import type { Clock, Profile, ProfileItem } from "@steelman/shared";
import { spaceBoards } from "./access.ts";
import type { Database, Db } from "./db/database.ts";

type Reader = Kysely<Database>;

/** The most items one tab sends, newest first, as History sends its newest (history.ts). */
const MOST = 500;

/**
 * Names the route looks up. Usernames picked in the app are letters, numbers, and underscores (USERNAME in
 * shared/src/inputs.ts), but the demo's people have dots in theirs, and test accounts can have hyphens. Anything
 * else names no one, and isn't worth asking the database about.
 */
export const PROFILE_NAME = /^[A-Za-z0-9_.-]{1,40}$/;

/**
 * The profile of the person called `typed`, as `viewer` may read it. Null when no account that isn't deleted has the
 * name, or holds it after a change, which the route answers 404. "signed_out" when the viewer's own account is gone.
 */
export async function readProfile(db: Db, clock: Clock, viewer: string, typed: string): Promise<Profile | "signed_out" | null> {
  const now = clock.now();
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const reader = await trx.selectFrom("account").select("id").where("id", "=", viewer).where("deleted_at", "is", null).executeTakeFirst();
      if (!reader) return "signed_out" as const;
      const person = await whoIsCalled(trx, typed.toLowerCase(), now);
      if (!person) return null;
      return { username: person.username, you: person.id === viewer, now: now.toISOString(), ...(await writingOf(trx, person.id, viewer)) };
    });
}

/** The account called `name` now, or else the one holding it as an old name until its hold ends. */
async function whoIsCalled(trx: Reader, name: string, now: Date): Promise<{ id: string; username: string } | null> {
  const current = await sql<{ id: string; username: string }>`
    select id, username from account where lower(username) = ${name} and deleted_at is null`.execute(trx);
  if (current.rows[0]) return current.rows[0];
  const held = await sql<{ id: string; username: string }>`
    select a.id, a.username from username_hold h
    join account a on a.id = h.account_id
    where lower(h.old_name) = ${name} and h.ends_at > ${now} and a.deleted_at is null and a.username is not null`.execute(trx);
  return held.rows[0] ?? null;
}

interface Row {
  id: string;
  board: string;
  question: string;
  version: string;
  text: string;
  at: Date;
}

async function writingOf(trx: Reader, person: string, viewer: string): Promise<Pick<Profile, "arguments" | "wordings" | "sources">> {
  // The boards where the viewer has a role: their own, and those shared with everyone in a space they're in (M3d-18).
  const viewerBoards = sql`
    select m.board_id from board_member m
    join board b on b.id = m.board_id
    where m.account_id = ${viewer} and b.deleted_at is null and m.role = any(${[...ROLES]})
    union select board_id from (${spaceBoards(viewer)}) by_space`;
  // An argument is the person's own words: its card is the earliest wording still shown that the argument's creator
  // wrote. The earliest shown wording by anyone could be another person's, when the creator's first wording is hidden
  // or deleted, or when an older wording by someone else is combined in, and then a profile would credit one person's
  // words to another. An argument with no shown wording by its creator isn't on their profile.
  const ownCard = sql`
    select distinct on (v.board_id, v.argument_id) v.board_id, v.argument_id, v.id, v.current_rev
    from version v
    join argument a on a.board_id = v.board_id and a.id = v.argument_id
    where v.board_id in (${viewerBoards}) and v.author_id = a.created_by and v.deleted_at is null and v.hidden_at is null
    order by v.board_id, v.argument_id, v.created_seq, v.id`;

  const myArguments = await sql<Row>`
    select a.id, a.board_id as board, b.question, f.id as version, r.wording as text, a.created_at as at
    from argument a
    join board b on b.id = a.board_id
    join option o on o.board_id = a.board_id and o.id = a.option_id
    join (${ownCard}) f on f.board_id = a.board_id and f.argument_id = a.id
    join version_revision r on r.board_id = f.board_id and r.version_id = f.id and r.rev = f.current_rev
    where a.created_by = ${person}
      and a.board_id in (${viewerBoards})
      and a.deleted_at is null and a.merged_into is null and o.deleted_at is null
    order by a.created_at desc, a.id
    limit ${MOST}`.execute(trx);

  // Every other shown wording the person wrote: on someone else's argument, or a later one on their own. On their own
  // argument, only the earliest shown one is the argument's card, so a wording stays here when an earlier shown one of
  // theirs is on the same argument.
  const myWordings = await sql<Row>`
    select v.id, v.board_id as board, b.question, v.id as version, r.wording as text, v.created_at as at
    from version v
    join board b on b.id = v.board_id
    join argument a on a.board_id = v.board_id and a.id = v.argument_id
    join option o on o.board_id = a.board_id and o.id = a.option_id
    join version_revision r on r.board_id = v.board_id and r.version_id = v.id and r.rev = v.current_rev
    where v.author_id = ${person}
      and v.board_id in (${viewerBoards})
      and v.deleted_at is null and v.hidden_at is null
      and a.deleted_at is null and a.merged_into is null and o.deleted_at is null
      and (a.created_by <> ${person} or exists (
        select 1 from version e
        where e.board_id = v.board_id and e.argument_id = v.argument_id and e.author_id = ${person}
          and e.deleted_at is null and e.hidden_at is null
          and (e.created_seq, e.id) < (v.created_seq, v.id)))
    order by v.created_at desc, v.id
    limit ${MOST}`.execute(trx);

  // A source opens the earliest shown wording that cites it now, as the board shows it under that wording.
  const mySources = await sql<Row>`
    select s.id, s.board_id as board, b.question, c.version_id as version, s.name as text, s.created_at as at
    from source s
    join board b on b.id = s.board_id
    join lateral (
      select v.id as version_id from revision_source rs
      join version v on v.board_id = rs.board_id and v.id = rs.version_id and v.current_rev = rs.rev
      join argument a on a.board_id = v.board_id and a.id = v.argument_id
      join option o on o.board_id = a.board_id and o.id = a.option_id
      where rs.board_id = s.board_id and rs.source_id = s.id
        and v.deleted_at is null and v.hidden_at is null
        and a.deleted_at is null and a.merged_into is null and o.deleted_at is null
      order by v.created_seq, v.id
      limit 1) c on true
    where s.added_by = ${person}
      and s.board_id in (${viewerBoards})
    order by s.created_at desc, s.id
    limit ${MOST}`.execute(trx);

  return { arguments: myArguments.rows.map(item), wordings: myWordings.rows.map(item), sources: mySources.rows.map(item) };
}

function item(row: Row): ProfileItem {
  return { id: row.id, board: row.board, question: row.question, version: row.version, text: row.text, at: new Date(row.at).toISOString() };
}
