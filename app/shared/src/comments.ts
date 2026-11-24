// A target's comment threads and its open count (D-01, M3b-10), as pure
// functions over what a reader holds, for the speech bubbles and the comments
// panel.
//
// The count is the prototype's: it counts replies, but not deleted comments or
// resolved threads, and it counts hidden ones. A comment is left out while its
// subject is gone (a wording deleted or hidden, an option deleted), even for a
// reader who already holds it, since the service stops sending a subject's
// comments once it goes. History's Restore brings the subject back, and the
// service sends its comments again.

import type { CommentRow } from "./api.ts";
import type { BoardRows } from "./sync.ts";

/** What a comment is on: the board's question, an option, or a wording. */
export type CommentTarget = "question" | { optionId: string } | { versionId: string };

/** A first comment and the replies under it, both oldest first. */
export interface Thread {
  comment: CommentRow;
  replies: CommentRow[];
}

/** Whether a comment's subject is on the board: the question always is; a wording or an option the reader doesn't hold isn't. */
export function subjectStands(rows: BoardRows, comment: CommentRow): boolean {
  if (comment.versionId !== null) {
    const version = rows.versions[comment.versionId];
    return version !== undefined && !version.deleted && !version.hidden;
  }
  if (comment.optionId !== null) {
    const option = rows.options[comment.optionId];
    return option !== undefined && !option.deleted;
  }
  return true;
}

/**
 * The threads on a target, oldest first. A deleted reply is left out, and so is a deleted first comment with no reply
 * left; a deleted first comment with replies stays, so its thread still reads. This departs from the prototype in one
 * sequence: when a first comment is deleted while it has replies and those replies are deleted afterwards, the
 * prototype keeps the empty "This comment was deleted." thread, and this leaves it out. Whether to match it is left
 * to M3b-12.
 */
export function threadsOn(rows: BoardRows, target: CommentTarget): Thread[] {
  // Some older tests build a reader's rows without comments.
  const held = Object.values(rows.comments ?? {}).filter((comment) => isOn(comment, target) && subjectStands(rows, comment));
  const threads: Thread[] = [];
  for (const comment of held.filter((c) => c.parentId === null).sort(byAdded)) {
    const replies = held.filter((reply) => reply.parentId === comment.id && !reply.deleted).sort(byAdded);
    if (comment.deleted && replies.length === 0) continue;
    threads.push({ comment, replies });
  }
  return threads;
}

/** The number on a target's speech bubble: each open thread's first comment, unless deleted, and each of its replies. */
export function openCount(rows: BoardRows, target: CommentTarget): number {
  return threadsOn(rows, target)
    .filter((thread) => !thread.comment.resolved)
    .reduce((count, thread) => count + (thread.comment.deleted ? 0 : 1) + thread.replies.length, 0);
}

function isOn(comment: CommentRow, target: CommentTarget): boolean {
  if (target === "question") return comment.optionId === null && comment.versionId === null;
  if ("optionId" in target) return comment.optionId === target.optionId;
  return comment.versionId === target.versionId;
}

const byAdded = (a: CommentRow, b: CommentRow) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
