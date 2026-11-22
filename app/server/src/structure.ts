// Combining and separating arguments (M3a-6, A-10; plans/architecture.md §2
// and §3), and undoing either. An Editor's or the Owner's (the structure
// action), as the M3a-5 preview designed them.
//
// Combine moves every wording of one argument into another in the same
// option. A wording's ID never changes (invariant 4), so its articulation
// votes, assessments, and link go with it (Q8). The argument combined away
// keeps its row with `merged_into`, so old links and offline votes follow
// it. Importance votes merge per person (PRD §5): two identical votes become
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
// wins over the one it would restore. A combine that a later combine built
// on isn't undone, and says so.

import { sql } from "kysely";
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

export function combineArguments({ db, clock }: Services, boardId: string, person: string | null, fromId: string, intoId: string): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "structure",
    load: async (trx) => {
      const from = await loadArgument(trx, boardId, fromId);
      const into = await loadArgument(trx, boardId, intoId);
      return from && into ? { from, into } : null;
    },
    stale: async (_trx, { from, into }) => {
      if (from.merged_into === into.id) return null; // Sent again: already done.
      if (from.id === into.id || from.option_id !== into.option_id) return { refused: "not_same_option" };
      return isLive(from) && isLive(into) ? null : { refused: "argument_deleted" };
    },
    async change(trx, { from, into }, seq) {
      if (from.merged_into === into.id) return "already_done";
      const now = clock.now();
      const moved = (await trx.selectFrom("version").select("id").where("argument_id", "=", from.id).orderBy("created_seq").orderBy("id").execute()).map((row) => row.id);
      await trx.updateTable("version").set({ argument_id: into.id, changed_seq: seq }).where("argument_id", "=", from.id).execute();

      // Per person: identical become one, disagreeing are removed and asked again, a vote only on `from` moves.
      const votesOn = async (id: string) => new Map((await trx.selectFrom("importance_vote").select(["account_id", "value"]).where("argument_id", "=", id).execute()).map((v) => [v.account_id, v.value]));
      const fromVotes = await votesOn(from.id);
      const intoVotes = await votesOn(into.id);
      for (const [account, fromValue] of fromVotes) {
        const intoValue = intoVotes.get(account) ?? null;
        const disagree = intoValue !== null && intoValue !== fromValue;
        const after = disagree ? null : (intoValue ?? fromValue);
        await setVote(trx, boardId, from.id, account, null, now);
        await setVote(trx, boardId, into.id, account, after, now);
        await trx
          .insertInto("combine_vote")
          .values({ board_id: boardId, seq, account_id: account, from_id: from.id, into_id: into.id, from_value: fromValue, into_value: intoValue, after_value: after, asked_again: disagree })
          .execute();
      }
      await trx.updateTable("argument").set({ merged_into: into.id, changed_seq: seq }).where("id", "=", from.id).execute();
      await recount(trx, from.id, seq);
      await recount(trx, into.id, seq);
      await log(trx, now, { boardId, seq, person: person!, kind: "arguments_combined", subjectKind: "argument", subjectId: from.id, after: { into: into.id, versions: moved } });
      return "done";
    },
  });
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
      if (entry.kind !== "arguments_combined" && entry.kind !== "wording_separated") return { refused: "cant_undo" };
      const undone = await trx
        .selectFrom("change")
        .select("seq")
        .where("board_id", "=", boardId)
        .where(sql<string>`after->>'undoes'`, "=", String(undoSeq))
        .executeTakeFirst();
      if (undone) return "already_done";
      const after = entry.after as Record<string, unknown>;
      const now = clock.now();
      return entry.kind === "arguments_combined"
        ? uncombine(trx, { boardId, person: person!, seq, undoSeq, now, fromId: entry.subject_id, intoId: String(after.into), versions: (after.versions as string[]) ?? [] })
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

async function uncombine(trx: Trx, u: Undoing & { fromId: string; intoId: string; versions: string[] }) {
  const from = await loadArgument(trx, u.boardId, u.fromId);
  const into = await loadArgument(trx, u.boardId, u.intoId);
  if (!from || !into || from.merged_into !== into.id) return { refused: "cant_undo" as const };
  if (!isLive(into)) return { refused: "combined_since" as const };

  // The wordings it moved, if they're still there: one added since, or separated out since, stays where it is.
  if (u.versions.length > 0) {
    await trx.updateTable("version").set({ argument_id: from.id, changed_seq: u.seq }).where("argument_id", "=", into.id).where("id", "in", u.versions).execute();
  }
  // Votes: each person's as they were, unless they've voted on the combined argument since; then theirs stands.
  const rows = await trx.selectFrom("combine_vote").selectAll().where("board_id", "=", u.boardId).where("seq", "=", String(u.undoSeq)).execute();
  for (const row of rows) {
    const now = (await trx.selectFrom("importance_vote").select("value").where("argument_id", "=", into.id).where("account_id", "=", row.account_id).executeTakeFirst())?.value ?? null;
    if (now !== row.after_value) continue;
    await setVote(trx, u.boardId, into.id, row.account_id, row.into_value, u.now);
    await setVote(trx, u.boardId, from.id, row.account_id, row.from_value, u.now);
  }
  await trx.deleteFrom("combine_vote").where("board_id", "=", u.boardId).where("seq", "=", String(u.undoSeq)).execute();
  await trx.updateTable("argument").set({ merged_into: null, changed_seq: u.seq }).where("id", "=", from.id).execute();
  await recount(trx, from.id, u.seq);
  await recount(trx, into.id, u.seq);
  await log(trx, u.now, { boardId: u.boardId, seq: u.seq, person: u.person, kind: "arguments_uncombined", subjectKind: "argument", subjectId: from.id, after: { into: into.id, undoes: u.undoSeq } });
  return "done" as const;
}

async function unseparate(trx: Trx, u: Undoing & { versionId: string; fromId: string; newId: string }) {
  const version = await trx.selectFrom("version").select("argument_id").where("id", "=", u.versionId).executeTakeFirst();
  const from = await loadArgument(trx, u.boardId, u.fromId);
  if (!version || !from || version.argument_id !== u.newId) return { refused: "cant_undo" as const };
  if (!isLive(from)) return { refused: "combined_since" as const };
  await trx.updateTable("version").set({ argument_id: from.id, changed_seq: u.seq }).where("id", "=", u.versionId).execute();
  // The new argument closes, unless someone added a wording to it since.
  const left = await trx.selectFrom("version").select("id").where("argument_id", "=", u.newId).where("deleted_at", "is", null).executeTakeFirst();
  if (!left) await trx.updateTable("argument").set({ deleted_at: u.now, changed_seq: u.seq }).where("id", "=", u.newId).execute();
  await log(trx, u.now, { boardId: u.boardId, seq: u.seq, person: u.person, kind: "wording_unseparated", subjectKind: "version", subjectId: u.versionId, after: { argument: u.newId, undoes: u.undoSeq } });
  return "done" as const;
}

/** A change-log row: IDs and change numbers only, never what anyone wrote, nor anyone's votes (invariant 7). */
async function log(trx: Trx, at: Date, row: { boardId: string; seq: number; person: string; kind: string; subjectKind: string; subjectId: string; after: object }): Promise<void> {
  await trx
    .insertInto("change")
    .values({ board_id: row.boardId, seq: row.seq, at, actor_id: row.person, kind: row.kind, subject_kind: row.subjectKind, subject_id: row.subjectId, after: JSON.stringify(row.after) })
    .execute();
}
