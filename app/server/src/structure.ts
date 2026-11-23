// Combining and separating (M3a-6, A-10; plans/architecture.md §2 and §3),
// and undoing either, as the prototype's drag has them and the builder chose
// (Nov 22): an Editor's or the Owner's (the structure action).
//
// Combine moves one wording into another argument in the same option. A
// wording's ID never changes (invariant 4), so its articulation votes,
// assessments, and link go with it (Q8). When it was its argument's last
// wording, the two arguments become one: the argument left empty keeps its
// row with `merged_into`, so old links and offline votes follow it, and
// importance votes merge per person (PRD §5): two identical votes become
// one; two that disagree are both removed and the person is asked to vote
// again; a vote on only the first moves. What each person's votes were is
// kept in combine_vote, never in the change log (invariant 7).
//
// Separate makes one wording its own argument, at the end of its option,
// with no importance votes. The browser names the new argument, so sending
// it twice is once (invariant 10).
//
// Undo puts either back as a change of its own (the log is append-only):
// wordings added since stay where they were added, and a vote cast since
// wins over the one it would restore. A wording moved again since, or an
// argument combined again since, isn't undone, and says so. An argument an
// undo leaves with no wording closes: none stays on the board empty.

import { sql } from "kysely";
import type { CombinePreview } from "@steelman/shared";
import type { Db } from "./db/database.ts";
import { idUsed } from "./options.ts";
import { writeToBoard } from "./write-path.ts";
import type { Services, Trx, WriteResult } from "./write-path.ts";

interface ArgumentState {
  id: string;
  option_id: string;
  deleted_at: Date | null;
  merged_into: string | null;
}

const loadArgument = async (trx: Trx, boardId: string, id: string): Promise<ArgumentState | null> =>
  (await trx.selectFrom("argument").select(["id", "option_id", "deleted_at", "merged_into"]).where("id", "=", id).where("board_id", "=", boardId).executeTakeFirst()) ?? null;

const isLive = (argument: ArgumentState) => argument.deleted_at === null && argument.merged_into === null;

/** Recounts an argument's cached importance from its votes, and stamps it. */
async function recount(trx: Trx, argumentId: string, seq: number): Promise<void> {
  await trx
    .updateTable("argument")
    .set({
      importance: sql<number>`(select coalesce(sum(value), 0) from importance_vote where argument_id = ${argumentId})`,
      importance_voters: sql<number>`(select count(*) from importance_vote where argument_id = ${argumentId})`,
      changed_seq: seq,
    })
    .where("id", "=", argumentId)
    .execute();
}

/** Sets one person's importance vote on an argument, or with null takes it away. */
async function setVote(trx: Trx, boardId: string, argumentId: string, account: string, value: number | null, now: Date): Promise<void> {
  await trx.deleteFrom("importance_vote").where("argument_id", "=", argumentId).where("account_id", "=", account).execute();
  if (value !== null) await trx.insertInto("importance_vote").values({ argument_id: argumentId, account_id: account, board_id: boardId, value, voted_at: now }).execute();
}

export function combineWording({ db, clock }: Services, boardId: string, person: string | null, versionId: string, intoId: string): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "structure",
    load: async (trx) => {
      const version = await trx.selectFrom("version").select(["argument_id", "deleted_at"]).where("id", "=", versionId).where("board_id", "=", boardId).executeTakeFirst();
      if (!version) return null;
      const from = await loadArgument(trx, boardId, version.argument_id);
      const into = await loadArgument(trx, boardId, intoId);
      return from && into ? { version, from, into } : null;
    },
    stale: async (_trx, { version, from, into }) => {
      if (from.id === into.id) return null; // Sent again: already done.
      if (version.deleted_at) return { refused: "version_deleted" };
      if (from.option_id !== into.option_id) return { refused: "not_same_option" };
      return isLive(from) && isLive(into) ? null : { refused: "argument_deleted" };
    },
    async change(trx, { from, into }, seq) {
      if (from.id === into.id) return "already_done";
      const now = clock.now();
      await trx.updateTable("version").set({ argument_id: into.id, changed_seq: seq }).where("id", "=", versionId).execute();
      // A hidden wording still keeps its argument (writing.ts), so it counts as one left behind.
      const left = await trx.selectFrom("version").select("id").where("argument_id", "=", from.id).where("deleted_at", "is", null).executeTakeFirst();
      if (!left) await mergeArguments(trx, { boardId, seq, now, fromId: from.id, intoId: into.id });
      await log(trx, now, {
        boardId,
        seq,
        person: person!,
        kind: "wording_combined",
        subjectKind: "version",
        subjectId: versionId,
        after: { from: from.id, into: into.id, ...(left ? {} : { merged: true }) },
      });
      return "done";
    },
  });
}

/** The arguments become one: `from`, now empty, points at `into`, and importance votes merge per person. */
async function mergeArguments(trx: Trx, m: { boardId: string; seq: number; now: Date; fromId: string; intoId: string }): Promise<void> {
  // Per person: identical become one, disagreeing are removed and asked again, a vote only on `from` moves.
  const votesOn = async (id: string) => new Map((await trx.selectFrom("importance_vote").select(["account_id", "value"]).where("argument_id", "=", id).execute()).map((v) => [v.account_id, v.value]));
  const fromVotes = await votesOn(m.fromId);
  const intoVotes = await votesOn(m.intoId);
  for (const [account, fromValue] of fromVotes) {
    const intoValue = intoVotes.get(account) ?? null;
    const disagree = intoValue !== null && intoValue !== fromValue;
    const after = disagree ? null : (intoValue ?? fromValue);
    await setVote(trx, m.boardId, m.fromId, account, null, m.now);
    await setVote(trx, m.boardId, m.intoId, account, after, m.now);
    await trx
      .insertInto("combine_vote")
      .values({ board_id: m.boardId, seq: m.seq, account_id: account, from_id: m.fromId, into_id: m.intoId, from_value: fromValue, into_value: intoValue, after_value: after, asked_again: disagree })
      .execute();
  }
  // Someone still asked to vote again on `from`, who hasn't voted on `into`, is asked there now.
  const stillAsked = await trx
    .selectFrom("combine_vote")
    .select("account_id")
    .distinct()
    .where("into_id", "=", m.fromId)
    .where("asked_again", "=", true)
    .where("account_id", "not in", [...fromVotes.keys(), ...intoVotes.keys(), ""])
    .execute();
  for (const { account_id: account } of stillAsked) {
    await trx
      .insertInto("combine_vote")
      .values({ board_id: m.boardId, seq: m.seq, account_id: account, from_id: m.fromId, into_id: m.intoId, from_value: null, into_value: null, after_value: null, asked_again: true })
      .execute();
  }
  await trx.updateTable("argument").set({ merged_into: m.intoId, changed_seq: m.seq }).where("id", "=", m.fromId).execute();
  await recount(trx, m.fromId, m.seq);
  await recount(trx, m.intoId, m.seq);
}

export function separateWording({ db, clock }: Services, boardId: string, person: string | null, versionId: string, newId: string): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "structure",
    load: async (trx) => {
      const version = await trx.selectFrom("version").select(["argument_id", "deleted_at"]).where("id", "=", versionId).where("board_id", "=", boardId).executeTakeFirst();
      if (!version) return null;
      const argument = await loadArgument(trx, boardId, version.argument_id);
      return argument ? { version, argument } : null;
    },
    stale: async (_trx, { version }) => (version.deleted_at ? { refused: "version_deleted" } : null),
    async change(trx, { version, argument }, seq) {
      const existing = await trx.selectFrom("argument").select(["board_id", "created_by"]).where("id", "=", newId).executeTakeFirst();
      if (existing) return existing.board_id === boardId && existing.created_by === person && version.argument_id === newId ? "already_done" : { refused: "id_taken" };
      if (await idUsed(trx, newId)) return { refused: "id_taken" };
      if (!isLive(argument)) return { refused: "argument_deleted" };
      // A hidden wording still keeps its argument (writing.ts), so it counts as one left behind.
      const others = await trx.selectFrom("version").select("id").where("argument_id", "=", argument.id).where("id", "!=", versionId).where("deleted_at", "is", null).executeTakeFirst();
      if (!others) return { refused: "only_wording" };
      const now = clock.now();
      await trx
        .insertInto("argument")
        .values({ id: newId, board_id: boardId, option_id: argument.option_id, created_by: person!, created_at: now, created_seq: seq, changed_seq: seq })
        .execute();
      await trx.updateTable("version").set({ argument_id: newId, changed_seq: seq }).where("id", "=", versionId).execute();
      await log(trx, now, { boardId, seq, person: person!, kind: "wording_separated", subjectKind: "version", subjectId: versionId, after: { from: argument.id, argument: newId } });
      return "done";
    },
  });
}

/** Undoes a combine or a separation, by its change number. Undoing one already undone is already done. */
export function undoStructure({ db, clock }: Services, boardId: string, person: string | null, undoSeq: number): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "structure",
    load: async (trx) =>
      (await trx.selectFrom("change").select(["kind", "subject_id", "after"]).where("board_id", "=", boardId).where("seq", "=", String(undoSeq)).executeTakeFirst()) ?? null,
    async change(trx, entry, seq) {
      if (entry.kind !== "wording_combined" && entry.kind !== "wording_separated") return { refused: "cant_undo" };
      const undone = await trx
        .selectFrom("change")
        .select("seq")
        .where("board_id", "=", boardId)
        .where(sql<string>`after->>'undoes'`, "=", String(undoSeq))
        .executeTakeFirst();
      if (undone) return "already_done";
      const after = entry.after as Record<string, unknown>;
      const now = clock.now();
      return entry.kind === "wording_combined"
        ? uncombine(trx, { boardId, person: person!, seq, undoSeq, now, versionId: entry.subject_id, fromId: String(after.from), intoId: String(after.into), merged: after.merged === true })
        : unseparate(trx, { boardId, person: person!, seq, undoSeq, now, versionId: entry.subject_id, fromId: String(after.from), newId: String(after.argument) });
    },
  });
}

interface Undoing {
  boardId: string;
  person: string;
  seq: number;
  undoSeq: number;
  now: Date;
}

async function uncombine(trx: Trx, u: Undoing & { versionId: string; fromId: string; intoId: string; merged: boolean }) {
  const version = await trx.selectFrom("version").select(["argument_id", "deleted_at"]).where("id", "=", u.versionId).executeTakeFirst();
  const from = await loadArgument(trx, u.boardId, u.fromId);
  const into = await loadArgument(trx, u.boardId, u.intoId);
  if (!version || !from || !into) return { refused: "cant_undo" as const };
  if (version.deleted_at) return { refused: "version_deleted" as const };
  // Moved again since, or the argument it went into combined into another since: undoing that comes first.
  if (version.argument_id !== into.id || !isLive(into)) return { refused: "combined_since" as const };
  if (u.merged ? from.merged_into !== into.id : from.merged_into !== null) return { refused: "combined_since" as const };
  if (!u.merged && from.deleted_at) return { refused: "argument_deleted" as const };
  // A later combine that made `into` one with another argument set votes aside after this one did: it's undone first,
  // so each person's votes come back as they were (the second reader, Nov 22).
  if (u.merged && (await laterMerge(trx, u.boardId, u.undoSeq, into.id))) return { refused: "combined_since" as const };

  await trx.updateTable("version").set({ argument_id: from.id, changed_seq: u.seq }).where("id", "=", u.versionId).execute();
  if (u.merged) {
    // Votes: each person's as they were, unless they've voted on the combined argument since; then theirs stands.
    const rows = await trx.selectFrom("combine_vote").selectAll().where("board_id", "=", u.boardId).where("seq", "=", String(u.undoSeq)).execute();
    for (const row of rows) {
      if (row.revoted) continue;
      await setVote(trx, u.boardId, into.id, row.account_id, row.into_value, u.now);
      await setVote(trx, u.boardId, from.id, row.account_id, row.from_value, u.now);
    }
    await trx.deleteFrom("combine_vote").where("board_id", "=", u.boardId).where("seq", "=", String(u.undoSeq)).execute();
    await trx.updateTable("argument").set({ merged_into: null, changed_seq: u.seq }).where("id", "=", from.id).execute();
    await recount(trx, from.id, u.seq);
    await recount(trx, into.id, u.seq);
  }
  // The argument it leaves closes if its own wordings were moved out or deleted since, as a separation's new argument does.
  await closeIfEmpty(trx, into.id, u);
  await log(trx, u.now, { boardId: u.boardId, seq: u.seq, person: u.person, kind: "wording_uncombined", subjectKind: "version", subjectId: u.versionId, after: { from: from.id, into: into.id, undoes: u.undoSeq } });
  return "done" as const;
}

async function unseparate(trx: Trx, u: Undoing & { versionId: string; fromId: string; newId: string }) {
  const version = await trx.selectFrom("version").select(["argument_id", "deleted_at"]).where("id", "=", u.versionId).executeTakeFirst();
  const from = await loadArgument(trx, u.boardId, u.fromId);
  if (!version || !from) return { refused: "cant_undo" as const };
  if (version.deleted_at) return { refused: "version_deleted" as const };
  if (version.argument_id !== u.newId || from.merged_into !== null) return { refused: "combined_since" as const };
  if (from.deleted_at) return { refused: "argument_deleted" as const };
  await trx.updateTable("version").set({ argument_id: from.id, changed_seq: u.seq }).where("id", "=", u.versionId).execute();
  // The new argument closes, unless someone added a wording to it since.
  await closeIfEmpty(trx, u.newId, u);
  await log(trx, u.now, { boardId: u.boardId, seq: u.seq, person: u.person, kind: "wording_unseparated", subjectKind: "version", subjectId: u.versionId, after: { argument: u.newId, undoes: u.undoSeq } });
  return "done" as const;
}

/** Closes an argument an undo left with no wording. A hidden wording still keeps its argument (writing.ts). */
async function closeIfEmpty(trx: Trx, argumentId: string, u: Undoing): Promise<void> {
  const left = await trx.selectFrom("version").select("id").where("argument_id", "=", argumentId).where("deleted_at", "is", null).executeTakeFirst();
  if (!left) await trx.updateTable("argument").set({ deleted_at: u.now, changed_seq: u.seq }).where("id", "=", argumentId).execute();
}

/** Whether a combine after `seq`, not yet undone, made `argumentId` one with another argument, either way round. */
async function laterMerge(trx: Trx, boardId: string, seq: number, argumentId: string): Promise<boolean> {
  const later = await trx
    .selectFrom("change as c")
    .select("c.seq")
    .where("c.board_id", "=", boardId)
    .where("c.seq", ">", String(seq))
    .where("c.kind", "=", "wording_combined")
    .where(sql<boolean>`c.after->>'merged' = 'true' and (c.after->>'into' = ${argumentId} or c.after->>'from' = ${argumentId})`)
    .where(({ not, exists, selectFrom }) => not(exists(selectFrom("change as u").select("u.seq").where("u.board_id", "=", boardId).where(sql<boolean>`(u.after->>'undoes')::bigint = c.seq`))))
    .executeTakeFirst();
  return later !== undefined;
}

/** A change-log row: IDs and change numbers only, never what anyone wrote, nor anyone's votes (invariant 7). */
async function log(trx: Trx, at: Date, row: { boardId: string; seq: number; person: string; kind: string; subjectKind: string; subjectId: string; after: object }): Promise<void> {
  await trx
    .insertInto("change")
    .values({ board_id: row.boardId, seq: row.seq, at, actor_id: row.person, kind: row.kind, subject_kind: row.subjectKind, subject_id: row.subjectId, after: JSON.stringify(row.after) })
    .execute();
}

/**
 * What combining a wording into an argument would do, for the dialog before
 * it (M3a-7): whether the two arguments become one, and if so how many people
 * would be asked to vote again, and whether the reader is one. A count, never
 * who (only the reader's own votes are theirs to see). Null when either isn't
 * on this board.
 */
export async function combinePreview(db: Db, boardId: string, person: string | null, versionId: string, intoId: string): Promise<CombinePreview | null> {
  const version = await db.selectFrom("version").select("argument_id").where("id", "=", versionId).where("board_id", "=", boardId).where("deleted_at", "is", null).executeTakeFirst();
  const into = await db.selectFrom("argument").select("id").where("id", "=", intoId).where("board_id", "=", boardId).executeTakeFirst();
  if (!version || !into) return null;
  const left = await db.selectFrom("version").select("id").where("argument_id", "=", version.argument_id).where("id", "!=", versionId).where("deleted_at", "is", null).executeTakeFirst();
  if (left || version.argument_id === intoId) return { last: false, asked: 0, you: false };
  const disagree = await db
    .selectFrom("importance_vote as f")
    .innerJoin("importance_vote as i", (join) => join.onRef("i.account_id", "=", "f.account_id").on("i.argument_id", "=", intoId))
    .select("f.account_id")
    .where("f.argument_id", "=", version.argument_id)
    .whereRef("f.value", "!=", "i.value")
    .execute();
  return { last: true, asked: disagree.length, you: disagree.some((row) => row.account_id === person) };
}
