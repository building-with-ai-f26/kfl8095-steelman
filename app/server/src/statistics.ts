// Your statistics (L-09, M3d-14; plans/architecture.md §7 "Who sees what
// about people"): counts of what a person wrote, shown to them alone on Your
// account. Nothing is stored for them: they're worked out from the tables
// Steelman already keeps each time the page asks, in one snapshot, so the
// counts agree with each other.
//
// Only boards where the person still has a role count. Today that is a
// board_member row on a board that isn't deleted, as the list reads it
// (list.ts), so a board they were removed from, or whose link was turned off,
// drops out with their membership. Spaces (M3d-17) will add a second way in.
// Deleted, hidden, and merged items are left out, and so are comments whose
// wording or option has gone, as read.ts's commentRows leaves them out, and
// sources that no shown wording cites now.
//
// No vote or assessment table is read, so no one's vote counts as anyone's,
// and nothing here says how the person voted. "In its option's top three"
// and "leads its row" follow the board's Strongest case rule (rankLive and
// CASE_SIZE in shared/src/strongest.ts) over the newest published order, as
// readers were last sent it. Reading never publishes a new one: that's a
// write, and this is a read across many boards.
//
// A board counts as one the person took part in when they wrote something
// counted on it. Joining a board, by invitation or by its link, isn't taking
// part, and nor is voting.

import { sql } from "kysely";
import type { Kysely } from "kysely";
import { CASE_SIZE, ROLES, rankLive } from "@steelman/shared";
import type { AccountStatistics, BoardOrder } from "@steelman/shared";
import type { Database, Db } from "./db/database.ts";

type Reader = Kysely<Database>;

/** The person's statistics, or null when there's no such account (or it was deleted), which the route answers 401. */
export async function accountStatistics(db: Db, person: string): Promise<AccountStatistics | null> {
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const account = await trx.selectFrom("account").select("id").where("id", "=", person).where("deleted_at", "is", null).executeTakeFirst();
      if (!account) return null;
      return countFor(trx, person);
    });
}

async function countFor(trx: Reader, person: string): Promise<AccountStatistics> {
  // The boards where the person has a role. M3d-17: union the boards shared with a space they're a member of.
  const myBoards = sql`
    select m.board_id from board_member m
    join board b on b.id = m.board_id
    where m.account_id = ${person} and b.deleted_at is null and m.role = any(${[...ROLES]})`;

  // The arguments that stand: not deleted, not merged, on an option that stands, with a wording still shown.
  const mine = await sql<{ id: string; board_id: string; option_id: string; kind: "argument" | "wording" }>`
    select a.id, a.board_id, a.option_id, 'argument' as kind
    from argument a
    join option o on o.board_id = a.board_id and o.id = a.option_id
    where a.created_by = ${person}
      and a.board_id in (${myBoards})
      and a.deleted_at is null and a.merged_into is null and o.deleted_at is null
      and exists (select 1 from version v where v.board_id = a.board_id and v.argument_id = a.id and v.deleted_at is null and v.hidden_at is null)
    union all
    select v.id, v.board_id, v.argument_id as option_id, 'wording' as kind
    from version v
    join argument a on a.board_id = v.board_id and a.id = v.argument_id
    join option o on o.board_id = a.board_id and o.id = a.option_id
    where v.author_id = ${person}
      and v.board_id in (${myBoards})
      and v.deleted_at is null and v.hidden_at is null
      and a.deleted_at is null and a.merged_into is null and o.deleted_at is null`.execute(trx);
  const myArguments = mine.rows.filter((row) => row.kind === "argument");
  // For a wording, option_id carries its argument.
  const myWordings = mine.rows.filter((row) => row.kind === "wording");

  // A source counts while a wording that's shown cites it now, as the board shows it under that wording.
  const sources = await sql<{ board_id: string }>`
    select s.board_id from source s
    where s.added_by = ${person}
      and s.board_id in (${myBoards})
      and exists (
        select 1 from revision_source rs
        join version v on v.board_id = rs.board_id and v.id = rs.version_id and v.current_rev = rs.rev
        join argument a on a.board_id = v.board_id and a.id = v.argument_id
        join option o on o.board_id = a.board_id and o.id = a.option_id
        where rs.board_id = s.board_id and rs.source_id = s.id
          and v.deleted_at is null and v.hidden_at is null
          and a.deleted_at is null and a.merged_into is null and o.deleted_at is null)`.execute(trx);
  const comments = await sql<{ board_id: string }>`
    select c.board_id
    from comment c
    left join version v on v.board_id = c.board_id and v.id = c.version_id
    left join option o on o.board_id = c.board_id and o.id = c.option_id
    where c.author_id = ${person}
      and c.board_id in (${myBoards})
      and c.deleted_at is null and c.hidden_at is null
      and (c.version_id is null or (v.deleted_at is null and v.hidden_at is null))
      and (c.option_id is null or o.deleted_at is null)`.execute(trx);

  const { topThree, leading } = await standing(trx, myArguments, myWordings);
  return {
    arguments: myArguments.length,
    argumentsInTopThree: myArguments.filter((row) => topThree.has(row.id)).length,
    wordings: myWordings.length,
    wordingsLeading: myWordings.filter((row) => leading.has(row.id)).length,
    sources: sources.rows.length,
    comments: comments.rows.length,
    boards: new Set([...mine.rows, ...sources.rows, ...comments.rows].map((row) => row.board_id)).size,
  };
}

/**
 * Which arguments are in their option's top three, and which wordings lead their row, on the boards where the person
 * has one, by Strongest case's rule: the published order's live items in its order, then the rest in the order added,
 * leaving out arguments with no wording shown.
 */
async function standing(
  trx: Reader,
  myArguments: readonly { board_id: string }[],
  myWordings: readonly { board_id: string }[],
): Promise<{ topThree: Set<string>; leading: Set<string> }> {
  const topThree = new Set<string>();
  const leading = new Set<string>();
  const boards = [...new Set([...myArguments, ...myWordings].map((row) => row.board_id))];
  if (boards.length === 0) return { topThree, leading };

  const argumentRows = await trx
    .selectFrom("argument as a")
    .innerJoin("option as o", (join) => join.onRef("o.board_id", "=", "a.board_id").onRef("o.id", "=", "a.option_id"))
    .select(["a.id", "a.board_id", "a.option_id", "a.created_seq"])
    .where("a.board_id", "in", boards)
    .where("a.deleted_at", "is", null)
    .where("a.merged_into", "is", null)
    .where("o.deleted_at", "is", null)
    .execute();
  const versionRows = await trx
    .selectFrom("version")
    .select(["id", "board_id", "argument_id", "created_seq"])
    .where("board_id", "in", boards)
    .where("deleted_at", "is", null)
    .where("hidden_at", "is", null)
    .execute();
  const orders = await trx.selectFrom("published_order").select(["board_id", "arguments", "versions"]).where("board_id", "in", boards).execute();

  for (const board of boards) {
    const order = orders.find((row) => row.board_id === board);
    const published = (order ? { arguments: order.arguments, versions: order.versions } : { arguments: {}, versions: {} }) as BoardOrder;
    const live = (rows: { id: string; created_seq: string | number | bigint }[]) => rows.map((row) => ({ id: row.id, createdSeq: Number(row.created_seq) }));
    const wordingsOf = new Map<string, string[]>();
    for (const argument of argumentRows.filter((row) => row.board_id === board)) {
      const ranked = rankLive(published.versions[argument.id] ?? [], live(versionRows.filter((row) => row.board_id === board && row.argument_id === argument.id)));
      wordingsOf.set(argument.id, ranked);
      if (ranked[0] !== undefined) leading.add(ranked[0]);
    }
    for (const optionId of new Set(argumentRows.filter((row) => row.board_id === board).map((row) => row.option_id))) {
      const ranked = rankLive(published.arguments[optionId] ?? [], live(argumentRows.filter((row) => row.board_id === board && row.option_id === optionId)));
      // As Strongest case does, an argument with no wording shown takes no place.
      for (const id of ranked.filter((id) => (wordingsOf.get(id) ?? []).length > 0).slice(0, CASE_SIZE)) topThree.add(id);
    }
  }
  return { topThree, leading };
}
