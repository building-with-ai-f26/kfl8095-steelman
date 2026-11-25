// Comments (D-01, M3b-8 and M3b-9): anyone who can read a board adds a
// comment on its question, an option, or a wording, replies to a thread, and
// resolves or reopens one, on a closed board too; and deletes their own. All
// go through the write path. None adds a row to the change log, as the
// prototype logs none: the comment table is the only place that holds one
// (invariant 7 keeps what people write out of the log anyway). Hiding and
// restoring a comment (M3b-14) are a moderator's, in moderation.ts, and each
// does add a change row, which holds no text.
//
// A thread is a first comment and the replies under it, one level deep: a
// reply names its thread's first comment as its parent and the same target.
// Resolve and reopen set and clear a flag on the first comment. A reply to a
// resolved thread is refused (architecture §3), as the prototype hides Reply
// on one. A thread whose first comment its author deleted or a moderator hid
// takes no reply, resolve, or reopen, as the prototype draws none of the three
// on such a comment: the thread still reads, but nothing more is done to it.
//
// Safe to send twice (invariant 10): a comment or reply arrives with the ID
// the browser made, so a repeat finds it already there, even if its thread
// was resolved since; resolve, reopen, and delete set a flag to what it
// already is.
//
// M3b-13 adds one read, commentLink, which says where a comment's link leads
// without sending the comment itself.

import { itemIdInput } from "@steelman/shared";
import type { CommentLinkState } from "@steelman/shared";
import type { Db } from "./db/database.ts";
import { writeToBoard } from "./write-path.ts";
import type { Outcome, Services, Trx, WriteResult } from "./write-path.ts";

interface NewComment {
  id: string;
  optionId?: string | undefined;
  versionId?: string | undefined;
  /** For a reply: its thread's first comment. */
  parentId?: string | undefined;
  body: string;
}

interface Thread {
  parent_id: string | null;
  option_id: string | null;
  version_id: string | null;
  resolved_at: Date | null;
  deleted_at: Date | null;
  hidden_at: Date | null;
}

interface Loaded {
  /** Why a comment on the target would be refused now. */
  gone: Outcome | null;
  /** For a reply: the comment it names as its parent. */
  parent: Thread | null;
}

/** The comment's target and, for a reply, its parent, if both are on this board. */
async function loadComment(trx: Trx, boardId: string, input: NewComment): Promise<Loaded | null> {
  const target = await loadTarget(trx, boardId, input);
  if (!target) return null;
  if (input.parentId === undefined) return { gone: target.gone, parent: null };
  const parent = await trx.selectFrom("comment").select(["parent_id", "option_id", "version_id", "resolved_at", "deleted_at", "hidden_at"]).where("id", "=", input.parentId).where("board_id", "=", boardId).executeTakeFirst();
  return parent ? { gone: target.gone, parent } : null;
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

/** Adds a comment on the question, an option, or a wording, or, with `parentId`, a reply to a thread. */
export function addComment({ db, clock }: Services, boardId: string, person: string | null, input: NewComment): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "comment",
    load: (trx) => loadComment(trx, boardId, input),
    async change(trx, { gone, parent }, seq) {
      // Sent again: the same comment by the same person, even if its wording has gone or its thread was resolved
      // since. So this comes before every refusal below.
      const existing = await trx.selectFrom("comment").select(["board_id", "author_id", "option_id", "version_id", "parent_id", "body", "deleted_at"]).where("id", "=", input.id).executeTakeFirst();
      if (existing) {
        const same =
          existing.board_id === boardId &&
          existing.author_id === person &&
          existing.option_id === (input.optionId ?? null) &&
          existing.version_id === (input.versionId ?? null) &&
          existing.parent_id === (input.parentId ?? null) &&
          // Deleted since: its text is gone, so the same author and target are enough to know it's the same comment.
          (existing.body === input.body || existing.deleted_at !== null);
        return same ? "already_done" : { refused: "id_taken" };
      }
      if (gone) return gone;
      if (parent) {
        // One level deep: a reply's parent is a first comment, on the same target, in a thread still open whose
        // first comment is still there.
        if (parent.parent_id !== null) return { refused: "not_a_thread" };
        if (parent.option_id !== (input.optionId ?? null) || parent.version_id !== (input.versionId ?? null)) return { refused: "not_same_thread" };
        if (parent.deleted_at || parent.hidden_at) return { refused: "thread_deleted" };
        if (parent.resolved_at) return { refused: "thread_resolved" };
      }
      await trx
        .insertInto("comment")
        .values({
          id: input.id,
          board_id: boardId,
          option_id: input.optionId ?? null,
          version_id: input.versionId ?? null,
          parent_id: input.parentId ?? null,
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

/** Loads a thread's first comment for resolve or reopen: null when it isn't on this board. */
async function loadThread(trx: Trx, boardId: string, commentId: string) {
  return (await trx.selectFrom("comment").select(["parent_id", "resolved_at", "deleted_at", "hidden_at"]).where("id", "=", commentId).where("board_id", "=", boardId).executeTakeFirst()) ?? null;
}

/**
 * Resolves a thread: anyone who can comment, on any thread, as in the prototype and Google Docs. Its wording or
 * option being gone doesn't stop it, since resolving only tidies what's there. Its first comment being deleted or
 * hidden does, as the prototype draws no Resolve on such a comment.
 */
export function resolveThread({ db, clock }: Services, boardId: string, person: string | null, commentId: string): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "comment",
    load: (trx) => loadThread(trx, boardId, commentId),
    async change(trx, thread, seq) {
      if (thread.parent_id !== null) return { refused: "not_a_thread" };
      // Resolved already: it keeps the time it was first resolved. Sent again after the first comment went, it's
      // still already done, so this comes before the refusal below.
      if (thread.resolved_at) return "already_done";
      if (thread.deleted_at || thread.hidden_at) return { refused: "thread_deleted" };
      await trx.updateTable("comment").set({ resolved_at: clock.now(), changed_seq: seq }).where("id", "=", commentId).execute();
      return "done";
    },
  });
}

/** Reopens a resolved thread: anyone who can comment, on any thread whose first comment is still there. */
export function reopenThread({ db, clock }: Services, boardId: string, person: string | null, commentId: string): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "comment",
    load: (trx) => loadThread(trx, boardId, commentId),
    async change(trx, thread, seq) {
      if (thread.parent_id !== null) return { refused: "not_a_thread" };
      if (!thread.resolved_at) return "already_done";
      if (thread.deleted_at || thread.hidden_at) return { refused: "thread_deleted" };
      await trx.updateTable("comment").set({ resolved_at: null, changed_seq: seq }).where("id", "=", commentId).execute();
      return "done";
    },
  });
}

/**
 * Where a comment's link leads (M3b-13, D-01, M-06), for someone already let in to read the board: only the comment's
 * state, never its text or its author. The snapshot leaves out comments whose subject is gone (read.ts), so without
 * this a browser can't tell a comment on a deleted wording from one that never was. "deleted" covers a deleted
 * comment, an ID that isn't the shape of one, and one this board doesn't have, so the answer never says whether a
 * comment is on another board (architecture §7). A deleted comment reads as deleted even when its subject is gone
 * too. Otherwise its subject decides, as commentRows sends it: a wording deleted or hidden, or an option deleted, is
 * "subject_removed", for a moderator too.
 */
export async function commentLink(db: Db, boardId: string, commentId: string): Promise<CommentLinkState> {
  if (!itemIdInput.safeParse(commentId).success) return "deleted";
  const found = await db
    .selectFrom("comment as c")
    .leftJoin("version as v", (join) => join.onRef("v.board_id", "=", "c.board_id").onRef("v.id", "=", "c.version_id"))
    .leftJoin("option as o", (join) => join.onRef("o.board_id", "=", "c.board_id").onRef("o.id", "=", "c.option_id"))
    .select(["c.deleted_at", "c.version_id", "c.option_id", "v.deleted_at as version_deleted", "v.hidden_at as version_hidden", "o.deleted_at as option_deleted"])
    .where("c.board_id", "=", boardId)
    .where("c.id", "=", commentId)
    .executeTakeFirst();
  if (!found || found.deleted_at) return "deleted";
  if (found.version_id !== null && (found.version_deleted || found.version_hidden)) return "subject_removed";
  if (found.option_id !== null && found.option_deleted) return "subject_removed";
  return "stands";
}
