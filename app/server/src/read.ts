// Reading a board (plans/architecture.md §3): the snapshot a browser gets
// when it opens a board, and the answer to "what has changed since change
// S?", which is the current state of every row stamped after S.
//
// Both read inside one "repeatable read" transaction, so the change number
// and the rows come from the same moment.

import { sql } from "kysely";
import type { Kysely } from "kysely";
import { REPORT_REASONS, webLink } from "@steelman/shared";
import type { ReportReason, ArgumentRow, BoardChanges, BoardOrder, BoardSnapshot, LogRow, OptionRow, SourceRow, VersionRow } from "@steelman/shared";
import type { Database, Db } from "./db/database.ts";

type Reader = Kysely<Database>;

const vote = (value: number | null): 1 | -1 | null => (value === 1 ? 1 : value === -1 ? -1 : null);

/** @param moderator Whether the reader is an Editor or the Owner, who see a wording's open reports (M2-3). */
export async function readSnapshot(db: Db, boardId: string, person: string | null, moderator = false): Promise<BoardSnapshot | null> {
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const board = await trx.selectFrom("board").select(["id", "question", "closed_at", "last_seq"]).where("id", "=", boardId).executeTakeFirst();
      if (!board) return null;
      const order = await trx.selectFrom("published_order").select(["arguments", "versions"]).where("board_id", "=", boardId).executeTakeFirst();
      return {
        board: { id: board.id, question: board.question, closed: board.closed_at !== null, seq: Number(board.last_seq) },
        options: await optionRows(trx, boardId, 0),
        arguments: await argumentRows(trx, boardId, person, 0),
        versions: await versionRows(trx, boardId, person, { after: 0 }, moderator),
        sources: await sourceRows(trx, boardId, 0),
        order: order ? { arguments: order.arguments, versions: order.versions } as BoardOrder : { arguments: {}, versions: {} },
      };
    });
}

export async function readChanges(db: Db, boardId: string, person: string | null, after: number, moderator = false): Promise<BoardChanges | null> {
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const board = await trx.selectFrom("board").select("last_seq").where("id", "=", boardId).executeTakeFirst();
      if (!board) return null;
      const seq = Number(board.last_seq);
      if (seq <= after) return { seq, options: [], arguments: [], versions: [], sources: [], order: null, log: [] };

      const order = await trx
        .selectFrom("published_order")
        .select(["arguments", "versions"])
        .where("board_id", "=", boardId)
        .where("changed_seq", ">", String(after))
        .executeTakeFirst();
      return {
        seq,
        options: await optionRows(trx, boardId, after),
        arguments: await argumentRows(trx, boardId, person, after),
        versions: await versionRows(trx, boardId, person, { after }, moderator),
        sources: await sourceRows(trx, boardId, after),
        order: order ? ({ arguments: order.arguments, versions: order.versions } as BoardOrder) : null,
        log: await logRows(trx, boardId, after),
      };
    });
}

async function optionRows(db: Reader, boardId: string, after: number): Promise<OptionRow[]> {
  const rows = await db
    .selectFrom("option")
    .select(["id", "name", "position", "deleted_at", "changed_seq"])
    .where("board_id", "=", boardId)
    .where("changed_seq", ">", String(after))
    .orderBy("position")
    .execute();
  return rows.map((row) => ({ id: row.id, name: row.name, position: row.position, deleted: row.deleted_at !== null, changedSeq: Number(row.changed_seq) }));
}

async function argumentRows(db: Reader, boardId: string, person: string | null, after: number): Promise<ArgumentRow[]> {
  const rows = await db
    .selectFrom("argument as a")
    .leftJoin("importance_vote as mine", (join) => join.onRef("mine.argument_id", "=", "a.id").on("mine.account_id", "=", person ?? ""))
    .select(["a.id", "a.option_id", "a.created_seq", "a.importance", "a.importance_voters", "a.deleted_at", "a.merged_into", "a.changed_seq", "mine.value as my_vote"])
    .where("a.board_id", "=", boardId)
    .where("a.changed_seq", ">", String(after))
    .orderBy("a.created_seq")
    .orderBy("a.id")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    optionId: row.option_id,
    createdSeq: Number(row.created_seq),
    importance: row.importance,
    importanceVoters: row.importance_voters,
    deleted: row.deleted_at !== null,
    mergedInto: row.merged_into,
    changedSeq: Number(row.changed_seq),
    myVote: vote(row.my_vote),
  }));
}

/** Wordings as the reader sees them: rows stamped after `after`, or just the ones named in `ids`. */
export async function versionRows(db: Reader, boardId: string, person: string | null, which: { after: number } | { ids: string[] }, moderator = false): Promise<VersionRow[]> {
  const me = person ?? "";
  // Reports stamp themselves, not the wording (reports.ts): a moderator also gets each wording whose reports changed,
  // and anyone else each wording their own report on changed, so their menu offers Withdraw.
  const reported = moderator ? sql`true` : sql`r.reporter_id = ${me}`;
  const filter =
    "ids" in which
      ? sql`v.id = any(${which.ids})`
      : sql`(v.changed_seq > ${which.after} or exists (select 1 from report r where r.board_id = v.board_id and r.version_id = v.id and r.changed_seq > ${which.after} and ${reported}))`;
  const result = await sql<{
    id: string;
    argument_id: string;
    author_id: string;
    author_name: string;
    created_seq: string;
    rev: number;
    wording: string | null;
    context: string | null;
    previous_wording: string | null;
    source_ids: string[];
    articulation: number;
    articulation_voters: number;
    yes: number;
    no: number;
    deleted: boolean;
    hidden: boolean;
    hidden_reason: string | null;
    changed_seq: string;
    my_vote: number | null;
    my_assessment: boolean | null;
    my_report: string | null;
    report_reasons: Record<string, number> | null;
  }>`
    select v.id, v.argument_id, v.author_id, author.username as author_name, v.created_seq,
           v.current_rev as rev, now_rev.wording, now_rev.context, before_rev.wording as previous_wording,
           coalesce((select array_agg(c.source_id order by c.source_id) from revision_source c
                     where c.version_id = v.id and c.rev = v.current_rev), '{}') as source_ids,
           v.articulation, v.articulation_voters, v.yes, v.no,
           v.deleted_at is not null as deleted, v.hidden_at is not null as hidden, v.hidden_reason, v.changed_seq,
           my_vote.value as my_vote, my_assessment.supported as my_assessment, my_report.reason as my_report,
           -- Open reports by reason, for an Editor or the Owner only, and never who made them (M2-3).
           case when ${moderator} then (select jsonb_object_agg(reason, n) from (
             select r.reason, count(*)::int as n from report r
             where r.version_id = v.id and r.withdrawn_at is null and r.resolved_at is null group by r.reason) open_reports)
           end as report_reasons
    from version v
    join account author on author.id = v.author_id
    join version_revision now_rev on now_rev.version_id = v.id and now_rev.rev = v.current_rev
    -- The wording before the latest edit. Not simply the revision before this one: a change of sources saves a revision with the same text.
    left join lateral (
      select replaced.wording from version_revision edit
      join version_revision replaced on replaced.version_id = edit.version_id and replaced.rev = edit.rev - 1
      where edit.version_id = v.id and edit.why = 'edited'
      order by edit.rev desc limit 1
    ) before_rev on true
    left join articulation_vote my_vote on my_vote.version_id = v.id and my_vote.account_id = ${me}
    left join report my_report on my_report.version_id = v.id and my_report.reporter_id = ${me} and my_report.withdrawn_at is null and my_report.resolved_at is null
    left join assessment my_assessment on my_assessment.version_id = v.id and my_assessment.rev = v.current_rev and my_assessment.account_id = ${me}
    where v.board_id = ${boardId} and ${filter}
    order by v.created_seq, v.id`.execute(db);

  return result.rows.map((row) => ({
    id: row.id,
    argumentId: row.argument_id,
    authorId: row.author_id,
    authorName: row.author_name,
    createdSeq: Number(row.created_seq),
    rev: row.rev,
    // A hidden wording's text reaches only an Editor or the Owner, who may restore it (M2-4).
    wording: row.hidden && !moderator ? null : row.wording,
    context: row.hidden && !moderator ? null : row.context,
    previousWording: row.hidden && !moderator ? null : row.previous_wording,
    // A hidden wording's sources go with its text: spam's payload is often the link (M2-4).
    sourceIds: row.hidden && !moderator ? [] : row.source_ids,
    articulation: row.articulation,
    articulationVoters: row.articulation_voters,
    yes: row.yes,
    no: row.no,
    deleted: row.deleted,
    hidden: row.hidden,
    hiddenReason: row.hidden && (REPORT_REASONS as readonly string[]).includes(row.hidden_reason ?? "") ? (row.hidden_reason as ReportReason) : null,
    changedSeq: Number(row.changed_seq),
    myVote: vote(row.my_vote),
    myAssessment: row.my_assessment,
    myReport: (REPORT_REASONS as readonly string[]).includes(row.my_report ?? "") ? (row.my_report as ReportReason) : null,
    reports: row.report_reasons ? reportTally(row.report_reasons) : null,
  }));
}

/** Open reports by reason, as an Editor sees them: only reasons the service knows. */
function reportTally(byReason: Record<string, number>): VersionRow["reports"] {
  const reasons: Partial<Record<ReportReason, number>> = {};
  for (const reason of REPORT_REASONS) if (byReason[reason]) reasons[reason] = byReason[reason];
  const count = Object.values(reasons).reduce((sum, n) => sum + n, 0);
  return count > 0 ? { count, reasons } : null;
}

async function sourceRows(db: Reader, boardId: string, after: number): Promise<SourceRow[]> {
  const rows = await db
    .selectFrom("source as s")
    .innerJoin("account as adder", "adder.id", "s.added_by")
    .select(["s.id", "s.name", "s.locator", "s.finding", "s.backs_up", "s.limits", "s.added_by", "adder.username as added_by_name", "s.unavailable_at", "s.changed_seq"])
    .where("s.board_id", "=", boardId)
    .where("s.changed_seq", ">", String(after))
    .orderBy("s.created_at")
    .orderBy("s.id")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    locator: row.locator,
    link: webLink(row.locator),
    finding: row.finding,
    backsUp: row.backs_up,
    limits: row.limits,
    addedBy: row.added_by,
    // Only an account with a username can write (app.ts), so whoever added it has one.
    addedByName: row.added_by_name ?? "",
    unavailable: row.unavailable_at !== null,
    changedSeq: Number(row.changed_seq),
  }));
}

async function logRows(db: Reader, boardId: string, after: number): Promise<LogRow[]> {
  const rows = await db
    .selectFrom("change as c")
    .innerJoin("account as actor", "actor.id", "c.actor_id")
    .select(["c.seq", "c.at", "actor.username", "c.kind", "c.subject_kind", "c.subject_id", "c.reason"])
    .where("c.board_id", "=", boardId)
    .where("c.seq", ">", String(after))
    .orderBy("c.seq")
    .execute();
  return rows.map((row) => ({
    seq: Number(row.seq),
    at: row.at.toISOString(),
    // Only an account with a username can write (app.ts), so an actor always has one.
    actorName: row.username ?? "",
    kind: row.kind,
    subjectKind: row.subject_kind,
    subjectId: row.subject_id,
    reason: row.reason,
  }));
}
