// Reading a board (plans/architecture.md §3): the snapshot a browser gets
// when it opens a board, and the answer to "what has changed since change
// S?", which is the current state of every row stamped after S.
//
// Both read inside one "repeatable read" transaction, so the change number
// and the rows come from the same moment.

import { sql } from "kysely";
import type { Kysely } from "kysely";
import { webLink } from "@steelman/shared";
import type { ArgumentRow, BoardChanges, BoardOrder, BoardSnapshot, LogRow, OptionRow, SourceRow, VersionRow } from "@steelman/shared";
import type { Database, Db } from "./db/database.ts";

type Reader = Kysely<Database>;

const vote = (value: number | null): 1 | -1 | null => (value === 1 ? 1 : value === -1 ? -1 : null);

export async function readSnapshot(db: Db, boardId: string, person: string | null): Promise<BoardSnapshot | null> {
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
        versions: await versionRows(trx, boardId, person, { after: 0 }),
        sources: await sourceRows(trx, boardId, 0),
        order: order ? { arguments: order.arguments, versions: order.versions } as BoardOrder : { arguments: {}, versions: {} },
      };
    });
}

export async function readChanges(db: Db, boardId: string, person: string | null, after: number): Promise<BoardChanges | null> {
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
        versions: await versionRows(trx, boardId, person, { after }),
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
export async function versionRows(db: Reader, boardId: string, person: string | null, which: { after: number } | { ids: string[] }): Promise<VersionRow[]> {
  const me = person ?? "";
  const filter = "ids" in which ? sql`v.id = any(${which.ids})` : sql`v.changed_seq > ${which.after}`;
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
    changed_seq: string;
    my_vote: number | null;
    my_assessment: boolean | null;
  }>`
    select v.id, v.argument_id, v.author_id, author.username as author_name, v.created_seq,
           v.current_rev as rev, now_rev.wording, now_rev.context, before_rev.wording as previous_wording,
           coalesce((select array_agg(c.source_id order by c.source_id) from revision_source c
                     where c.version_id = v.id and c.rev = v.current_rev), '{}') as source_ids,
           v.articulation, v.articulation_voters, v.yes, v.no,
           v.deleted_at is not null as deleted, v.hidden_at is not null as hidden, v.changed_seq,
           my_vote.value as my_vote, my_assessment.supported as my_assessment
    from version v
    join account author on author.id = v.author_id
    join version_revision now_rev on now_rev.version_id = v.id and now_rev.rev = v.current_rev
    left join version_revision before_rev on before_rev.version_id = v.id and before_rev.rev = v.current_rev - 1
    left join articulation_vote my_vote on my_vote.version_id = v.id and my_vote.account_id = ${me}
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
    // A moderator's hidden wording isn't shown to readers (no moderators in M0).
    wording: row.hidden ? null : row.wording,
    context: row.hidden ? null : row.context,
    previousWording: row.hidden ? null : row.previous_wording,
    sourceIds: row.source_ids,
    articulation: row.articulation,
    articulationVoters: row.articulation_voters,
    yes: row.yes,
    no: row.no,
    deleted: row.deleted,
    hidden: row.hidden,
    changedSeq: Number(row.changed_seq),
    myVote: vote(row.my_vote),
    myAssessment: row.my_assessment,
  }));
}

async function sourceRows(db: Reader, boardId: string, after: number): Promise<SourceRow[]> {
  const rows = await db
    .selectFrom("source")
    .select(["id", "name", "locator", "finding", "backs_up", "limits", "unavailable_at", "changed_seq"])
    .where("board_id", "=", boardId)
    .where("changed_seq", ">", String(after))
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    locator: row.locator,
    link: webLink(row.locator),
    finding: row.finding,
    backsUp: row.backs_up,
    limits: row.limits,
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
    actorName: row.username,
    kind: row.kind,
    subjectKind: row.subject_kind,
    subjectId: row.subject_id,
    reason: row.reason,
  }));
}
