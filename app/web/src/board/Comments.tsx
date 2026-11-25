// Comments (M3b-11, D-01), in the drawer History and Settings use: the
// prototype's commentsMarkup (docs/prototype/source/steelman-refined.html).
// The panel quotes what the comments are about, lists the open threads with
// their replies, oldest first, and ends with the box and Comment, as Google
// Docs' comment panel does (support.google.com/docs/answer/65129, read live
// Nov 24). ⌘/Ctrl + Enter presses Comment, as in GitHub's comment box
// (docs.github.com keyboard shortcuts, read live Nov 24). A comment is sent at
// once, never queued; when it isn't added, its text stays in the box and the
// panel says why.
//
// M3b-12 adds each comment's small text buttons, in the prototype's order
// (commentItem): Reply on an open thread's first comment, Resolve or Reopen on
// the first comment, and Delete on your own. Reply opens the prototype's
// inline form. Resolved threads fold under its "N resolved" toggle. Delete
// asks first, in place, with the red Delete first and Cancel after it, as
// GOV.UK's design system confirms a destructive action with a warning button
// and puts a button before its Cancel link (design-system.service.gov.uk
// components/button, read live Nov 24).
//
// The speech bubble that opens it is here too: on each card, each option's
// header, and the question's header, named as the prototype names it.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { threadsOn } from "@steelman/shared";
import type { CommentRow, CommentTarget, ReaderView, Thread } from "@steelman/shared";
import { Icon } from "../icons.tsx";
import { browserIds } from "../system.ts";
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
  /** Sends a reply to a thread (M3b-12), with the browser's ID for it: null once it's added, or why it wasn't. */
  onReply(threadId: string, id: string, body: string): Promise<string | null>;
  /** Resolves or reopens a thread (M3b-12): null once it's done, or why it wasn't. */
  onResolve(threadId: string, resolved: boolean): Promise<string | null>;
  /** Deletes the reader's own comment (M3b-12): null once it's deleted, or why it wasn't. */
  onDelete(id: string): Promise<string | null>;
  /** Says a sentence on the status line. */
  announce(text: string): void;
  onClose(): void;
}

const KINDS = { question: "Question", option: "Option", version: "Version" } as const;

/** How long a thread or a reply takes to fold away (M3b-12), as the drawer's own motion. */
const FOLD_MS = 220;

/** A thread or a reply that just left the open list, drawn for a moment as it folds away. */
interface Folding {
  key: string;
  thread: Thread;
  /** A reply that went from a thread still open, or null when the whole thread went. */
  reply: CommentRow | null;
}

export function Comments({ target, view, question, reader, draft, onDraft, onSend, onReply, onResolve, onDelete, announce, onClose }: CommentsProps) {
  const drawer = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const replyField = useRef<HTMLTextAreaElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const sending = useRef(false);
  useDrawerExit(drawer);

  // The reply form (one at a time, as in the prototype), its draft, and the ID the browser made for that draft, so a
  // reply sent again after it wasn't answered is the same reply.
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyProblem, setReplyProblem] = useState<string | null>(null);
  const replyId = useRef<{ thread: string; id: string; body: string } | null>(null);
  // The form and its text as last drawn, so a reply that's added doesn't take away what was typed while it was sent.
  const latestReply = useRef({ to: replyTo, draft: replyDraft });
  latestReply.current = { to: replyTo, draft: replyDraft };
  const [showResolved, setShowResolved] = useState(false);
  /** The comment whose Delete is asking first. */
  const [confirming, setConfirming] = useState<string | null>(null);
  /** Why Resolve, Reopen, or Delete didn't happen, under that comment. */
  const [actionProblem, setActionProblem] = useState<{ id: string; text: string } | null>(null);
  /** Where the focus goes once the panel has drawn what an action changed. */
  const [focus, setFocus] = useState<{ selector: string } | null>(null);
  const busy = useRef(false);

  const kind = target === "question" ? "question" : "optionId" in target ? "option" : "version";
  const about = target === "question" ? question : "optionId" in target ? (view.rows.options[target.optionId]?.name ?? "") : (view.rows.versions[target.versionId]?.wording ?? "This version was removed.");
  const all = threadsOn(view.rows, target);
  // A thread with its reply form or a Delete question open stays where it is, even when someone resolves it
  // meanwhile, so the draft and the sentence that says why it wasn't added stay in view, beside the thread's Reopen,
  // and the cursor isn't lost.
  const held = (thread: Thread) => thread.comment.id === replyTo || thread.comment.id === confirming || thread.replies.some((reply) => reply.id === confirming);
  const threads = all.filter((thread) => !thread.comment.resolved || held(thread));
  const resolved = all.filter((thread) => thread.comment.resolved && !held(thread));

  // The comments here when it opened are drawn as they are; one that arrives later rises in, and so does a thread
  // that's reopened.
  const [seen] = useState(() => new Set(all.flatMap((thread) => [thread.comment.id, ...thread.replies.map((reply) => reply.id)])));
  const [back, setBack] = useState<ReadonlySet<string>>(() => new Set());
  const newest = threads.at(-1)?.replies.at(-1)?.id ?? threads.at(-1)?.comment.id;
  useLayoutEffect(() => {
    if (newest && !seen.has(newest)) body.current?.querySelector(`[data-comment="${CSS.escape(newest)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [newest, seen]);

  // A thread that leaves the open list (resolved or deleted, here or by someone else), and a reply deleted from an
  // open thread, folds away rather than vanish: a copy of it stays for a moment, hidden from screen readers and from
  // the cursor. With reduced motion there is no copy.
  const [folding, setFolding] = useState<Folding[]>([]);
  const before = useRef<Thread[]>(threads);
  const timers = useRef<number[]>([]);
  useLayoutEffect(() => {
    const was = before.current;
    before.current = threads;
    if (was === threads) return;
    const now = new Map(threads.map((thread) => [thread.comment.id, thread]));
    const went: Folding[] = [];
    const returned: string[] = [];
    for (const thread of was) {
      const still = now.get(thread.comment.id);
      if (!still) went.push({ key: thread.comment.id, thread, reply: null });
      else for (const reply of thread.replies) if (!still.replies.some((r) => r.id === reply.id)) went.push({ key: reply.id, thread: still, reply });
    }
    for (const thread of threads) if (seen.has(thread.comment.id) && !was.some((w) => w.comment.id === thread.comment.id)) returned.push(thread.comment.id);
    if (returned.length) setBack((ids) => new Set([...ids, ...returned]));
    if (!went.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setFolding((all) => [...all.filter((f) => !went.some((w) => w.key === f.key)), ...went]);
    timers.current.push(window.setTimeout(() => setFolding((all) => all.filter((f) => !went.includes(f))), FOLD_MS + 40));
  });
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  const folded = (key: string) => setFolding((all) => all.filter((f) => f.key !== key));

  useLayoutEffect(() => {
    if (!focus) return;
    // When what it was meant for has gone meanwhile (a thread resolved or deleted elsewhere), the comment box takes it.
    (drawer.current?.querySelector<HTMLElement>(focus.selector) ?? field.current)?.focus();
    setFocus(null);
  }, [focus]);

  // When something else's change takes away the control that had the cursor (a thread someone resolved or deleted
  // folding away), the cursor goes into the comment box rather than out of the panel, so Escape still works there.
  // The panel remembers the control inside it that last let the cursor go to nowhere: if that control is no longer
  // on the page, it was taken away rather than left (a click on an empty spot leaves it where it was).
  const left = useRef<Element | null>(null);
  useEffect(() => {
    const onIn = () => {
      left.current = null;
    };
    const onOut = (event: FocusEvent) => {
      const from = event.target;
      left.current = event.relatedTarget === null && from instanceof Element && drawer.current?.contains(from) ? from : null;
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
  useLayoutEffect(() => {
    const from = left.current;
    if (from && !from.isConnected && (document.activeElement === null || document.activeElement === document.body)) field.current?.focus();
  });

  // A reply form or a Delete question whose comment has left the board (deleted elsewhere) is put away.
  const live = new Set(all.flatMap((thread) => [thread.comment, ...thread.replies]).filter((c) => !c.deleted && c.body !== null).map((c) => c.id));
  const threadIds = new Set(all.map((thread) => thread.comment.id));
  const staleConfirm = confirming !== null && !live.has(confirming);
  const staleReply = replyTo !== null && !threadIds.has(replyTo);
  useEffect(() => {
    if (staleConfirm) setConfirming(null);
    if (staleReply) {
      setReplyTo(null);
      setReplyDraft("");
      setReplyProblem(null);
    }
  }, [staleConfirm, staleReply]);

  // Escape closes what's open inside the panel first: the question Delete asks, then the reply form, as the
  // prototype does; only then the panel.
  const escape = useRef<() => void>(() => undefined);
  escape.current = () => {
    const root = drawer.current;
    if (confirming && root?.querySelector(`[data-confirm="${CSS.escape(confirming)}"]`)) return cancelDelete(confirming);
    if (replyTo && root?.querySelector("#sm-reply")) return cancelReply(replyTo);
    onClose();
  };
  useEffect(() => {
    field.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && drawer.current?.contains(document.activeElement)) escape.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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

  const openReply = (thread: string) => {
    setConfirming(null);
    if (replyTo !== thread) {
      setReplyTo(thread);
      setReplyDraft("");
      setReplyProblem(null);
    }
    setFocus({ selector: "#sm-reply" });
  };
  function cancelReply(thread: string) {
    setReplyTo(null);
    setReplyDraft("");
    setReplyProblem(null);
    // A thread resolved meanwhile has no Reply to go back to, so the cursor goes to the comment box.
    const open = threads.some((t) => t.comment.id === thread && !t.comment.resolved);
    setFocus({ selector: open ? `[data-reply="${CSS.escape(thread)}"]` : "#sm-comment" });
  }
  const sendReply = async (thread: string) => {
    if (busy.current) return;
    const text = replyDraft.trim();
    if (!text) {
      setReplyProblem("Write a reply first.");
      announce("Write a reply first.");
      replyField.current?.focus();
      return;
    }
    const last = replyId.current;
    const id = last && last.thread === thread && last.body === text ? last.id : browserIds.itemId();
    replyId.current = { thread, id, body: text };
    busy.current = true;
    try {
      const why = await onReply(thread, id, text);
      const now = latestReply.current;
      if (why === null) {
        replyId.current = null;
        // Unless the reader has started another reply meanwhile, as the comment box does (Board.tsx, sendComment).
        if (now.to === thread && now.draft.trim() === text) {
          setReplyTo(null);
          setReplyDraft("");
          setReplyProblem(null);
          setFocus({ selector: `[data-reply="${CSS.escape(thread)}"]` });
        } else if (now.to === thread) setReplyProblem(null);
      } else {
        if (now.to === thread) setReplyProblem(why);
        announce(why);
      }
    } finally {
      busy.current = false;
    }
  };

  const resolve = async (thread: string, to: boolean) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const why = await onResolve(thread, to);
      if (why === null) {
        setActionProblem(null);
        // Resolving closes the thread's reply form, as in the prototype; reopening clears why its reply wasn't added.
        if (to && replyTo === thread) {
          setReplyTo(null);
          setReplyDraft("");
        }
        if (!to && replyTo === thread) setReplyProblem(null);
        setFocus({ selector: "#sm-comment" });
      } else {
        setActionProblem({ id: thread, text: why });
        announce(why);
      }
    } finally {
      busy.current = false;
    }
  };

  const askDelete = (id: string) => {
    setConfirming(id);
    setActionProblem(null);
    setFocus({ selector: `[data-confirm="${CSS.escape(id)}"] [data-cancel]` });
  };
  function cancelDelete(id: string) {
    setConfirming(null);
    setFocus({ selector: `[data-delete="${CSS.escape(id)}"]` });
  }
  const confirmDelete = async (id: string) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const why = await onDelete(id);
      setConfirming(null);
      if (why === null) {
        setActionProblem(null);
        setFocus({ selector: "#sm-comment" });
      } else {
        setActionProblem({ id, text: why });
        announce(why);
        setFocus({ selector: `[data-delete="${CSS.escape(id)}"]` });
      }
    } finally {
      busy.current = false;
    }
  };

  /** One comment, with the buttons it offers and, when it's asking or something wasn't done, that sentence. */
  const item = (comment: CommentRow, thread: Thread, reply: boolean, ghost = false) => {
    const standing = !comment.deleted && comment.body !== null;
    const actions = standing
      ? {
          reply: !reply && !thread.comment.resolved ? () => openReply(thread.comment.id) : undefined,
          resolve: !reply ? () => void resolve(thread.comment.id, !thread.comment.resolved) : undefined,
          resolved: thread.comment.resolved,
          delete: comment.authorId === reader ? () => askDelete(comment.id) : undefined,
        }
      : null;
    return (
      <CommentItem
        key={comment.id}
        comment={comment}
        reader={reader}
        reply={reply}
        fresh={reply && !ghost && !seen.has(comment.id) && seen.has(thread.comment.id)}
        ghost={ghost}
        actions={actions}
        asking={!ghost && confirming === comment.id ? { yes: () => void confirmDelete(comment.id), no: () => cancelDelete(comment.id) } : null}
        problem={!ghost && actionProblem?.id === comment.id ? actionProblem.text : null}
      />
    );
  };

  const replyForm = (thread: string) => (
    <div className="sm-reply-form">
      {/* ph-no-capture: the box holds what the reader is writing (M-08). */}
      <textarea
        ref={replyField}
        id="sm-reply"
        className="ph-no-capture"
        rows={2}
        maxLength={1000}
        placeholder="Reply"
        aria-label="Your reply"
        aria-invalid={replyProblem === "Write a reply first." ? true : undefined}
        aria-describedby={replyProblem ? "sm-reply-problem" : undefined}
        value={replyDraft}
        onChange={(event) => {
          setReplyDraft(event.target.value);
          if (replyProblem === "Write a reply first." && event.target.value.trim()) setReplyProblem(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void sendReply(thread);
          }
        }}
      />
      {replyProblem ? (
        <p className="sm-field-error" id="sm-reply-problem">
          {replyProblem}
        </p>
      ) : null}
      <div className="sm-comment-form-actions">
        <button type="button" className="sm-link-button cursor-interaction" onClick={() => cancelReply(thread)}>
          Cancel
        </button>
        <button type="button" className="sm-button sm-solid cursor-interaction" title="Reply (⌘/Ctrl + Enter)" onClick={() => void sendReply(thread)}>
          Reply
        </button>
      </div>
    </div>
  );

  /** A thread: its first comment, its replies (with any reply folding away where it was), and its reply form. */
  const drawThread = (thread: Thread, className = "") => {
    const leaving = folding.flatMap((f) => (f.reply && f.thread.comment.id === thread.comment.id && !thread.replies.some((r) => r.id === f.key) ? [{ reply: f.reply, ghost: true }] : []));
    const replies = [...thread.replies.map((reply) => ({ reply, ghost: false })), ...leaving].sort((a, b) => byAdded(a.reply, b.reply));
    const lit = !seen.has(thread.comment.id) || back.has(thread.comment.id);
    return (
      <div key={thread.comment.id} className={`sm-thread${thread.comment.resolved ? " sm-resolved" : ""}${lit ? " sm-comment-new" : ""}${className}`}>
        {item(thread.comment, thread, false)}
        {replies.map(({ reply, ghost }) =>
          ghost ? (
            <div key={`fold-${reply.id}`} className="sm-fold sm-folding" aria-hidden="true" inert onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) folded(reply.id);
              }}>
              {item(reply, thread, true, true)}
            </div>
          ) : (
            item(reply, thread, true)
          ),
        )}
        {replyTo === thread.comment.id ? replyForm(thread.comment.id) : null}
      </div>
    );
  };
  const goneThreads = folding.filter((f) => !f.reply && !threads.some((t) => t.comment.id === f.key));
  const openList = [...threads.map((thread) => ({ thread, ghost: false })), ...goneThreads.map((f) => ({ thread: f.thread, ghost: true }))].sort((a, b) => byAdded(a.thread.comment, b.thread.comment));

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
        {openList.map(({ thread, ghost }) =>
          ghost ? (
            <div key={`fold-${thread.comment.id}`} className="sm-fold sm-folding" aria-hidden="true" inert onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) folded(thread.comment.id);
              }}>
              <div className={`sm-thread${thread.comment.resolved ? " sm-resolved" : ""}`}>
                {item(thread.comment, thread, false, true)}
                {thread.replies.map((reply) => item(reply, thread, true, true))}
              </div>
            </div>
          ) : (
            drawThread(thread)
          ),
        )}
        {all.length === 0 ? <p className="sm-field-hint">There are no comments yet.</p> : threads.length === 0 ? <p className="sm-field-hint">Every comment here is resolved.</p> : null}
        {resolved.length ? (
          <button type="button" className="sm-text-button sm-resolved-toggle cursor-interaction" aria-expanded={showResolved} onClick={() => setShowResolved((shown) => !shown)}>
            <Icon name={showResolved ? "chevron-down" : "chevron-right"} />
            {resolved.length} resolved
          </button>
        ) : null}
        {resolved.length && showResolved ? resolved.map((thread) => drawThread(thread, " sm-unfolding")) : null}
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

/** The buttons a comment offers (M3b-12), each present only where the prototype draws it. */
interface CommentActions {
  reply?: () => void;
  resolve?: () => void;
  /** Whether its thread is resolved, so the button says Reopen. */
  resolved: boolean;
  delete?: () => void;
}

/**
 * One comment: its author's initials and username ("You" for yours), its time with the full date behind it, its
 * text, and its buttons, or, once Delete is pressed, the question it asks first.
 */
function CommentItem({
  comment,
  reader,
  reply = false,
  fresh = false,
  ghost = false,
  actions = null,
  asking = null,
  problem = null,
}: {
  comment: CommentRow;
  reader: string | null;
  reply?: boolean;
  fresh?: boolean;
  /** A copy folding away: its buttons are drawn, but carry nothing the panel looks for. */
  ghost?: boolean;
  actions?: CommentActions | null;
  asking?: { yes(): void; no(): void } | null;
  problem?: string | null;
}) {
  const mine = comment.authorId === reader;
  const who = mine ? "You" : comment.authorName;
  const text = comment.deleted ? "This comment was deleted." : comment.body === null ? "A moderator hid this comment." : comment.body;
  const asked = `sm-confirm-${comment.id}`;
  return (
    <article className={`sm-comment${reply ? " sm-reply" : ""}${fresh ? " sm-comment-new" : ""}`} data-comment={ghost ? undefined : comment.id} aria-label={comment.deleted ? "Deleted comment" : `Comment by ${who}`}>
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
      {asking ? (
        // The question is a span, not a second paragraph, so the comment's text stays its one paragraph.
        <div className="sm-comment-confirm" role="group" aria-labelledby={asked} data-confirm={comment.id}>
          <span id={asked}>Delete this comment?</span>
          <button type="button" className="sm-button sm-danger cursor-interaction" onClick={asking.yes}>
            Delete
          </button>
          <button type="button" className="sm-link-button cursor-interaction" data-cancel onClick={asking.no}>
            Cancel
          </button>
        </div>
      ) : actions && (actions.reply || actions.resolve || actions.delete) ? (
        <div className="sm-comment-actions">
          {actions.reply ? (
            <button type="button" className="sm-link-button cursor-interaction" data-reply={ghost ? undefined : comment.id} onClick={actions.reply}>
              Reply
            </button>
          ) : null}
          {actions.resolve ? (
            <button type="button" className="sm-link-button cursor-interaction" onClick={actions.resolve}>
              {actions.resolved ? "Reopen" : "Resolve"}
            </button>
          ) : null}
          {actions.delete ? (
            <button type="button" className="sm-link-button cursor-interaction" data-delete={ghost ? undefined : comment.id} onClick={actions.delete}>
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
      {problem ? <p className="sm-field-error sm-comment-problem">{problem}</p> : null}
    </article>
  );
}

/** Oldest first, as threadsOn orders them, so a copy folding away keeps its place. */
const byAdded = (a: CommentRow, b: CommentRow) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
