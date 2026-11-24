// Comments (D-01, M3b-8): anyone who can read a board adds a comment on its
// question, an option, or a wording, on a closed board too; and deletes their
// own. Both go through the write path. Neither adds a row to the change log,
// as the prototype logs none: the comment table is the only place that holds
// one (invariant 7 keeps what people write out of the log anyway).
//
// Safe to send twice (invariant 10): a comment arrives with the ID the
// browser made, so a repeat finds it already there; a delete sets a flag
// that is already set.

import { writeToBoard } from "./write-path.ts";
import type { Outcome, Services, Trx, WriteResult } from "./write-path.ts";

interface NewComment {
  id: string;
  optionId?: string | undefined;
  versionId?: string | undefined;
  body: string;
}

/** The comment's target, if it's on this board, and why a comment on it would be refused now. */
async function loadTarget(trx: Trx, boardId: string, input: NewComment): Promise<{ gone: Outcome | null } | null> {
  if (input.versionId !== undefined) {
    const version = await trx.selectFrom("version").select(["deleted_at", "hidden_at"]).where("id", "=", input.versionId).where("board_id", "=", boardId).executeTakeFirst();
    // A hidden wording is gone for anyone who could comment on it, as votes on it are (M2-4).
    return version ? { gone: version.deleted_at || version.hidden_at ? { refused: "version_deleted" } : null } : null;
  }
  if (input.optionId !== undefined) {
    const option = await trx.selectFrom("option").select("deleted_at").where("id", "=", input.optionId).where("board_id", "=", boardId).executeTakeFirst();
    return option ? { gone: option.deleted_at ? { refused: "option_deleted" } : null } : null;
  }
  return { gone: null };
}

/** Adds a comment on the question, an option, or a wording. */
export function addComment({ db, clock }: Services, boardId: string, person: string | null, input: NewComment): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "comment",
    load: (trx) => loadTarget(trx, boardId, input),
    async change(trx, target, seq) {
      // Sent again: the same comment by the same person, even if its wording has gone since.
      const existing = await trx.selectFrom("comment").select(["board_id", "author_id", "option_id", "version_id", "parent_id", "body", "deleted_at"]).where("id", "=", input.id).executeTakeFirst();
      if (existing) {
        const same =
          existing.board_id === boardId &&
          existing.author_id === person &&
          existing.option_id === (input.optionId ?? null) &&
          existing.version_id === (input.versionId ?? null) &&
          existing.parent_id === null &&
          // Deleted since: its text is gone, so the same author and target are enough to know it's the same comment.
          (existing.body === input.body || existing.deleted_at !== null);
        return same ? "already_done" : { refused: "id_taken" };
      }
      if (target.gone) return target.gone;
      await trx
        .insertInto("comment")
        .values({
          id: input.id,
          board_id: boardId,
          option_id: input.optionId ?? null,
          version_id: input.versionId ?? null,
          parent_id: null,
          author_id: person!,
          body: input.body,
          created_at: clock.now(),
          changed_seq: seq,
        })
        .execute();
      return "done";
    },
  });
}

/** Deletes the person's own comment: its text is erased and its row kept (invariant 6), so a thread still reads. */
export function deleteComment({ db, clock }: Services, boardId: string, person: string | null, commentId: string): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "uncomment",
    load: async (trx) => (await trx.selectFrom("comment").select(["author_id", "deleted_at"]).where("id", "=", commentId).where("board_id", "=", boardId).executeTakeFirst()) ?? null,
    authorOf: (comment) => comment.author_id,
    async change(trx, comment, seq) {
      if (comment.deleted_at) return "already_done";
      await trx.updateTable("comment").set({ body: null, deleted_at: clock.now(), changed_seq: seq }).where("id", "=", commentId).execute();
      return "done";
    },
  });
}
