// Comments (M3b-11, D-01), in the drawer History and Settings use: the
// prototype's commentsMarkup (docs/prototype/source/steelman-refined.html).
// The panel quotes what the comments are about, lists the open threads with
// their replies, oldest first, and ends with the box and Comment, as Google
// Docs' comment panel does (support.google.com/docs/answer/65129, read live
// Nov 24). ⌘/Ctrl + Enter presses Comment, as in GitHub's comment box
// (docs.github.com keyboard shortcuts, read live Nov 24). A comment is sent at
// once, never queued; when it isn't added, its text stays in the box and the
// panel says why. Reply, Resolve, and Delete are M3b-12's.
//
// The speech bubble that opens it is here too: on each card, each option's
// header, and the question's header, named as the prototype names it.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { threadsOn } from "@steelman/shared";
import type { CommentRow, CommentTarget, ReaderView } from "@steelman/shared";
import { Icon } from "../icons.tsx";
import { fullDate } from "../when.ts";
import { initials } from "./Sharing.tsx";
import { useDrawerExit } from "./drawer.ts";

/** What the bubbles need from the board: each subject's count, which subject is open, and a way to open one. */
export interface CommentBubbles {
  count(target: CommentTarget): number;
  /** The open subject's key (targetKey), or null while Comments is closed. */
  on: string | null;
  open(target: CommentTarget): void;
}

/** A subject's key, for its draft and its bubble: "question", "o:<option>", or "v:<version>". */
export function targetKey(target: CommentTarget): string {
  if (target === "question") return "question";
  return "optionId" in target ? `o:${target.optionId}` : `v:${target.versionId}`;
}

/**
 * Whether a subject still takes comments: the question always does; a wording deleted or hidden, or an option
 * deleted, doesn't, and the service sends none of its comments (shared/src/comments.ts).
 */
export function targetStands(view: ReaderView, target: CommentTarget): boolean {
  if (target === "question") return true;
  if ("optionId" in target) {
    const option = view.rows.options[target.optionId];
    return option !== undefined && !option.deleted;
  }
  const version = view.rows.versions[target.versionId];
  return version !== undefined && !version.deleted && !version.hidden;
}

/** The prototype's speech bubble, with its count when there are open comments. */
export function CommentBubble({ target, noun, className, bubbles }: { target: CommentTarget; noun: "question" | "option" | "version"; className: string; bubbles: CommentBubbles }) {
  const key = targetKey(target);
  const count = bubbles.count(target);
  const open = bubbles.on === key;
  const label = count ? `${count} ${count === 1 ? "comment" : "comments"} on this ${noun}` : `Comment on this ${noun}`;
  return (
    <button
      type="button"
      className={`${className} sm-comment-button cursor-interaction`}
      data-comments={key}
      aria-expanded={open}
      aria-controls={open ? "sm-comments" : undefined}
      aria-label={label}
      data-tooltip={count ? label : "Comment"}
      onClick={() => bubbles.open(target)}
    >
      <Icon name="message-square" />
      {/* Keyed by the number, so a new count rises in as the drawer does. */}
      {count ? (
        <span key={count} className="sm-comment-count" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </button>
  );
}

interface CommentsProps {
  target: CommentTarget;
  view: ReaderView;
  question: string;
  reader: string | null;
  draft: string;
  onDraft(text: string): void;
  /** Sends the draft: answers null once it's added, or the sentence that says why it wasn't. */
  onSend(): Promise<string | null>;
  /** Says a sentence on the status line. */
  announce(text: string): void;
  onClose(): void;
}

const KINDS = { question: "Question", option: "Option", version: "Version" } as const;

export function Comments({ target, view, question, reader, draft, onDraft, onSend, announce, onClose }: CommentsProps) {
  const drawer = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const sending = useRef(false);
  useDrawerExit(drawer);

  const kind = target === "question" ? "question" : "optionId" in target ? "option" : "version";
  const about = target === "question" ? question : "optionId" in target ? (view.rows.options[target.optionId]?.name ?? "") : (view.rows.versions[target.versionId]?.wording ?? "This version was removed.");
  const threads = threadsOn(view.rows, target).filter((thread) => !thread.comment.resolved);

  // The comments here when it opened are drawn as they are; one that arrives later rises in.
  const [seen] = useState(() => new Set(threads.flatMap((thread) => [thread.comment.id, ...thread.replies.map((reply) => reply.id)])));
  const newest = threads.at(-1)?.replies.at(-1)?.id ?? threads.at(-1)?.comment.id;
  useLayoutEffect(() => {
    if (newest && !seen.has(newest)) body.current?.querySelector(`[data-comment="${CSS.escape(newest)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [newest, seen]);

  useEffect(() => {
    field.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drawer.current?.contains(document.activeElement)) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (sending.current) return;
    if (!draft.trim()) {
      setProblem("Write a comment first.");
      announce("Write a comment first.");
      field.current?.focus();
      return;
    }
    sending.current = true;
    try {
      const why = await onSend();
      setProblem(why);
      if (why) announce(why);
    } finally {
      sending.current = false;
    }
  };

  return (
    <div ref={drawer} className="sm-drawer sm-comments-drawer" role="dialog" aria-modal="false" aria-labelledby="sm-comments-title" id="sm-comments">
      <div className="sm-drawer-head">
        <h2 id="sm-comments-title">Comments</h2>
        <button type="button" className="sm-icon-button cursor-interaction" aria-label="Close comments" data-tooltip="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div ref={body} className="sm-drawer-body sm-comments-body" id="sm-comments-body">
        {/* ph-no-capture: the quoted subject is what someone wrote, so PostHog's autocapture must not send it (M-08). */}
        <blockquote className="sm-comment-target ph-no-capture">
          <span>{KINDS[kind]}</span>
          <p>{about}</p>
        </blockquote>
        {threads.length ? (
          threads.map((thread) => (
            <div key={thread.comment.id} className={`sm-thread${seen.has(thread.comment.id) ? "" : " sm-comment-new"}`}>
              <CommentItem comment={thread.comment} reader={reader} />
              {thread.replies.map((reply) => (
                <CommentItem key={reply.id} comment={reply} reader={reader} reply fresh={!seen.has(reply.id) && seen.has(thread.comment.id)} />
              ))}
            </div>
          ))
        ) : (
          <p className="sm-field-hint">There are no comments yet.</p>
        )}
      </div>
      <div className="sm-comment-compose">
        {/* ph-no-capture: the box holds what the reader is writing (M-08). */}
        <textarea
          ref={field}
          id="sm-comment"
          className="ph-no-capture"
          rows={2}
          maxLength={1000}
          placeholder="Add a comment"
          aria-label={`Add a comment on this ${kind}`}
          aria-invalid={problem === "Write a comment first." ? true : undefined}
          aria-describedby={problem ? "sm-comment-problem" : undefined}
          value={draft}
          onChange={(event) => {
            onDraft(event.target.value);
            if (problem === "Write a comment first." && event.target.value.trim()) setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        {problem ? (
          <p className="sm-field-error" id="sm-comment-problem">
            {problem}
          </p>
        ) : null}
        <div className="sm-comment-form-actions">
          <button type="button" className="sm-button sm-solid cursor-interaction" title="Comment (⌘/Ctrl + Enter)" onClick={() => void submit()}>
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}

/** One comment: its author's initials and username ("You" for yours), its time with the full date behind it, and its text. */
function CommentItem({ comment, reader, reply = false, fresh = false }: { comment: CommentRow; reader: string | null; reply?: boolean; fresh?: boolean }) {
  const mine = comment.authorId === reader;
  const who = mine ? "You" : comment.authorName;
  const text = comment.deleted ? "This comment was deleted." : comment.body === null ? "A moderator hid this comment." : comment.body;
  return (
    <article className={`sm-comment${reply ? " sm-reply" : ""}${fresh ? " sm-comment-new" : ""}`} data-comment={comment.id} aria-label={comment.deleted ? "Deleted comment" : `Comment by ${who}`}>
      <header>
        <span className={`sm-avatar${mine ? " sm-you" : ""}`} aria-hidden="true">
          {initials(comment.authorName)}
        </span>
        <strong>{who}</strong>
        <time dateTime={comment.createdAt} title={fullDate(comment.createdAt)}>
          {new Date(comment.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </time>
      </header>
      {/* ph-no-capture: a comment's text is what someone wrote (M-08). */}
      <p className={`ph-no-capture${comment.body === null ? " sm-comment-deleted" : ""}`}>{text}</p>
    </article>
  );
}
