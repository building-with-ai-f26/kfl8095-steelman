// The board screen (M0-6): the prototype's markup, drawn from what the
// reader holds (session.ts). Rows sit where `view.shown` puts them; counts
// change in place; the pill counts what Update would change.
//
// A version's ⋯ menu (A-12) edits in place, suggests a revised version in
// the row's draft, and deletes with Undo: the deletion leaves the screen at
// once and the session holds it for ten seconds before sending it.
//
// Its address (M-06) is the board's, or the open version's while one is
// open. It changes in place (history.replaceState), as the prototype's
// does, so Back leaves the board instead of closing cards one by one.

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { leaveOut } from "@steelman/shared";
import type { ArgumentRow, CaseItem, OptionRow, ReaderView, VersionRow } from "@steelman/shared";
import { Axis, Icon } from "../icons.tsx";
import { NotFound } from "../NotFound.tsx";
import { useReader } from "../reader.ts";
import { boardPath, versionPath } from "../links.ts";
import { browserIds } from "../system.ts";
import { Card } from "./Card.tsx";
import type { CardMenu, Opening } from "./Card.tsx";
import { ArgumentSlot, EMPTY_DRAFT, cleanDraft } from "./Forms.tsx";
import { Sharing } from "./Sharing.tsx";
import { StrongestCase } from "./StrongestCase.tsx";
import type { DraftText } from "./Forms.tsx";
import { Track, TrackAxis } from "./Track.tsx";
import { VoteControl } from "./Vote.tsx";
import { WHY, columns, importanceShown, isLive, isLiveVersion, moderationItem, reportItem, short, versionMenu, whyNot } from "./display.ts";
import { BoardSession } from "./session.ts";
import type { Held, SessionState } from "./session.ts";

/** How long a version a link points to stays ringed. */
const RING_MS = 1_400;

/** The board's view (E-01): "read" is the whole board, "case" each option's strongest case. */
export type Zoom = "read" | "case";

interface BoardProps {
  boardId: string;
  version?: string | null;
  zoom?: Zoom;
  onZoom?(zoom: Zoom): void;
  /** Told when the board itself is on screen, and when it's gone: the switch shows only then. */
  onShown?(shown: boolean): void;
}

export function Board({ boardId, version = null, zoom = "read", onZoom = () => {}, onShown = () => {} }: BoardProps) {
  const [session] = useState(() => new BoardSession(boardId));
  useEffect(() => {
    void session.start();
    return () => session.stop();
  }, [session]);
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  // The reader's own deletions are off the screen at once.
  const view = useMemo(() => (state.view ? leaveOut(state.view, state.leftOut) : null), [state.view, state.leftOut]);

  if (state.phase === "missing") return <NotFound />;
  if (state.phase === "no_access") return <p className="sm-meta">You don’t have access to this steelman.</p>;
  if (state.phase === "signed_out") return <p className="sm-meta">You’ve been signed out. Reload the page to sign in.</p>;
  if (!view) return null;
  return <BoardView boardId={boardId} linked={version} view={view} state={state} session={session} zoom={zoom} onZoom={onZoom} onShown={onShown} />;
}

interface BoardViewProps {
  boardId: string;
  /** The version the link that opened the board points to. */
  linked: string | null;
  view: ReaderView;
  state: SessionState;
  session: BoardSession;
  zoom: Zoom;
  onZoom(zoom: Zoom): void;
  onShown(shown: boolean): void;
}

function BoardView({ boardId, linked, view, state, session, zoom, onZoom, onShown }: BoardViewProps) {
  const options = columns(view);
  // The importance axis only means something once a column has two arguments to rank.
  const ranked = options.some((option) => (view.shown.arguments[option.id]?.length ?? 0) >= 2);
  const [arrival] = useState(() => arrivalFor(view, linked));
  const [side, setSide] = useState(arrival.side ?? options[0]?.id);
  /** The row unfolded to compare its wordings: one at a time. */
  const [open, setOpen] = useState<string | null>(arrival.row);
  /** The version opened by its wording, one at a time. It counts as open only while it's on screen. */
  const [expanded, setExpanded] = useState<string | null>(arrival.version);
  const openVersion = expanded !== null && onScreen(view, open, expanded) ? expanded : null;
  const [arrived, setArrived] = useState<string | null>(arrival.version);
  const [note, setNote] = useState(arrival.note);
  const dismiss = useRef<HTMLButtonElement>(null);
  const [writing, setWriting] = useState<Writing>(null);
  /** Drafts kept for later, by where they were started: "w:<argument>" or "a:<option>". */
  const [drafts, setDrafts] = useState<Record<string, DraftText>>({});
  const keep = (key: string, draft: DraftText) => setDrafts((all) => ({ ...all, [key]: draft }));
  const reader = useReader();
  /** Where the cursor goes once the screen has changed: after an edit, a delete, or Undo. */
  const [focusTo, setFocusTo] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!focusTo) return;
    document.querySelector<HTMLElement>(focusTo)?.focus();
    setFocusTo(null);
  }, [focusTo]);
  const cardControl = (versionId: string, control: "claim" | "menu") => `[data-card="${CSS.escape(versionId)}"] .${control === "claim" ? "sm-claim-button" : "sm-card-menu-button"}`;
  /** The row's wordings that are still there. */
  /**
   * Whether deleting this wording deletes its argument: only when no other wording is left, counting one a moderator
   * hid, which keeps the argument on the service (writing.ts) and can be restored (M2-4).
   */
  const isLast = (version: VersionRow) =>
    (view.shown.versions[version.argumentId] ?? []).filter((id) => id !== version.id && !view.rows.versions[id]?.deleted && (view.rows.versions[id]?.hidden || isLiveVersion(view.rows.versions[id]))).length === 0;

  const menu: CardMenu = {
    items: (version) =>
      version.hidden
        ? ["copyLink", ...moderationItem(version, reader, state.role)]
        : [...versionMenu(version, reader, state.role, isLast(version)), ...reportItem(version, reader, state.role), ...moderationItem(version, reader, state.role)],
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

  const opening: Opening = {
    open: openVersion,
    arrived,
    evidence: {
      sources: view.rows.sources,
      versions: view.rows.versions,
      role: state.role,
      mine: state.mine,
      stale: state.stale,
      removing: state.undo?.action.kind === "uncite" ? state.undo.action : null,
      removeSource(version, sourceId, assessed) {
        const optionId = view.rows.arguments[version.argumentId]!.optionId;
        const label = assessed ? "Source removed. The credibility score resets." : "Source removed.";
        session.hold({ action: { kind: "uncite", versionId: version.id, sourceId }, label, optionId, after: version.argumentId });
        setFocusTo(".sm-undo button");
      },
      act: (action) => session.act(action),
      announce: (text) => session.announce(text),
    },
    toggle: (id) => setExpanded(openVersion === id ? null : id),
    copyLink(id) {
      const link = new URL(versionPath(boardId, id), window.location.origin).href;
      const copied = navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject(new Error("No clipboard"));
      copied.then(
        () => session.announce("Link copied."),
        () => session.announce(`Copying isn’t allowed here. The link is ${link}`),
      );
    },
    menu,
  };

  // The address follows what's open.
  useEffect(() => {
    const path = openVersion ? versionPath(boardId, openVersion) : boardPath(boardId);
    if (window.location.pathname !== path) window.history.replaceState(window.history.state, "", path + window.location.search + window.location.hash);
  }, [boardId, openVersion]);

  // A link's version comes into view and rings; a link to one that's gone puts the cursor on its note.
  useEffect(() => {
    if (!arrived) return;
    document.querySelector(`[data-card="${CSS.escape(arrived)}"]`)?.scrollIntoView({ block: "center", inline: "nearest" });
    const timer = window.setTimeout(() => setArrived(null), RING_MS);
    return () => window.clearTimeout(timer);
  }, [arrived]);
  useEffect(() => {
    if (arrival.note) dismiss.current?.focus();
    if (linked) session.announce(`${arrival.note ? `${arrival.note} ` : ""}Opened “${state.question}”.`);
    // Once, when the board first shows.
  }, []);
  const question = useRef<HTMLHeadingElement>(null);
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

  // Update holds the row you're reading still on screen while the others move around it.
  useLayoutEffect(() => {
    const held = anchor.current;
    anchor.current = null;
    if (!held) return;
    const now = document.querySelector(`[data-node="${held.id}"]`)?.getBoundingClientRect().top;
    if (now !== undefined && now !== held.top) window.scrollBy(0, now - held.top);
  }, [view.shown]);

  useEffect(() => {
    onShown(true);
    return () => onShown(false);
  }, [onShown]);
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
    session.announce(`${editing ? "Your changes were discarded. " : ""}Strongest case: each option’s most important arguments, in their best wording. Choose one to open it on the board.`);
  }, [zoom, session, writing]);
  /** Choosing an argument in Strongest case opens its wording on the board, its row unfolded if the wording doesn't lead it there. */
  const openFromCase = (item: CaseItem) => {
    const at = (view.shown.versions[item.argumentId] ?? []).indexOf(item.versionId);
    if (writing?.kind === "wording") setWriting(null);
    setOpen(at > 0 ? item.argumentId : null);
    setExpanded(item.versionId);
    setSide(view.rows.arguments[item.argumentId]!.optionId);
    setArrived(item.versionId);
    setFocusTo(cardControl(item.versionId, "claim"));
    onZoom("read");
  };

  const update = () => {
    anchor.current = readingAnchor(open);
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
      <div className="sm-scene">
        <section className="sm-head" aria-label="The question">
          <h1 ref={question} tabIndex={-1}>
            {state.question}
          </h1>
          {state.access && state.role ? <Sharing access={state.access} role={state.role} session={session} /> : null}
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
        <main id="sm-content">
          {zoom === "case" ? (
            <div className="sm-board" style={{ "--sm-cols": boardColumns(options, undefined) } as React.CSSProperties}>
              {state.undo && (
                <div className="sm-board-undo">
                  <UndoBar held={state.undo} onUndo={undo} />
                </div>
              )}
              <StrongestCase view={view} leftOut={state.leftOut} mine={state.mine} onOpen={openFromCase} />
            </div>
          ) : (
            <div className="sm-board" style={{ "--sm-cols": boardColumns(options, openOption) } as React.CSSProperties}>
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
                />
              ))}
            </div>
          )}
        </main>
      </div>
      {/* Strongest case already follows the newest order, so the pill offers no Update there. */}
      <Pill state={state} count={zoom === "case" ? 0 : session.pillCount()} onUpdate={update} />
      <div id="sm-status" className="sm-live" role="status" aria-live="polite">
        {state.status}
      </div>
    </div>
  );
}

interface Arrival {
  side: string | null;
  row: string | null;
  version: string | null;
  note: string;
}

/**
 * Where a link to a version lands: its column, its row unfolded unless it
 * leads the row, and the version open. A version that isn't on the board
 * (deleted, or never there) gets a note instead.
 */
function arrivalFor(view: ReaderView, versionId: string | null): Arrival {
  const none: Arrival = { side: null, row: null, version: null, note: "" };
  if (!versionId) return none;
  const version = view.rows.versions[versionId];
  const argument = version ? view.rows.arguments[version.argumentId] : undefined;
  const at = argument ? (view.shown.versions[argument.id] ?? []).indexOf(versionId) : -1;
  // A hidden wording keeps its place, saying "Removed by a moderator" (M2-4): the link lands there.
  if (!argument || !isLive(argument) || !version || version.deleted || at < 0) return { ...none, note: "That version was deleted." };
  return { side: argument.optionId, row: at > 0 ? argument.id : null, version: versionId, note: "" };
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
function boardColumns(options: OptionRow[], wide: string | undefined): string {
  const rest = wide ? `minmax(${options.length === 2 ? 260 : 200}px,1fr)` : "minmax(0,1fr)";
  return options.map((option) => (option.id === wide ? "minmax(0,2.6fr)" : rest)).join(" 32px ");
}

/** The row Update keeps in place: the unfolded one, else the first at least partly in view. */
function readingAnchor(open: string | null): { id: string; top: number } | null {
  const unfolded = open ? document.querySelector(`[data-node="${open}"]`) : null;
  if (unfolded) return { id: open!, top: unfolded.getBoundingClientRect().top };
  for (const row of document.querySelectorAll<HTMLElement>("[data-node]")) {
    const box = row.getBoundingClientRect();
    if (box.bottom > 60) return { id: row.dataset.node!, top: box.top };
  }
  return null;
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
}

function Column({ option, first, ranked, on, gap, open, onToggle, writer, opening, view, state, session, onUndo }: ColumnProps) {
  const reader = useReader();
  const key = `a:${option.id}`;
  const argumentIds = view.shown.arguments[option.id] ?? [];
  const held = state.undo?.optionId === option.id ? state.undo : null;
  // Under the row it was placed after; first in the column if that row has since gone (Update took it off).
  const barAfter = held?.after != null && argumentIds.includes(held.after) ? held.after : null;
  return (
    <>
      {gap && <div className="sm-col-gap" aria-hidden="true" />}
      <section className={`sm-column${first ? " sm-first" : ""}${on ? " sm-side-on" : ""}`} id={`sm-col-${option.id}`} data-option={option.id} aria-label={option.name}>
        {first && ranked && (
          <div className="sm-col-vaxis">
            <Axis kind="v" start="more important" end="less important" />
          </div>
        )}
        <div className="sm-column-head">
          <h2>{option.name}</h2>
        </div>
        {argumentIds.length >= 2 && (
          <div className="sm-col-axis" aria-hidden="true">
            <Icon name="arrow-down" />
            Most important first
          </div>
        )}
        {held && barAfter === null && <UndoBar held={held} onUndo={onUndo} />}
        {argumentIds.map((id) => {
          const argument = view.rows.arguments[id];
          return argument ? (
            <Fragment key={id}>
              <Row argument={argument} open={open === id} onToggle={() => onToggle(id)} writer={writer} opening={opening} view={view} state={state} session={session} />
              {held && barAfter === id && <UndoBar held={held} onUndo={onUndo} />}
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
          blocked={whyNot(reader, state.role, "add")}
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
}

function Row({ argument, open, onToggle, writer, opening, view, state, session }: RowProps) {
  const reader = useReader();
  const versionIds = view.shown.versions[argument.id] ?? [];
  const versions = versionIds.map((id) => view.rows.versions[id]).filter((version) => version !== undefined);
  const lead = versions[0];
  if (!lead) return null;
  const label = short(lead.wording ?? (lead.hidden && !lead.deleted ? "Removed by a moderator" : `Deleted by ${lead.authorName}`));
  const { vote, score } = importanceShown(argument, state.mine);
  const count = versionIds.length;
  const [at, setAt] = useState(0);
  return (
    <section className={`sm-idea${open ? " sm-open" : ""}${count < 2 ? " sm-single" : ""}`} data-node={argument.id} aria-label={label}>
      {open && <TrackAxis count={count} at={at} onFold={onToggle} />}
      <VoteControl
        axis="v"
        group={`Importance: ${label}`}
        value={vote}
        score={score}
        forward="More important if true"
        back="Less important if true"
        onVote={(value) => session.act({ kind: "importance", argumentId: argument.id, value })}
        blocked={whyNot(reader, state.role, "vote")}
      />
      <div className="sm-card-wrap">
        {open ? (
          <Track versions={versions} argumentId={argument.id} writer={writer} state={state} session={session} opening={opening} onAt={setAt} />
        ) : (
          <>
            <Stack count={count} onUnfold={onToggle} />
            <Card version={lead} opening={opening} />
          </>
        )}
      </div>
    </section>
  );
}

/** "Version deleted. Undo", where the deletion was, for ten seconds. The status line announces it. */
function UndoBar({ held, onUndo }: { held: Held; onUndo(): void }) {
  return (
    <div className="sm-undo">
      <span>{held.label}</span>
      <button type="button" className="sm-link-button cursor-interaction" onClick={onUndo}>
        Undo
      </button>
    </div>
  );
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
