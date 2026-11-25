// Where a link to a comment lands (M3b-13, D-01, M-06), as the prototype's
// openLink decides it (docs/prototype/source/steelman-refined.html): the
// comment's thread, on its thread's subject, resolved when that thread is; or,
// when it can't be opened, a note under the question. A reply's thread is its
// first comment's, which carries the subject and the resolved flag.
//
// The prototype has one note, "That comment was deleted.", for a comment that
// is deleted or unknown. Its board never loses a comment's subject while the
// comment stays, so the plan adds a second, "That comment’s subject was
// removed.", for a comment whose wording was deleted or hidden, or whose option
// was deleted. The service doesn't send such a comment (server/src/read.ts), so
// when the reader doesn't hold it, the service's own word decides
// (GET /api/boards/:board/comments/:id). A deleted comment says it was deleted
// even when its subject is gone too: the comment itself is what was asked for.

import { subjectStands } from "@steelman/shared";
import type { BoardRows, CommentLinkState, CommentTarget } from "@steelman/shared";

export const COMMENT_DELETED = "That comment was deleted.";
export const SUBJECT_REMOVED = "That comment’s subject was removed.";

export type CommentLanding = { kind: "thread"; target: CommentTarget; thread: string; resolved: boolean } | { kind: "note"; note: string };

/**
 * Where a link to this comment lands, from the rows the reader holds and, for a comment they don't hold, what the
 * service said about it (null when it wasn't asked or couldn't be reached).
 */
export function commentLanding(rows: BoardRows, commentId: string, said: CommentLinkState | null): CommentLanding {
  const comment = rows.comments[commentId];
  if (!comment) return { kind: "note", note: said === "subject_removed" ? SUBJECT_REMOVED : COMMENT_DELETED };
  if (comment.deleted) return { kind: "note", note: COMMENT_DELETED };
  if (!subjectStands(rows, comment)) return { kind: "note", note: SUBJECT_REMOVED };
  const first = comment.parentId === null ? comment : rows.comments[comment.parentId];
  if (!first) return { kind: "note", note: COMMENT_DELETED };
  const target: CommentTarget = first.versionId !== null ? { versionId: first.versionId } : first.optionId !== null ? { optionId: first.optionId } : "question";
  return { kind: "thread", target, thread: first.id, resolved: first.resolved };
}
