// The board screen (M0-6): the prototype's markup, drawn from what the
// reader holds (session.ts). Rows sit where `view.shown` puts them; counts
// change in place; the pill counts what Update would change. Update shuffles
// the rows from where they were into the new order (M3d-3, motion.ts flip()),
// and nothing else moves them.
//
// A version's ⋯ menu (A-12) edits in place, suggests a revised version in
// the row's draft, and deletes with Undo: the deletion leaves the screen at
// once and the session holds it for ten seconds before sending it.
//
// Its address (M-06) is the board's, or the open version's while one is
// open. It changes in place (history.replaceState), as the prototype's
// does, so Back leaves the board instead of closing cards one by one. Opened
// by a comment's link (M3b-13), it is the comment's while that comment's
// panel is open, as the prototype keeps c= in its address.

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { OPTIONS_PER_BOARD, can, cleanText, leaveOut, openCount } from "@steelman/shared";
import type { ArgumentRow, CaseItem, CommentLinkState, CommentTarget, OptionRow, ReaderView, VersionRow } from "@steelman/shared";
import { Axis, Icon } from "../icons.tsx";
import { NoAccess } from "../NoAccess.tsx";
import { NotFound } from "../NotFound.tsx";
import { useReader } from "../reader.ts";
import { boardPath, commentPath, versionPath } from "../links.ts";
import { browserIds } from "../system.ts";
import { Card } from "./Card.tsx";
import type { CardMenu, Opening } from "./Card.tsx";
import { ArgumentSlot, EMPTY_DRAFT, cleanDraft } from "./Forms.tsx";
import { Sharing } from "./Sharing.tsx";
import { StrongestCase } from "./StrongestCase.tsx";
import { Tour } from "./Tour.tsx";
import { tourSteps } from "./tour-steps.ts";
import type { TourStep } from "./tour-steps.ts";
import { markTourSeen, readTour } from "../api.ts";
import type { DraftText } from "./Forms.tsx";
import { Track, TrackAxis } from "./Track.tsx";
import { VoteControl } from "./Vote.tsx";
import { WHY, columns, endQuote, finalArgument, importanceShown, isLive, isLiveVersion, leadWording, moderationItem, reportItem, short, versionMenu, whyNot } from "./display.ts";
import { BoardSession, leaveOptionsOut } from "./session.ts";
import type { Held, Restructured, SessionState } from "./session.ts";
import { rememberPlace } from "../places.ts";
import { OptionMenu } from "./OptionMenu.tsx";
import { History } from "./History.tsx";
import { Settings } from "./Settings.tsx";
import { CommentBubble, Comments, targetKey, targetStands } from "./Comments.tsx";
import { commentLanding } from "./comment-link.ts";
import type { CommentBubbles } from "./Comments.tsx";
import { useDrawerTop } from "./drawer.ts";
import { captureRects, drawnRect, duration, flip, stopMoves } from "./motion.ts";
import type { Rects } from "./motion.ts";
import { RestructureDialog } from "./Restructure.tsx";
import type { Asking } from "./Restructure.tsx";
import { Texture } from "./Texture.tsx";
import { Wires, redrawWhile } from "./Wires.tsx";

/** What a reader is told when they ask for a wording someone moved, which the board shows in its new place only after Update. */
const NOT_SHOWN_YET = "Press Update to see that wording where it is now.";

/** The board's view (E-01): "read" is the whole board, "case" each option's strongest case. */
export type Zoom = "read" | "case";

interface BoardProps {
  boardId: string;
  version?: string | null;
  /** The comment the link that opened the board points to (M3b-13). */
  comment?: string | null;
  zoom?: Zoom;
  onZoom?(zoom: Zoom): void;
  /** Told when the board itself is on screen, and when it's gone: the switch shows only then. */
  onShown?(shown: boolean): void;
}

export function Board({ boardId, version = null, comment = null, zoom = "read", onZoom = () => {}, onShown = () => {} }: BoardProps) {
  const [session] = useState(() => new BoardSession(boardId, comment));
  useEffect(() => {
    void session.start();
    return () => session.stop();
  }, [session]);
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  // The reader's own deletions are off the screen at once: wordings, and options (M3a-2).
  const view = useMemo(() => (state.view ? leaveOptionsOut(leaveOut(state.view, state.leftOut), state.optionsLeftOut) : null), [state.view, state.leftOut, state.optionsLeftOut]);

  if (state.phase === "missing") return <NotFound />;
  if (state.phase === "no_access") return <NoAccess />;
  if (state.phase === "signed_out") return <p className="sm-meta">You’ve been signed out. Reload the page to sign in.</p>;
  if (!view) return null;
  return <BoardView boardId={boardId} linked={version} linkedComment={comment} view={view} state={state} session={session} zoom={zoom} onZoom={onZoom} onShown={onShown} />;
}

interface BoardViewProps {
  boardId: string;
  /** The version the link that opened the board points to. */
  linked: string | null;
  /** The comment the link that opened the board points to (M3b-13). */
  linkedComment: string | null;
  view: ReaderView;
  state: SessionState;
  session: BoardSession;
  zoom: Zoom;
  onZoom(zoom: Zoom): void;
  onShown(shown: boolean): void;
}

function BoardView({ boardId, linked, linkedComment, view, state, session, zoom, onZoom, onShown }: BoardViewProps) {
  const options = columns(view);
  // The importance axis only means something once a column has two arguments to rank.
  const ranked = options.some((option) => (view.shown.arguments[option.id]?.length ?? 0) >= 2);
  const [arrival] = useState(() => (linkedComment ? commentArrivalFor(view, linkedComment, state.commentLink) : arrivalFor(view, linked)));
  const [chosenSide, setSide] = useState(arrival.side ?? options[0]?.id);
  // The side shown on a phone: the one chosen, or the first while that one is deleted (M3a-2).
  const side = options.some((option) => option.id === chosenSide) ? chosenSide : options[0]?.id;
  /** The row unfolded to compare its wordings: one at a time. */
  const [open, setOpen] = useState<string | null>(arrival.row);
  /** The version opened by its wording, one at a time. It counts as open only while it's on screen. */
  const [expanded, setExpanded] = useState<string | null>(arrival.version);
  const openVersion = expanded !== null && onScreen(view, open, expanded) ? expanded : null;
  const [arrived, setArrived] = useState<string | null>(arrival.version ?? arrival.ring);
  const [note, setNote] = useState(arrival.note);
  const dismiss = useRef<HTMLButtonElement>(null);
  const [writing, setWriting] = useState<Writing>(null);
  /** Drafts kept for later, by where they were started: "w:<argument>" or "a:<option>". */
  const [drafts, setDrafts] = useState<Record<string, DraftText>>({});
  const keep = (key: string, draft: DraftText) => setDrafts((all) => ({ ...all, [key]: draft }));
  const reader = useReader();
  // A closed board (M3b-5, I-05), as the service last said: what it would refuse fades and says so.
  const closed = state.closing?.closed ?? false;
  // Options (M3a-2): an Editor or the Owner may add, rename, and delete them.
  const mayStructure = can(reader, state.role, "structure", { closed }) === null;
  /** The ID of a new option being named, before it's sent; null otherwise. */
  const [naming, setNaming] = useState<string | null>(null);
  /** A new option's ID, once added by Enter, so its "Add an argument" gets the cursor when it arrives. */
  const [added, setAdded] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!added || !options.some((option) => option.id === added)) return;
    document.querySelector<HTMLElement>(`#sm-col-${CSS.escape(added)} .sm-add-idea`)?.focus();
    setAdded(null);
  }, [added, options]);
  // An option held for Undo still counts toward the four: Undo brings it back.
  const addColumn = mayStructure && zoom !== "case" && (naming !== null || options.length + state.optionsLeftOut.length < OPTIONS_PER_BOARD.max);
  /** Names the new option. Only Enter or Escape moves the cursor; leaving the field leaves it where it went. */
  const nameNew = async (name: string, by: Finish) => {
    const id = naming;
    setNaming(null);
    if (!id) return;
    if (!name) {
      if (by === "enter") session.announce("An option needs a name, so none was added.");
      // Back on "Add an option", once it's drawn again.
      if (by !== "blur") window.setTimeout(() => addButton.current?.focus());
      return;
    }
    if (!(await session.addOption(id, name))) return;
    // On a phone the new option's column is the one shown.
    setSide(id);
    if (by === "enter") setAdded(id);
  };
  /** Where the cursor goes once the screen has changed: after an edit, a delete, or Undo. */
  const [focusTo, setFocusTo] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!focusTo) return;
    document.querySelector<HTMLElement>(focusTo)?.focus();
    setFocusTo(null);
  }, [focusTo]);
  // An option delete held for Undo (M3a-2): the cursor goes to its Undo; after Undo, to the option's ⋯; once it's
  // sent with the cursor still on Undo, to Add an option, or the first option's ⋯, or in Strongest case the switch.
  const lastGone = useRef<SessionState["optionGone"]>(null);
  useLayoutEffect(() => {
    const was = lastGone.current;
    lastGone.current = state.optionGone;
    if (state.optionGone) return void document.querySelector<HTMLElement>(".sm-option-undo button")?.focus();
    if (!was || (document.activeElement && document.activeElement !== document.body)) return;
    if (zoom === "case") return void document.querySelector<HTMLElement>(".sm-zoom [aria-pressed='true']")?.focus();
    (addButton.current ?? document.querySelector<HTMLElement>(".sm-column-tools [aria-haspopup='menu']"))?.focus();
  }, [state.optionGone]);
  const undoOptionDelete = () => {
    const gone = state.optionGone;
    session.undoOptionDelete();
    if (gone && zoom !== "case") setFocusTo(`#sm-col-${CSS.escape(gone.id)} .sm-column-tools [aria-haspopup='menu']`);
  };
  /** Brings an argument into view, with the cursor on its leading wording: from a row combined into it. */
  const goTo = (argumentId: string) => {
    const optionId = view.rows.arguments[argumentId]?.optionId;
    if (optionId) setSide(optionId);
    document.querySelector(`[data-node="${CSS.escape(argumentId)}"]`)?.scrollIntoView({ block: "center", inline: "nearest" });
    setFocusTo(`[data-node="${CSS.escape(argumentId)}"] .sm-claim-button`);
  };
  const cardControl = (versionId: string, control: "claim" | "menu") => `[data-card="${CSS.escape(versionId)}"] .${control === "claim" ? "sm-claim-button" : "sm-card-menu-button"}`;
  /**
   * Whether it's its argument's last wording on the service, which decides whether combining makes two arguments one
   * and whether it can be separated (M3a-7): from the rows, not the screen, which may still show a wording someone
   * moved or deleted. A hidden wording counts, as on the service.
   */
  const lastOnService = (version: VersionRow) => !Object.values(view.rows.versions).some((v) => v.argumentId === version.argumentId && v.id !== version.id && !v.deleted);
  /**
   * Whether deleting this wording deletes its argument: only when no other wording is left, counting one a moderator
   * hid, which keeps the argument on the service (writing.ts) and can be restored (M2-4).
   */
  const isLast = (version: VersionRow) =>
    (view.shown.versions[version.argumentId] ?? []).filter((id) => id !== version.id && !view.rows.versions[id]?.deleted && (view.rows.versions[id]?.hidden || isLiveVersion(view.rows.versions[id]))).length === 0;

  // When the owner lowers the reader's role below writing, an open draft or edit closes, as the prototype's role
  // switch does, so they don't go on typing something the service would refuse (M2-2b). Kept drafts stay kept.
  const mayWrite = whyNot(reader, state.role, "add", closed) === null;
  useEffect(() => {
    if (!mayWrite && writing !== null) {
      setWriting(null);
      // A board that closed has said so already (session.ts), once.
      if (!closed) session.announce("Your role on this board changed: you can no longer write here.");
    }
  }, [mayWrite]);

  // Combine and separate (M3a-7): a wording being placed by picking (its menu, or a press on its handle) or by a drag,
  // and the dialog that confirms it.
  const [moving, setMoving] = useState<Moving | null>(null);
  const [dragging, setDragging] = useState<Moving | null>(null);
  const [asking, setAsking] = useState<(Asking & { returnTo: string }) | null>(null);
  /** Whether a wording's option has another live argument it could join. */
  const others = (version: VersionRow) => {
    const optionId = view.rows.arguments[version.argumentId]?.optionId;
    return optionId !== undefined && (view.shown.arguments[optionId] ?? []).some((id) => id !== version.argumentId && isLive(view.rows.arguments[id]));
  };
  const placing = (version: VersionRow, returnTo: string): Moving => ({
    versionId: version.id,
    wording: version.wording ?? "",
    from: version.argumentId,
    optionId: view.rows.arguments[version.argumentId]!.optionId,
    last: lastOnService(version),
    returnTo,
  });
  /** The wording an argument leads with, for the dialog and the notes: never one that was deleted or has moved out of it. */
  const leadOf = (argumentId: string) => leadWording(view, argumentId) ?? "";
  const askCombine = (from: Moving, intoId: string) => {
    setMoving(null);
    setAsking({ kind: "combine", versionId: from.versionId, wording: from.wording, intoId, intoWording: leadOf(intoId), last: from.last, returnTo: from.returnTo });
  };
  const askSeparate = (from: Moving) => {
    setMoving(null);
    setAsking({ kind: "separate", versionId: from.versionId, wording: from.wording, returnTo: from.returnTo });
  };
  const cancelMove = () => {
    if (!moving) return;
    setMoving(null);
    setFocusTo(moving.returnTo);
    session.announce("Combining was cancelled.");
  };
  useEffect(() => {
    if (!moving) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // An Escape that closes something else (a menu, History, a field being typed in) doesn't also cancel the pick.
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="menu"], [aria-haspopup="menu"][aria-expanded="true"], .sm-drawer, input, textarea, select')) return;
      cancelMove();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moving]);
  // Picking and dragging end when the reader's role no longer allows combining (the service would refuse it).
  useEffect(() => {
    if (mayStructure) return;
    setMoving(null);
    setDragging(null);
  }, [mayStructure]);
  const confirmAsking = () => {
    const was = asking;
    setAsking(null);
    if (!was) return;
    const done = was.kind === "combine" ? session.combine(was.versionId, was.intoId) : session.separate(was.versionId);
    // To Undo when there's a bar; back where it started when there isn't (refused, or already done).
    void done.then((ok) => setFocusTo(ok && session.snapshot().restructured ? ".sm-undo button" : was.returnTo));
  };
  const cancelAsking = () => {
    const was = asking;
    setAsking(null);
    if (was) setFocusTo(was.returnTo);
  };
  const undoRestructure = () => {
    const held = state.restructured;
    void session.undoRestructure().then((ok) => ok && held && setFocusTo(cardControl(held.versionId, "claim")));
  };
  // When the Undo bar leaves after its ten seconds with the cursor on it, the cursor goes to the wording that moved.
  const lastRestructured = useRef<Restructured | null>(null);
  useLayoutEffect(() => {
    const was = lastRestructured.current;
    lastRestructured.current = state.restructured;
    if (!was || state.restructured || (document.activeElement && document.activeElement !== document.body)) return;
    // The wording that moved, or, when it isn't drawn (a folded row shows only its lead), the row it joined.
    (document.querySelector<HTMLElement>(cardControl(was.versionId, "claim")) ?? (was.after ? document.querySelector<HTMLElement>(`[data-node="${CSS.escape(was.after)}"] .sm-claim-button`) : null))?.focus();
  }, [state.restructured]);
  const structure: Structure = {
    picking: moving,
    dragging,
    restructured: state.restructured,
    pick: (argumentId) => moving && askCombine(moving, argumentId),
    cancel: cancelMove,
    drop(target) {
      const from = dragging;
      setDragging(null);
      if (!from) return;
      if (target === "separate") askSeparate(from);
      else askCombine(from, target);
    },
    undo: undoRestructure,
  };

  const menu: CardMenu = {
    items: (version) =>
      version.hidden
        ? ["copyLink", ...moderationItem(version, reader, state.role, closed)]
        : [
            ...versionMenu(version, reader, state.role, isLast(version), { others: others(version), last: lastOnService(version) }, closed),
            ...reportItem(version, reader, state.role, closed),
            ...moderationItem(version, reader, state.role, closed),
          ],
    combine(version, via) {
      const from = placing(version, via === "handle" ? `[data-card="${CSS.escape(version.id)}"] .sm-merge-handle` : cardControl(version.id, "menu"));
      setMoving(from);
      setFocusTo(`#sm-col-${CSS.escape(from.optionId)} .sm-move-here`);
      session.announce("Pick the argument that makes the same point. Each one now has a Combine here button. Escape cancels.");
    },
    separate: (version) => askSeparate(placing(version, cardControl(version.id, "menu"))),
    dragStart(version) {
      setMoving(null);
      setDragging(placing(version, `[data-card="${CSS.escape(version.id)}"] .sm-merge-handle`));
      session.announce("You are dragging the wording. Drop it on the argument that makes the same point.");
    },
    // A drop has already been handled by then; a drag that ends anywhere else changes nothing.
    dragEnd: () => setDragging(null),
    moved(version, row) {
      if (version.argumentId === row || !isLiveVersion(version)) return null;
      const into = finalArgument(view, version.argumentId);
      const shownInto = Object.values(view.shown.arguments).some((ids) => ids.includes(into)) && into !== row;
      // The argument it joined, by a wording of that argument's own, not by this one.
      const lead = shownInto ? (leadWording(view, into, version.id) ?? "") : "";
      return (
        <>
          <p className="sm-removed-note">
            <Icon name="merge" />
            <span>{lead ? `This wording moved to ${endQuote(lead)}` : "This wording moved to another argument."}</span>
          </p>
          {lead ? (
            <button type="button" className="sm-link-button sm-gone-link cursor-interaction" onClick={() => goTo(into)}>
              Go to it
            </button>
          ) : null}
        </>
      );
    },
    goTo: (argumentId) => goTo(argumentId),
    hide: (version, reason) => void session.hide(version.id, reason),
    restore: (version) => void session.restore(version.id),
    report: (version, reason, note) => void session.report(version.id, { reason, note }),
    withdrawReport: (version) => void session.withdrawReport(version.id),
    editing: writing?.kind === "edit" ? writing.versionId : null,
    edit: (versionId) => setWriting({ kind: "edit", versionId }),
    save(version, draft) {
      setWriting(null);
      setFocusTo(cardControl(version.id, "claim"));
      const clean = cleanDraft(draft);
      if (!clean || (clean.wording === version.wording && clean.context === (version.context ?? ""))) return session.announce("No changes.");
      session.act({ kind: "edit", versionId: version.id, baseRev: version.rev, ...clean });
      session.announce("Your version was saved.");
    },
    cancel(versionId) {
      setWriting(null);
      setFocusTo(cardControl(versionId, "menu"));
      session.announce("Changes discarded.");
    },
    suggest(version) {
      // As the prototype does: a draft already started in this row is kept.
      const key = `w:${version.argumentId}`;
      const kept = (drafts[key]?.wording ?? "").trim() !== "";
      if (!kept) keep(key, { wording: version.wording ?? "", context: "" });
      setOpen(version.argumentId);
      setWriting({ kind: "wording", argumentId: version.argumentId });
      setFocusTo(`[data-node="${CSS.escape(version.argumentId)}"] .sm-compose-card .sm-draft-claim`);
      session.announce(kept ? "Your draft in this row was kept." : "A new version starts from this wording.");
    },
    remove(version) {
      const optionId = view.rows.arguments[version.argumentId]!.optionId;
      const last = isLast(version);
      const rowsHere = view.shown.arguments[optionId] ?? [];
      // The Undo bar sits under the row, or where the row was: under the one above it.
      const after = last ? (rowsHere[rowsHere.indexOf(version.argumentId) - 1] ?? null) : version.argumentId;
      if (openVersion === version.id) setExpanded(null);
      if (last && open === version.argumentId) setOpen(null);
      session.hold({ action: { kind: "delete", versionId: version.id }, label: last ? "Argument deleted." : "Version deleted.", optionId, after });
      setFocusTo(".sm-undo button");
    },
  };
  // When the Undo bar leaves after its ten seconds with the cursor on it, the cursor goes to the row it sat under, or the column's Add an argument.
  const lastHeld = useRef<Held | null>(null);
  useLayoutEffect(() => {
    const was = lastHeld.current;
    lastHeld.current = state.undo;
    if (!was || state.undo || (document.activeElement && document.activeElement !== document.body)) return;
    // In Strongest case the rows aren't there, so the cursor goes back to the switch.
    if (zoom === "case") return document.querySelector<HTMLElement>(".sm-zoom [aria-pressed='true']")?.focus();
    // A source removal's cursor stays in its card's evidence, on Add a source.
    const evidence = was.action.kind === "uncite" ? document.querySelector<HTMLElement>(`[data-card="${CSS.escape(was.action.versionId)}"] [data-key="add-source"]`) : null;
    const row = was.after ? document.querySelector<HTMLElement>(`[data-node="${CSS.escape(was.after)}"] .sm-claim-button`) : null;
    (evidence ?? row ?? document.querySelector<HTMLElement>(`#sm-col-${CSS.escape(was.optionId)} .sm-add-idea`))?.focus();
  }, [state.undo]);
  const undo = () => {
    const held = state.undo;
    session.undo();
    if (held?.action.kind === "delete") setFocusTo(cardControl(held.action.versionId, "claim"));
    if (held?.action.kind === "uncite") setFocusTo(`[data-card="${CSS.escape(held.action.versionId)}"] [data-key="src-${CSS.escape(held.action.sourceId)}"]`);
  };

  // Comments (M3b-11, D-01), in the same drawer: on the question, an option, or a wording.
  const [commentsOn, setCommentsOn] = useState<CommentTarget | null>(arrival.comments?.target ?? null);
  const commentKey = commentsOn ? targetKey(commentsOn) : null;
  /**
   * The comment a link opened its panel on (M3b-13), with its subject's key: the address is the comment's while that
   * panel is open. Once the panel closes or shows another subject, it's forgotten, as the prototype forgets
   * linkComment, so opening the same subject again by its bubble keeps the board's address.
   */
  const [linkedThread, setLinkedThread] = useState(arrival.comments ? { id: arrival.comments.comment, key: targetKey(arrival.comments.target) } : null);
  const onLinkedThread = linkedThread !== null && linkedThread.key === commentKey;
  useEffect(() => {
    if (linkedThread && !onLinkedThread) setLinkedThread(null);
  }, [linkedThread, onLinkedThread]);
  /** What the reader has typed for each subject, kept while the board is open (Google Docs keeps a draft too). */
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  /** The ID each draft was last sent with, so sending the same text again is safe (the service answers it's done). */
  const commentIds = useRef<Record<string, { id: string; body: string }>>({});
  // The speech bubbles: each subject's open count, from the comments the reader holds (M3b-10).
  const bubbles: CommentBubbles = { count: (target) => openCount(view.rows, target), on: commentKey, open: (target) => openComments(target) };
  /** Copies an address on this site, a version's or a comment's, and says so, or says what it is when copying isn't allowed. */
  const copyLink = (path: string) => {
    const link = new URL(path, window.location.origin).href;
    const copied = navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject(new Error("No clipboard"));
    copied.then(
      () => session.announce("Link copied."),
      () => session.announce(`Copying isn’t allowed here. The link is ${link}`),
    );
  };
  const opening: Opening = {
    open: openVersion,
    arrived,
    evidence: {
      sources: view.rows.sources,
      versions: view.rows.versions,
      role: state.role,
      closed,
      mine: state.mine,
      stale: state.stale,
      removing: state.undo?.action.kind === "uncite" ? state.undo.action : null,
      removeSource(version, sourceId, assessed) {
        const optionId = view.rows.arguments[version.argumentId]!.optionId;
        const label = assessed ? "Source removed. The credibility score resets." : "Source removed.";
        session.hold({ action: { kind: "uncite", versionId: version.id, sourceId }, label, optionId, after: version.argumentId });
        setFocusTo(".sm-undo button");
      },
      reportSource: (sourceId) => session.reportSource(sourceId),
      clearSourceReport: (sourceId, own) => session.clearSourceReport(sourceId, own),
      act: (action) => session.act(action),
      announce: (text) => session.announce(text),
    },
    toggle: (id) => setExpanded(openVersion === id ? null : id),
    copyLink: (id) => copyLink(versionPath(boardId, id)),
    menu,
    comments: bubbles,
  };

  // The address follows what's open: the linked comment while its panel is open, else the open version, else the board.
  const linkedPath = onLinkedThread ? commentPath(boardId, linkedThread.id) : null;
  useEffect(() => {
    const path = linkedPath ?? (openVersion ? versionPath(boardId, openVersion) : boardPath(boardId));
    if (window.location.pathname !== path) window.history.replaceState(window.history.state, "", path + window.location.search + window.location.hash);
  }, [boardId, openVersion, linkedPath]);

  // A link's version comes into view and rings; a link to one that's gone puts the cursor on its note.
  useEffect(() => {
    if (!arrived) return;
    document.querySelector(`[data-card="${CSS.escape(arrived)}"]`)?.scrollIntoView({ block: "center", inline: "nearest" });
    // It stays ringed for --sm-ring.
    const timer = window.setTimeout(() => setArrived(null), duration("ring"));
    return () => window.clearTimeout(timer);
  }, [arrived]);
  useEffect(() => {
    if (arrival.note) dismiss.current?.focus();
    if (linked || linkedComment) session.announce(`${arrival.note ? `${arrival.note} ` : ""}Opened “${state.question}”.`);
    // Once, when the board first shows.
  }, []);
  const question = useRef<HTMLHeadingElement>(null);

  // The tour (L-02): on the account's first board with something to point at, once, on any device; or again when
  // Your account's Start opens the board with ?tour. Each step unfolds the row it needs, or none, and shows its
  // column (on a phone, the only one shown); when it ends, the board is as it was.
  const [retake] = useState(() => new URLSearchParams(window.location.search).has("tour"));
  const [tour, setTour] = useState<{ steps: TourStep[]; at: number; was: { open: string | null; expanded: string | null } } | null>(null);
  const latest = useRef({ view, open, expanded });
  latest.current = { view, open, expanded };
  const showStep = (step: TourStep) => {
    setOpen(step.kind === "articulation" ? step.argumentId : null);
    setExpanded(null);
    setSide(step.optionId);
  };
  useEffect(() => {
    if (retake) {
      const address = new URL(window.location.href);
      address.searchParams.delete("tour");
      window.history.replaceState(window.history.state, "", address.pathname + address.search + address.hash);
    }
    let gone = false;
    void readTour().then((seen) => {
      if (gone || seen === null || (seen && !retake)) return;
      const steps = tourSteps(latest.current.view);
      // An empty board has nothing to point at: the tour waits for one that has.
      if (steps.length === 0) return;
      // A page load opens on the board view; this only makes sure.
      onZoom("read");
      setTour({ steps, at: 0, was: { open: latest.current.open, expanded: latest.current.expanded } });
      showStep(steps[0]!);
      session.announce("The tour has started.");
      // Shown counts as seen, even if the tab closes before the last step.
      if (!seen) void markTourSeen();
    });
    return () => {
      gone = true;
    };
    // Once, when the board first shows.
  }, []);
  const tourTo = (at: number) => {
    if (!tour) return;
    setTour({ ...tour, at });
    showStep(tour.steps[at]!);
  };
  const endTour = (finished: boolean) => {
    if (!tour) return;
    setOpen(tour.was.open);
    setExpanded(tour.was.expanded);
    setTour(null);
    session.announce(finished ? "You finished the tour." : "You closed the tour. You can start it again from Your account.");
    setFocusTo(".sm-head h1");
  };

  /** The version open, if it's in this column. */
  const versionIn = (optionId: string) => openVersion !== null && view.rows.arguments[view.rows.versions[openVersion]!.argumentId]?.optionId === optionId;
  const openOption = open ? view.rows.arguments[open]?.optionId : undefined;

  const writer: Writer = {
    writing,
    draft: (key) => drafts[key] ?? EMPTY_DRAFT,
    change: keep,
    start: setWriting,
    close() {
      // Closing the draft on a row with one wording folds the row too, as in the prototype.
      if (writing?.kind === "wording" && (view.shown.versions[writing.argumentId]?.length ?? 0) < 2) setOpen(null);
      setWriting(null);
    },
    addWording(argumentId, draft) {
      session.act({ kind: "addWording", argumentId, id: browserIds.itemId(), ...draft });
      keep(`w:${argumentId}`, EMPTY_DRAFT);
      setWriting(null);
    },
    addArgument(optionId, draft) {
      session.act({ kind: "addArgument", id: browserIds.itemId(), optionId, versionId: browserIds.itemId(), ...draft });
      keep(`a:${optionId}`, EMPTY_DRAFT);
      setWriting(null);
    },
  };
  const anchor = useRef<{ id: string; top: number } | null>(null);
  // Where every row and card was drawn when Update was pressed, so that they move from there into the new order.
  const shuffle = useRef<Rects | null>(null);
  const scene = useRef<HTMLDivElement>(null);

  // Update holds the row you're reading still on screen while the others move around it (M3d-3). The view's order
  // changes on polls too, but only Update leaves rects behind, so other people's votes never move anything.
  useLayoutEffect(() => {
    const held = anchor.current;
    const before = shuffle.current;
    anchor.current = null;
    shuffle.current = null;
    const root = scene.current;
    // A shuffle still running stops first, so that the row being read is measured where it lies.
    if (before && root) stopMoves(root);
    if (held) {
      const now = document.querySelector(`[data-node="${held.id}"]`)?.getBoundingClientRect().top;
      if (now !== undefined && now !== held.top) window.scrollBy(0, now - held.top);
    }
    // Measured after the scroll, as the rects before it were, so the row being read has no offset and stays still.
    if (before && root) redrawWhile(flip(before, root, { lift: true, travel: true }).animations);
  }, [view.shown]);

  useEffect(() => {
    onShown(true);
    return () => onShown(false);
  }, [onShown]);
  // Where Your account and the other detours lead back to (M3a-1): this board, at the version open as it's left.
  useEffect(() => rememberPlace(() => ({ path: window.location.pathname, name: state.question })), [state.question]);
  // Switching views says where the reader is now. Strongest case closes what's open on the board, as the
  // prototype does: drafts of new arguments and wordings are kept, an edit in progress is discarded.
  const shownZoom = useRef(zoom);
  useEffect(() => {
    if (shownZoom.current === zoom) return;
    shownZoom.current = zoom;
    if (zoom === "read") return session.announce("Board.");
    const editing = writing?.kind === "edit";
    setOpen(null);
    setExpanded(null);
    setWriting(null);
    // Strongest case has no rows to pick: a wording being placed is put down.
    setMoving(null);
    setDragging(null);
    session.announce(`${editing ? "Your changes were discarded. " : ""}Strongest case: each option’s most important arguments, in their best wording. Choose one to open it on the board.`);
  }, [zoom, session, writing]);
  /** Choosing an argument in Strongest case opens its wording on the board, its row unfolded if the wording doesn't lead it there. */
  const openFromCase = (item: CaseItem) => void showVersion(item.versionId);
  /**
   * Opens a wording on the board, from Strongest case or History: its row unfolded if it isn't the leading one, and
   * its card open. Answers false when the board doesn't show it where it is now, because someone moved it and the
   * reader hasn't pressed Update: then nothing on the board moves, and a note in the header says how to see it.
   */
  const showVersion = (versionId: string): boolean => {
    const argumentId = view.rows.versions[versionId]?.argumentId;
    const at = argumentId ? (view.shown.versions[argumentId] ?? []).indexOf(versionId) : -1;
    if (!argumentId || at < 0) {
      setNote(NOT_SHOWN_YET);
      session.announce(NOT_SHOWN_YET);
      return false;
    }
    if (writing?.kind === "wording") setWriting(null);
    setOpen(at > 0 ? argumentId : null);
    setExpanded(versionId);
    setSide(view.rows.arguments[argumentId]!.optionId);
    setArrived(versionId);
    setFocusTo(cardControl(versionId, "claim"));
    onZoom("read");
    return true;
  };

  // History (M3a-4, J-03): a panel beside the board, opened from the question header.
  const [historyOpen, setHistoryOpenNow] = useState(false);
  const historyButton = useRef<HTMLButtonElement>(null);
  // Settings (M3b-2, I-01), the Owner's, in the same drawer: one panel at a time.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  /** Counts the times Settings asked for Share, which opens it. */
  const [shareAsked, setShareAsked] = useState(0);
  const setHistoryOpen = (open: boolean) => {
    if (open) {
      setSettingsOpen(false);
      setCommentsOn(null);
    }
    setHistoryOpenNow(open);
  };
  const closeHistory = useCallback(() => {
    setHistoryOpenNow(false);
    session.announce("History closed.");
    historyButton.current?.focus();
  }, [session]);
  // Someone who stops being the Owner while the panel is open loses it, and the board takes its room back.
  useEffect(() => {
    if (state.role !== "owner") setSettingsOpen(false);
  }, [state.role]);
  /** On a phone the Settings button is its icon alone, so its name shows in the hint box; with its word, none is needed. */
  const [iconOnly, setIconOnly] = useState(() => window.matchMedia("(max-width: 640px)").matches);
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 640px)");
    const changed = () => setIconOnly(narrow.matches);
    narrow.addEventListener("change", changed);
    return () => narrow.removeEventListener("change", changed);
  }, []);
  const openSettings = () => {
    setHistoryOpenNow(false);
    setCommentsOn(null);
    setSettingsOpen(true);
    session.announce("The settings panel is open.");
  };
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    session.announce("The settings panel is closed.");
    settingsButton.current?.focus();
  }, [session]);
  const closeComments = useCallback(() => {
    if (!commentKey) return;
    setCommentsOn(null);
    session.announce("The comments panel is closed.");
    document.querySelector<HTMLElement>(`[data-comments="${CSS.escape(commentKey)}"]`)?.focus();
  }, [session, commentKey]);
  const openComments = (target: CommentTarget) => {
    if (commentKey === targetKey(target)) return closeComments();
    setHistoryOpenNow(false);
    setSettingsOpen(false);
    setCommentsOn(target);
    session.announce("The comments panel is open.");
  };
  const sendComment = async (): Promise<string | null> => {
    if (!commentsOn || !commentKey) return null;
    const key = commentKey;
    const body = (commentDrafts[key] ?? "").trim();
    const last = commentIds.current[key];
    const id = last && last.body === body ? last.id : browserIds.itemId();
    commentIds.current[key] = { id, body };
    const why = await session.addComment(commentsOn, id, body);
    if (why === null) {
      delete commentIds.current[key];
      // Unless the reader has started another one meanwhile.
      setCommentDrafts((all) => ((all[key] ?? "").trim() === body ? { ...all, [key]: "" } : all));
    }
    return why;
  };
  // When someone else deletes or hides the subject, its comments close on the poll that says so. When the reader
  // deletes it, they close at once, and the delete's own sentence, its Undo, and the focus it set are left alone.
  useEffect(() => {
    if (!commentsOn) return;
    const mine = commentsOn !== "question" && ("optionId" in commentsOn ? state.optionsLeftOut.includes(commentsOn.optionId) : state.leftOut.includes(commentsOn.versionId));
    if (mine) return setCommentsOn(null);
    if (targetStands(view, commentsOn)) return;
    const inside = document.getElementById("sm-comments")?.contains(document.activeElement) ?? false;
    setCommentsOn(null);
    session.announce("This wording was removed, so its comments are closed.");
    if (inside) question.current?.focus();
  }, [view.rows, commentsOn, state.leftOut, state.optionsLeftOut]);
  const drawerOpen = historyOpen || settingsOpen || commentsOn !== null;
  useDrawerTop(scene, drawerOpen);
  /**
   * A comment named in History (M3b-14) opens Comments on its thread, focused and ringed, as its link does; History
   * closes, as opening Comments closes it. History links only a comment the reader holds whose thread can open.
   */
  const openCommentFromHistory = (commentId: string) => {
    const landing = commentLanding(view.rows, commentId, null);
    if (landing.kind !== "thread") return;
    setHistoryOpenNow(false);
    setSettingsOpen(false);
    setCommentsOn(landing.target);
    setLinkedThread({ id: commentId, key: targetKey(landing.target) });
    session.announce("The comments panel is open.");
  };
  const openFromHistory = (versionId: string) => {
    if (!view.rows.versions[versionId]) return;
    const shown = showVersion(versionId);
    // Where the panel covers the board, it closes, so the wording, or the note that says how to see it, can be seen.
    if (!window.matchMedia("(max-width: 1199px)").matches) return;
    setHistoryOpen(false);
    if (!shown) setFocusTo(".sm-link-note button");
  };

  const update = () => {
    anchor.current = readingAnchor(open);
    if (scene.current) shuffle.current = captureRects(scene.current);
    const gone = writing?.kind === "wording" ? view.rows.arguments[writing.argumentId] : undefined;
    if (gone && !isLive(gone)) {
      // Drafts follow their argument; when it's gone, the draft becomes a new argument in the same column.
      keep(`a:${gone.optionId}`, drafts[`w:${gone.id}`] ?? EMPTY_DRAFT);
      setWriting({ kind: "argument", optionId: gone.optionId });
      setOpen(null);
      session.update("That argument was deleted. Your draft is now a new argument.");
      return;
    }
    if (open && !isLive(view.rows.arguments[open])) setOpen(null);
    session.update();
  };

  return (
    <div className="sm-surface">
      {/* What a faded control says to a screen reader: each names one of these by aria-describedby. */}
      {Object.values(WHY).map(({ why, noteId }) => (
        <span key={noteId} id={noteId} hidden>
          {why}
        </span>
      ))}
      <div ref={scene} className={`sm-scene${drawerOpen ? " sm-with-drawer" : ""}`}>
        <Wires view={view} mine={state.mine} />
        <section className={`sm-head${commentKey === "question" ? " sm-commenting" : ""}`} aria-label="The question">
          <div className="sm-head-tools">
            <CommentBubble target="question" noun="question" className="sm-head-button" bubbles={bubbles} />
            <button
              ref={historyButton}
              type="button"
              className="sm-head-button sm-history-button cursor-interaction"
              aria-expanded={historyOpen}
              aria-controls={historyOpen ? "sm-history" : undefined}
              onClick={() => {
                if (historyOpen) return closeHistory();
                setHistoryOpen(true);
                session.announce("History is open.");
              }}
            >
              <Icon name="history" />
              <span>History</span>
            </button>
            {/* The Owner's only, as Google Docs hides what you can't use. Its word goes on a phone, where its icon is
                named Settings, as the prototype's head buttons are; History keeps its word (the builder, Nov 22). */}
            {state.role === "owner" ? (
              <button
                ref={settingsButton}
                type="button"
                className="sm-head-button sm-settings-button cursor-interaction"
                aria-expanded={settingsOpen}
                aria-controls={settingsOpen ? "sm-settings" : undefined}
                aria-label="Settings"
                data-tooltip={iconOnly ? "Settings" : undefined}
                onClick={() => (settingsOpen ? closeSettings() : openSettings())}
              >
                <Icon name="settings" />
                <span aria-hidden="true">Settings</span>
              </button>
            ) : null}
          </div>
          <h1 ref={question} tabIndex={-1}>
            {state.question}
          </h1>
          {state.access && state.role ? <Sharing access={state.access} role={state.role} me={reader} session={session} asked={shareAsked} closing={state.closing} onSettings={openSettings} settingsOpen={settingsOpen} /> : null}
          {note ? (
            <p className="sm-link-note" role="status">
              <Icon name="info" />
              <span>{note}</span>
              <button
                ref={dismiss}
                type="button"
                className="sm-link-button cursor-interaction"
                onClick={() => {
                  setNote("");
                  question.current?.focus();
                }}
              >
                Dismiss
              </button>
            </p>
          ) : null}
        </section>
        {historyOpen ? (
          <History
            boardId={boardId}
            view={view}
            reader={reader}
            role={state.role}
            closed={closed}
            session={session}
            logSeq={state.logSeq}
            onOpen={openFromHistory}
            onOpenComment={openCommentFromHistory}
            onClose={closeHistory}
          />
        ) : null}
        {commentsOn && commentKey ? (
          <Comments
            key={commentKey}
            target={commentsOn}
            view={view}
            question={state.question}
            reader={reader}
            draft={commentDrafts[commentKey] ?? ""}
            onDraft={(text) => setCommentDrafts((all) => ({ ...all, [commentKey]: text }))}
            onSend={sendComment}
            onReply={(thread, id, body) => session.addReply(commentsOn, thread, id, body)}
            onResolve={(thread, resolved) => session.setResolved(thread, resolved)}
            onDelete={(id) => session.deleteComment(id)}
            onCopyLink={(id) => copyLink(commentPath(boardId, id))}
            mayHide={can(reader, state.role, "hide", { closed }) === null}
            onHide={(id, reason) => session.setCommentHidden(id, reason)}
            arrive={onLinkedThread ? linkedThread.id : null}
            announce={(text) => session.announce(text)}
            onClose={closeComments}
          />
        ) : null}
        {settingsOpen && state.role === "owner" ? (
          <Settings
            question={state.question}
            closed={closed}
            closing={state.closing}
            session={session}
            onClose={closeSettings}
            onShare={() => {
              setSettingsOpen(false);
              session.announce("The settings panel is closed.");
              setShareAsked((n) => n + 1);
            }}
          />
        ) : null}
        <main id="sm-content">
          {zoom === "case" ? (
            <div className="sm-board" style={{ "--sm-cols": boardColumns(options, undefined) } as React.CSSProperties}>
              {state.undo && (
                <div className="sm-board-undo">
                  <UndoBar label={state.undo.label} onUndo={undo} />
                </div>
              )}
              {state.optionGone && <UndoBar label={OPTION_DELETED} onUndo={undoOptionDelete} above />}
              <StrongestCase view={view} leftOut={state.leftOut} mine={state.mine} onOpen={openFromCase} />
            </div>
          ) : (
            <div className="sm-board" style={{ "--sm-cols": boardColumns(options, openOption, addColumn ? (naming ? "naming" : "add") : null) } as React.CSSProperties}>
              {state.optionGone && <UndoBar label={OPTION_DELETED} onUndo={undoOptionDelete} above />}
              <div className="sm-sides" role="tablist" aria-label="Sides">
                {options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    className="cursor-interaction"
                    aria-selected={option.id === side}
                    aria-controls={`sm-col-${option.id}`}
                    onClick={() => {
                      // On a phone the other column is hidden, so the version open in it closes.
                      if (option.id !== side && openVersion !== null && !versionIn(option.id)) setExpanded(null);
                      setSide(option.id);
                    }}
                  >
                    <span>{option.name}</span>
                    <small>{view.shown.arguments[option.id]?.length ?? 0}</small>
                  </button>
                ))}
              </div>
              {options.map((option, index) => (
                <Column
                  key={option.id}
                  option={option}
                  first={index === 0}
                  ranked={ranked}
                  on={option.id === side}
                  gap={index > 0}
                  open={open}
                  onToggle={(id) => {
                    // Folding a row closes the version open in it, unless it's the one still showing.
                    if (open === id && openVersion !== null && (view.shown.versions[id] ?? []).indexOf(openVersion) > 0) setExpanded(null);
                    if (writing?.kind === "wording") setWriting(null);
                    setOpen(open === id ? null : id);
                  }}
                  writer={writer}
                  opening={opening}
                  view={view}
                  state={state}
                  session={session}
                  onUndo={undo}
                  structure={structure}
                  mayStructure={mayStructure}
                  deleteBlocked={options.length <= OPTIONS_PER_BOARD.min ? "A question needs at least two options." : (view.shown.arguments[option.id] ?? []).some((id) => isLive(view.rows.arguments[id])) ? "Only an empty option can be deleted." : null}
                />
              ))}
              {addColumn && (
                <>
                  <div className="sm-col-gap" aria-hidden="true" />
                  {naming ? (
                    <section className="sm-column sm-side-on" aria-label="New option">
                      <div className="sm-column-head">
                        <OptionName initial="" onDone={(name, by) => void nameNew(name, by)} onCancel={() => void nameNew("", "escape")} />
                      </div>
                    </section>
                  ) : (
                    <div className="sm-add-option-col">
                      <button ref={addButton} type="button" className="sm-add-option cursor-interaction" aria-label="Add an option" data-tooltip="Add an option" onClick={() => setNaming(browserIds.itemId())}>
                        <Icon name="plus" />
                        <span className="sm-add-short">Option</span>
                        <span className="sm-add-long">Add an option</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {/* Inside the main region, so a screen reader finds it with the board it's about; it's drawn at the window's foot. */}
          {state.problem !== null ? <Problem text={state.problem} onDismiss={() => session.dismissProblem()} /> : null}
        </main>
      </div>
      {/* Strongest case already follows the newest order, so the pill offers no Update there. */}
      {/* The pill sits above everything, so it waits for the tour: Update would move the cards the tour points at. */}
      {tour ? null : <Pill state={state} count={zoom === "case" ? 0 : session.pillCount()} onUpdate={update} />}
      {tour && zoom === "read" ? (
        <Tour
          steps={tour.steps}
          at={tour.at}
          onNext={() => (tour.at === tour.steps.length - 1 ? endTour(true) : tourTo(tour.at + 1))}
          onBack={() => tourTo(tour.at - 1)}
          onSkip={() => endTour(false)}
        />
      ) : null}
      {asking ? (
        <RestructureDialog
          asking={asking}
          loadPreview={() => (asking.kind === "combine" ? session.combinePreview(asking.versionId, asking.intoId) : Promise.resolve(null))}
          onConfirm={confirmAsking}
          onCancel={cancelAsking}
        />
      ) : null}
      <div id="sm-status" className="sm-live" role="status" aria-live="polite">
        {state.status}
      </div>
    </div>
  );
}

interface Arrival {
  side: string | null;
  row: string | null;
  /** The version opened. */
  version: string | null;
  /** A card ringed without being opened: the wording a linked comment is on (M3b-13). */
  ring: string | null;
  note: string;
  /** The panel a comment's link opens (M3b-13): its thread's subject, and the comment. */
  comments: { target: CommentTarget; comment: string } | null;
}

/**
 * Where a link to a version lands: its column, its row unfolded unless it
 * leads the row, and the version open. A version that isn't on the board
 * (deleted, or never there) gets a note instead.
 */
function arrivalFor(view: ReaderView, versionId: string | null): Arrival {
  const none: Arrival = { side: null, row: null, version: null, ring: null, note: "", comments: null };
  if (!versionId) return none;
  const version = view.rows.versions[versionId];
  const argument = version ? view.rows.arguments[version.argumentId] : undefined;
  const at = argument ? (view.shown.versions[argument.id] ?? []).indexOf(versionId) : -1;
  // A hidden wording keeps its place, saying "Removed by a moderator" (M2-4): the link lands there.
  if (!argument || !isLive(argument) || !version || version.deleted || at < 0) return { ...none, note: "That version was deleted." };
  return { ...none, side: argument.optionId, row: at > 0 ? argument.id : null, version: versionId };
}

/**
 * Where a link to a comment lands (M3b-13), as the prototype's openLink does it: Comments open on its thread's
 * subject, and a wording the thread is on is shown, its column chosen and its row unfolded unless it leads it, and
 * ringed, but not opened, so closing the panel leaves the board's address. An option's column is chosen. A comment
 * that can't be opened gets a note instead (comment-link.ts).
 */
function commentArrivalFor(view: ReaderView, commentId: string, said: CommentLinkState | null): Arrival {
  const none: Arrival = { side: null, row: null, version: null, ring: null, note: "", comments: null };
  const landing = commentLanding(view.rows, commentId, said);
  if (landing.kind === "note") return { ...none, note: landing.note };
  const comments = { target: landing.target, comment: commentId };
  if (landing.target === "question") return { ...none, comments };
  if ("optionId" in landing.target) return { ...none, side: landing.target.optionId, comments };
  const versionId = landing.target.versionId;
  const argument = view.rows.arguments[view.rows.versions[versionId]!.argumentId];
  const at = argument ? (view.shown.versions[argument.id] ?? []).indexOf(versionId) : -1;
  // A wording the board doesn't show where it is now (moved, and not yet updated) isn't revealed; its panel still opens.
  if (!argument || at < 0) return { ...none, comments };
  return { ...none, side: argument.optionId, row: at > 0 ? argument.id : null, ring: versionId, comments };
}

/** Whether a version can be seen: it leads its row, or its row is unfolded. */
function onScreen(view: ReaderView, unfolded: string | null, versionId: string): boolean {
  const version = view.rows.versions[versionId];
  if (!isLiveVersion(version)) return false;
  const at = (view.shown.versions[version!.argumentId] ?? []).indexOf(versionId);
  return at === 0 || (at > 0 && unfolded === version!.argumentId);
}

/** Which draft form is open, the author's edit included: one at a time. */
type Writing = { kind: "wording"; argumentId: string } | { kind: "argument"; optionId: string } | { kind: "edit"; versionId: string } | null;

/** What the rows and columns need to write in place. */
export interface Writer {
  writing: Writing;
  draft(key: string): DraftText;
  change(key: string, draft: DraftText): void;
  start(writing: Writing): void;
  close(): void;
  addWording(argumentId: string, draft: DraftText): void;
  addArgument(optionId: string, draft: DraftText): void;
}

/** While a row is unfolded, its column takes most of the width, and the others keep a readable one. */
function boardColumns(options: OptionRow[], wide: string | undefined, extra: "add" | "naming" | null = null): string {
  const rest = wide ? `minmax(${options.length === 2 ? 260 : 200}px,1fr)` : "minmax(0,1fr)";
  const columns = options.map((option) => (option.id === wide ? "minmax(0,2.6fr)" : rest)).join(" 32px ");
  // After the last option, the prototype's dashed "Add an option", or the new option being named (M3a-2).
  return extra === "add" ? `${columns} 20px max-content` : extra === "naming" ? `${columns} 32px ${rest}` : columns;
}

/** The row Update keeps in place: the unfolded one, else the first at least partly in view. */
function readingAnchor(open: string | null): { id: string; top: number } | null {
  const unfolded = open ? document.querySelector(`[data-node="${open}"]`) : null;
  // Measured as captureRects() measures, so that a row still growing in a shuffle is held at its own size (M3d-3).
  if (unfolded) return { id: open!, top: drawnRect(unfolded).top };
  for (const row of document.querySelectorAll<HTMLElement>("[data-node]")) {
    const box = drawnRect(row);
    if (box.top + box.height > 60) return { id: row.dataset.node!, top: box.top };
  }
  return null;
}

/**
 * Why the last thing the reader did wasn't done (M-14), at the foot of the window, above the Update pill: one sentence
 * and a way to close it, with no icon, as Material's snackbar has it. It isn't a live region: the status line has
 * already said it to a screen reader.
 */
function Problem({ text, onDismiss }: { text: string; onDismiss(): void }) {
  return (
    <div className="sm-problem">
      <span>{text}</span>
      <button type="button" className="cursor-interaction" aria-label="Dismiss" data-tooltip="Dismiss" onClick={onDismiss}>
        <Icon name="x" size={15} />
      </button>
    </div>
  );
}

/** "Too many in a row. Try again in a minute. · 1 waiting to send", "Offline · 1 waiting to send", "Back online · 1 sent", or "3 changes · Update". */
function Pill({ state, count, onUpdate }: { state: SessionState; count: number; onUpdate(): void }) {
  let content: React.ReactNode = null;
  if (state.tooMany !== null) {
    // Over a rate limit: what's waiting is sent once the wait has passed (architecture §7).
    content = (
      <span>
        <Icon name="clock" size={15} />
        {`${state.tooMany}${state.waiting > 0 ? ` · ${state.waiting} waiting to send` : ""}`}
      </span>
    );
  } else if (state.offline) {
    content = (
      <span>
        <Icon name="wifi-off" size={15} />
        {`Offline${state.waiting > 0 ? ` · ${state.waiting} waiting to send` : ""}`}
      </span>
    );
  } else if (state.backOnline !== null) {
    content = (
      <span>
        <Icon name="wifi" size={15} />
        {`Back online${state.backOnline > 0 ? ` · ${state.backOnline} sent` : ""}`}
      </span>
    );
  } else if (count > 0) {
    content = (
      <>
        <span>
          <Icon name="refresh-cw" size={15} />
          {`${count} ${count === 1 ? "change" : "changes"}`}
        </span>
        <button type="button" className="cursor-interaction" onClick={onUpdate}>
          Update
        </button>
      </>
    );
  }
  const quiet = state.offline || state.backOnline !== null;
  return (
    <div className={`sm-fresh${quiet ? " sm-quiet" : ""}`} role="status" hidden={content === null}>
      {content}
    </div>
  );
}

interface ColumnProps {
  option: OptionRow;
  first: boolean;
  /** Whether any column has two arguments to rank, so the importance axis means something. */
  ranked: boolean;
  on: boolean;
  gap: boolean;
  open: string | null;
  onToggle(argumentId: string): void;
  writer: Writer;
  opening: Opening;
  view: ReaderView;
  state: SessionState;
  session: BoardSession;
  onUndo(): void;
  /** Combining and separating, while a wording is being placed (M3a-7). */
  structure: Structure;
  /** Whether this reader may add, rename, and delete options (M3a-2). */
  mayStructure: boolean;
  /** Why this option can't be deleted, or null when it can. */
  deleteBlocked: string | null;
}

/** A wording being placed: by picking (its menu, or a press on its handle) or by a drag (M3a-7). */
interface Moving {
  versionId: string;
  wording: string;
  /** The argument it's in, and that argument's option. */
  from: string;
  optionId: string;
  /** Whether it's its argument's last wording, so combining makes the two arguments one. */
  last: boolean;
  /** Where the cursor goes back to if it's cancelled. */
  returnTo: string;
}

/** What the columns and rows need for combining and separating (M3a-7). */
interface Structure {
  picking: Moving | null;
  dragging: Moving | null;
  restructured: Restructured | null;
  pick(argumentId: string): void;
  cancel(): void;
  /** A drop on an argument, or on Add an argument to separate. */
  drop(target: string | "separate"): void;
  undo(): void;
}

function Column({ option, first, ranked, on, gap, open, onToggle, writer, opening, view, state, session, onUndo, structure, mayStructure, deleteBlocked }: ColumnProps) {
  const reader = useReader();
  const key = `a:${option.id}`;
  const argumentIds = view.shown.arguments[option.id] ?? [];
  const held = state.undo?.optionId === option.id ? state.undo : null;
  // Under the row it was placed after; first in the column if that row has since gone (Update took it off).
  const barAfter = held?.after != null && argumentIds.includes(held.after) ? held.after : null;
  const moved = structure.restructured?.optionId === option.id ? structure.restructured : null;
  const movedAfter = moved?.after != null && argumentIds.includes(moved.after) ? moved.after : null;
  const movedBar = moved ? <UndoBar label={moved.label} onUndo={structure.undo} /> : null;
  const dragging = structure.dragging?.optionId === option.id ? structure.dragging : null;
  return (
    <>
      {gap && <div className="sm-col-gap" aria-hidden="true" />}
      <section
        className={`sm-column${first ? " sm-first" : ""}${on ? " sm-side-on" : ""}`}
        id={`sm-col-${option.id}`}
        data-option={option.id}
        aria-label={option.name}
        // A drop on a row combines; a drop on Add an argument separates (M3a-7), as the prototype's drag does.
        onDragOver={(event) => {
          if (dragging && (event.target as Element).closest?.(".sm-drop-target")) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(event) => {
          const target = (event.target as Element).closest?.<HTMLElement>(".sm-drop-target");
          if (!dragging || !target) return;
          event.preventDefault();
          structure.drop(target.classList.contains("sm-drop-split") ? "separate" : target.dataset.node!);
        }}
      >
        <Texture />
        {first && ranked && (
          <div className="sm-col-vaxis">
            <Axis kind="v" start="more important" end="less important" />
          </div>
        )}
        <OptionHead option={option} mayStructure={mayStructure} deleteBlocked={deleteBlocked} session={session} bubbles={opening.comments} />
        {structure.picking?.optionId === option.id ? (
          // Not a live region: the cursor is already on the first Combine here, and the status line has said this.
          <div className="sm-move-banner">
            <span>Pick the argument that makes the same point.</span>
            <button type="button" className="sm-link-button cursor-interaction" onClick={structure.cancel}>
              Cancel
            </button>
          </div>
        ) : null}
        {argumentIds.length >= 2 && (
          <div className="sm-col-axis" aria-hidden="true">
            <Icon name="arrow-down" />
            Most important first
          </div>
        )}
        {held && barAfter === null && <UndoBar label={held.label} onUndo={onUndo} />}
        {moved && movedAfter === null && movedBar}
        {argumentIds.map((id) => {
          const argument = view.rows.arguments[id];
          return argument ? (
            <Fragment key={id}>
              <Row argument={argument} open={open === id} onToggle={() => onToggle(id)} writer={writer} opening={opening} view={view} state={state} session={session} structure={structure} />
              {held && barAfter === id && <UndoBar label={held.label} onUndo={onUndo} />}
              {moved && movedAfter === id && movedBar}
            </Fragment>
          ) : null;
        })}
        <ArgumentSlot
          optionName={option.name}
          open={writer.writing?.kind === "argument" && writer.writing.optionId === option.id}
          draft={writer.draft(key)}
          onOpen={() => writer.start({ kind: "argument", optionId: option.id })}
          onChange={(draft) => writer.change(key, draft)}
          onClose={writer.close}
          onAdd={(draft) => writer.addArgument(option.id, draft)}
          blocked={whyNot(reader, state.role, "add", state.closing?.closed)}
          dropLabel={dragging && !dragging.last ? "Make it a separate argument" : undefined}
        />
      </section>
    </>
  );
}

interface RowProps {
  argument: ArgumentRow;
  open: boolean;
  onToggle(): void;
  writer: Writer;
  opening: Opening;
  view: ReaderView;
  state: SessionState;
  session: BoardSession;
  structure: Structure;
}

function Row({ argument, open, onToggle, writer, opening, view, state, session, structure }: RowProps) {
  const reader = useReader();
  const versionIds = view.shown.versions[argument.id] ?? [];
  const versions = versionIds.map((id) => view.rows.versions[id]).filter((version) => version !== undefined);
  const lead = versions[0];
  // Before any return: a row with nothing to show yet (its only wording hidden) draws again when one is restored.
  const [at, setAt] = useState(0);
  if (!lead) return null;
  const label = short(lead.wording ?? (lead.hidden && !lead.deleted ? "Removed by a moderator" : `Deleted by ${lead.authorName}`));
  const { vote, score } = importanceShown(argument, state.mine);
  const count = versionIds.length;
  if (argument.mergedInto !== null) return <MergedRow argument={argument} label={label} view={view} opening={opening} />;
  // While a wording is being placed (M3a-7): the other live arguments in its option take it.
  const placing = structure.picking ?? structure.dragging;
  const source = placing?.from === argument.id;
  const target = placing !== null && placing.optionId === argument.optionId && !source && isLive(argument);
  return (
    <section
      className={`sm-idea${open ? " sm-open" : ""}${count < 2 ? " sm-single" : ""}${source ? " sm-move-source" : ""}${target ? " sm-move-target" : ""}${target && structure.dragging ? " sm-drop-target" : ""}`}
      data-node={argument.id}
      data-drop-label={target && structure.dragging ? "Combine here" : undefined}
      aria-label={label}
    >
      {open && <TrackAxis count={count} at={at} onFold={onToggle} />}
      <VoteControl
        axis="v"
        group={`Importance: ${label}`}
        value={vote}
        score={score}
        forward="More important if true"
        back="Less important if true"
        onVote={(value) => session.act({ kind: "importance", argumentId: argument.id, value })}
        blocked={whyNot(reader, state.role, "vote", state.closing?.closed)}
      />
      <div className="sm-card-wrap">
        {open ? (
          <Track versions={versions} argumentId={argument.id} writer={writer} state={state} session={session} opening={opening} onAt={setAt} />
        ) : (
          <>
            <Stack count={count} onUnfold={onToggle} />
            <Card version={lead} opening={opening} row={argument.id} />
          </>
        )}
        {target && structure.picking ? (
          <button type="button" className="sm-move-here cursor-interaction" aria-label={`Combine here: same point as “${short(leadWording(view, argument.id) ?? label)}”`} onClick={() => structure.pick(argument.id)}>
            <span>
              <Icon name="merge" />
              Combine here
            </span>
          </button>
        ) : null}
      </div>
      {/* Asked again after a combine, when the reader's two votes disagreed (PRD §5), until they vote: a chip under the
          card, with the vote it asks for ringed. Why is its hint, and what a screen reader hears. */}
      {argument.askedAgain && vote === null ? (
        <p className="sm-vote-again" role="note" data-tooltip="Your votes on the two arguments disagreed.">
          <Icon name="rotate-ccw" />
          <span aria-hidden="true">Vote again</span>
          <span className="sm-sr">Your votes on the two arguments disagreed, so vote again.</span>
        </p>
      ) : null}
    </section>
  );
}

/**
 * An argument someone combined into another (M3a-7), in its place until
 * Update, as the prototype's mergedRow: what it was combined with, and Go to
 * it. Who did it is in History.
 */
function MergedRow({ argument, label, view, opening }: { argument: ArgumentRow; label: string; view: ReaderView; opening: Opening }) {
  const into = finalArgument(view, argument.id);
  const shown = Object.values(view.shown.arguments).some((ids) => ids.includes(into));
  // Never a wording that was deleted, or that has moved out of that argument since.
  const lead = leadWording(view, into);
  return (
    <section className="sm-idea sm-merged" data-node={argument.id} aria-label={label}>
      <div className="sm-card-wrap">
        <article className="sm-card sm-removed sm-gone">
          <p className="sm-removed-note">
            <Icon name="merge" />
            <span>{lead ? `This was combined with ${endQuote(lead)}` : "This was combined with another argument."}</span>
          </p>
          {shown ? (
            <button type="button" className="sm-link-button sm-gone-link cursor-interaction" onClick={() => opening.menu.goTo(into)}>
              Go to it
            </button>
          ) : null}
        </article>
      </div>
    </section>
  );
}


/**
 * An option's header (M3a-2, A-07): its name, its speech bubble for everyone
 * (M3b-11, D-01), and for an Editor or the Owner the prototype's ⋯, "Options
 * for …", with Rename option and Delete option. Renaming happens in the
 * header itself.
 */
function OptionHead({ option, mayStructure, deleteBlocked, session, bubbles }: { option: OptionRow; mayStructure: boolean; deleteBlocked: string | null; session: BoardSession; bubbles: CommentBubbles }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const back = () => window.setTimeout(() => trigger.current?.focus());
  const close = useCallback(() => setMenuOpen(false), []);
  return (
    <div className={`sm-column-head${bubbles.on === `o:${option.id}` ? " sm-commenting" : ""}`}>
      {renaming ? (
        <OptionName
          initial={option.name}
          onDone={(name, by) => {
            setRenaming(false);
            // Only Enter puts the cursor back on ⋯: leaving the field leaves it where it went.
            if (by === "enter") back();
            if (!name) session.announce("An option needs a name, so the old name stays.");
            else if (name !== option.name) void session.renameOption(option.id, name);
          }}
          onCancel={() => {
            setRenaming(false);
            back();
          }}
        />
      ) : (
        <h2>{option.name}</h2>
      )}
      {!renaming && (
        <div className="sm-column-tools">
          <CommentBubble target={{ optionId: option.id }} noun="option" className="sm-head-button" bubbles={bubbles} />
          {mayStructure && (
          <button
            ref={trigger}
            type="button"
            className="sm-head-button cursor-interaction"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Options for ${option.name}`}
            data-tooltip="Option settings"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Icon name="ellipsis" />
          </button>
          )}
          {mayStructure && menuOpen && (
            <OptionMenu
              trigger={trigger}
              deleteBlocked={deleteBlocked}
              onClose={close}
              onRename={() => {
                setMenuOpen(false);
                setRenaming(true);
              }}
              onDelete={() => {
                setMenuOpen(false);
                session.holdOptionDelete({ id: option.id, name: option.name });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** How a name field was left: by Enter, by Escape, or by the cursor going elsewhere. */
type Finish = "enter" | "escape" | "blur";

/** The name field in an option's header, as the prototype's: Enter or leaving it keeps the name, Escape doesn't. */
function OptionName({ initial, onDone, onCancel }: { initial: string; onDone(name: string, by: Finish): void; onCancel(): void }) {
  const [draft, setDraft] = useState(initial);
  const field = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const finish = (by: Finish) => {
    if (finished.current) return;
    finished.current = true;
    if (by === "escape") onCancel();
    else onDone(cleanText(draft).slice(0, 80), by);
  };
  return (
    <input
      ref={field}
      className="sm-option-input"
      type="text"
      maxLength={80}
      placeholder="Name this option"
      aria-label="Option name"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish("enter");
        if (event.key === "Escape") finish("escape");
      }}
      onBlur={() => finish("blur")}
    />
  );
}

/** What the Undo bar says after an option is deleted (M3a-2). */
const OPTION_DELETED = "You deleted the option.";

/**
 * What happened, and Undo, for ten seconds; the status line announces it. "Version deleted." sits where the deletion
 * was, and "You combined the arguments." under the row the wording joined (M3a-7). `above`: over the whole board, as
 * "You deleted the option." is (M3a-2).
 */
function UndoBar({ label, onUndo, above = false }: { label: string; onUndo(): void; above?: boolean }) {
  const bar = (
    <div className="sm-undo">
      <span>{label}</span>
      <button type="button" className="sm-link-button cursor-interaction" onClick={onUndo}>
        Undo
      </button>
    </div>
  );
  return above ? <div className="sm-board-undo sm-option-undo">{bar}</div> : bar;
}

/** The stack beside a card: how many wordings it has, or ≫ when there's no other yet. */
function Stack({ count, onUnfold }: { count: number; onUnfold(): void }) {
  const hidden = count - 1;
  const empty = hidden === 0;
  const edges = empty ? [1] : Array.from({ length: Math.min(hidden, 3) }, (_, k) => Math.min(hidden, 3) - k);
  return (
    <button
      type="button"
      className={`sm-stack-button${empty ? " sm-empty" : ""} cursor-interaction`}
      aria-label={empty ? "Write another wording of this argument" : `Compare ${count} wordings of this argument`}
      data-tooltip={empty ? "Write another wording" : `${count} wordings`}
      onClick={onUnfold}
    >
      {edges.map((i) => (
        <span key={i} aria-hidden="true" style={{ right: `${24 - 7 * i}px`, top: `${3 * i}px`, bottom: `${3 * i}px` }} />
      ))}
      <b className="sm-stack-count" aria-hidden="true">
        {empty ? <Icon name="chevrons-right" /> : count}
      </b>
    </button>
  );
}
