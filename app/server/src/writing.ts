// Writing on a board: adding an argument with its first wording (A-03),
// adding a wording to an argument (A-05), and editing or deleting your own
// wording (A-06). Each is one write through the write path.
//
// Safe to send twice (invariant 10): new things arrive with IDs the browser
// made, so a repeat finds its ID already there; an edit names the revision
// it started from, so a repeat finds the next revision already saved; a
// delete sets a flag that is already set.

import { sql } from "kysely";
import type { Clock } from "@steelman/shared";
import { versionRows } from "./read.ts";
import { writeToBoard } from "./write-path.ts";
import type { Outcome, Services, Trx, WriteResult } from "./write-path.ts";

interface NewArgument {
  id: string;
  optionId: string;
  versionId: string;
  wording: string;
  context: string;
}

export function addArgument({ db, clock }: Services, boardId: string, person: string | null, input: NewArgument): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "add",
    load: async (trx) =>
      (await trx.selectFrom("option").select(["id", "deleted_at"]).where("id", "=", input.optionId).where("board_id", "=", boardId).where("deleted_at", "is", null).executeTakeFirst()) ??
      null,
    change: async (trx, _option, seq) => {
      const existing = await trx.selectFrom("argument").select(["board_id", "option_id", "created_by"]).where("id", "=", input.id).executeTakeFirst();
      if (existing) {
        const same = existing.board_id === boardId && existing.option_id === input.optionId && existing.created_by === person;
        return same ? "already_done" : { refused: "id_taken" };
      }
      if (await idTaken(trx, input.versionId)) return { refused: "id_taken" };
      await trx
        .insertInto("argument")
        .values({ id: input.id, board_id: boardId, option_id: input.optionId, created_by: person!, created_at: clock.now(), created_seq: seq, changed_seq: seq })
        .execute();
      await insertVersion(trx, clock, { boardId, argumentId: input.id, person: person!, seq, id: input.versionId, wording: input.wording, context: input.context });
      return "done";
    },
  });
}

export function addWording(
  { db, clock }: Services,
  boardId: string,
  person: string | null,
  argumentId: string,
  input: { id: string; wording: string; context: string },
): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "add",
    load: async (trx) => (await trx.selectFrom("argument").select("deleted_at").where("id", "=", argumentId).where("board_id", "=", boardId).executeTakeFirst()) ?? null,
    stale: async (_trx, argument) => (argument.deleted_at ? { refused: "argument_deleted" } : null),
    change: async (trx, _argument, seq) => {
      const existing = await trx.selectFrom("version").select(["board_id", "argument_id", "author_id"]).where("id", "=", input.id).executeTakeFirst();
      if (existing) {
        const same = existing.board_id === boardId && existing.argument_id === argumentId && existing.author_id === person;
        return same ? "already_done" : { refused: "id_taken" };
      }
      await insertVersion(trx, clock, { boardId, argumentId, person: person!, seq, ...input });
      return "done";
    },
  });
}

/** Saves a new wording at revision 1. */
async function insertVersion(
  trx: Trx,
  clock: Clock,
  v: { boardId: string; argumentId: string; person: string; seq: number; id: string; wording: string; context: string },
): Promise<void> {
  await trx
    .insertInto("version")
    .values({ id: v.id, board_id: v.boardId, argument_id: v.argumentId, author_id: v.person, created_at: clock.now(), created_seq: v.seq, current_rev: 1, changed_seq: v.seq })
    .execute();
  await trx
    .insertInto("version_revision")
    .values({ version_id: v.id, board_id: v.boardId, rev: 1, wording: v.wording, context: v.context, why: "created", created_by: v.person, created_at: clock.now() })
    .execute();
}

async function idTaken(trx: Trx, id: string): Promise<boolean> {
  return (await trx.selectFrom("version").select("id").where("id", "=", id).executeTakeFirst()) !== undefined;
}

/**
 * Saves the edited wording as revision n + 1 (A-06). Its sources carry over;
 * its credibility starts over, because assessments belong to a revision
 * (invariant 2). Importance and articulation votes don't mention revisions,
 * so they stay.
 */
export function editWording(
  { db, clock }: Services,
  boardId: string,
  person: string | null,
  versionId: string,
  input: { baseRev: number; wording: string; context: string },
): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "edit",
    load: async (trx) =>
      (await trx
        .selectFrom("version as v")
        .innerJoin("version_revision as r", (join) => join.onRef("r.version_id", "=", "v.id").onRef("r.rev", "=", "v.current_rev"))
        .innerJoin("argument as a", "a.id", "v.argument_id")
        .select(["v.author_id", "v.current_rev", "v.deleted_at", "v.articulation_voters", "a.importance_voters", "r.wording", "r.context", "r.created_by"])
        .where("v.id", "=", versionId)
        .where("v.board_id", "=", boardId)
        .executeTakeFirst()) ?? null,
    authorOf: (version) => version.author_id,
    stale: async (trx, version): Promise<Outcome | null> => {
      if (version.deleted_at) return { refused: "version_deleted" };
      const sameText = version.wording === input.wording && version.context === input.context;
      // Sent again after it was saved: the next revision is already there, with this text.
      if (input.baseRev === version.current_rev - 1 && sameText && version.created_by === person) return "already_done";
      if (input.baseRev !== version.current_rev) {
        // Made against a revision that isn't the latest, such as one an earlier, failed edit would have saved.
        const [current] = await versionRows(trx, boardId, person, { ids: [versionId] });
        return current ? { refused: "revision_changed", current } : { refused: "revision_changed" };
      }
      return sameText ? "already_done" : null;
    },
    change: async (trx, version, seq) => {
      const rev = version.current_rev + 1;
      await trx
        .insertInto("version_revision")
        .values({
          version_id: versionId,
          board_id: boardId,
          rev,
          wording: input.wording,
          context: input.context,
          why: "edited",
          importance_votes_before: version.importance_voters,
          articulation_votes_before: version.articulation_voters,
          created_by: person!,
          created_at: clock.now(),
        })
        .execute();
      // The sources carry over to the new revision.
      await sql`insert into revision_source (version_id, rev, source_id, board_id)
                select version_id, ${rev}, source_id, board_id from revision_source
                where version_id = ${versionId} and rev = ${version.current_rev}`.execute(trx);
      await trx.updateTable("version").set({ current_rev: rev, yes: 0, no: 0, changed_seq: seq }).where("id", "=", versionId).execute();
      await trx
        .insertInto("change")
        .values({
          board_id: boardId,
          seq,
          at: clock.now(),
          actor_id: person!,
          kind: "version_edited",
          subject_kind: "version",
          subject_id: versionId,
          before: JSON.stringify({ rev: version.current_rev }),
          after: JSON.stringify({ rev }),
        })
        .execute();
      return "done";
    },
  });
}

/**
 * Deletes your own wording (A-06). Like Reddit, deleting erases what you
 * wrote: every revision's text goes, in this transaction. The row stays,
 * marked, so its link can still say what happened (invariant 6). Deleting
 * an argument's last wording deletes the argument too.
 */
export function deleteWording({ db, clock }: Services, boardId: string, person: string | null, versionId: string): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "delete",
    load: async (trx) =>
      (await trx.selectFrom("version").select(["author_id", "argument_id", "deleted_at"]).where("id", "=", versionId).where("board_id", "=", boardId).executeTakeFirst()) ?? null,
    authorOf: (version) => version.author_id,
    change: async (trx, version, seq) => {
      if (version.deleted_at) return "already_done";
      await trx.updateTable("version_revision").set({ wording: null, context: null }).where("version_id", "=", versionId).execute();
      await trx.updateTable("version").set({ deleted_at: clock.now(), changed_seq: seq }).where("id", "=", versionId).execute();

      const others = await trx
        .selectFrom("version")
        .select("id")
        .where("argument_id", "=", version.argument_id)
        .where("id", "!=", versionId)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      if (!others) {
        await trx.updateTable("argument").set({ deleted_at: clock.now(), changed_seq: seq }).where("id", "=", version.argument_id).execute();
      }
      await trx
        .insertInto("change")
        .values({
          board_id: boardId,
          seq,
          at: clock.now(),
          actor_id: person!,
          kind: "version_deleted",
          subject_kind: "version",
          subject_id: versionId,
          after: JSON.stringify(others ? {} : { argumentDeleted: version.argument_id }),
        })
        .execute();
      return "done";
    },
  });
}
