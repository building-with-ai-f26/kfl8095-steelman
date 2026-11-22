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

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { OPTIONS_PER_BOARD, can, cleanText, leaveOut } from "@steelman/shared";
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
import { Tour } from "./Tour.tsx";
import { tourSteps } from "./tour-steps.ts";
import type { TourStep } from "./tour-steps.ts";
import { markTourSeen, readTour } from "../api.ts";
import type { DraftText } from "./Forms.tsx";
import { Track, TrackAxis } from "./Track.tsx";
import { VoteControl } from "./Vote.tsx";
import { WHY, columns, importanceShown, isLive, isLiveVersion, moderationItem, reportItem, short, versionMenu, whyNot } from "./display.ts";
import { BoardSession, leaveOptionsOut } from "./session.ts";
import type { Held, Restructured, SessionState } from "./session.ts";
import { rememberPlace } from "../places.ts";
import { OptionMenu } from "./OptionMenu.tsx";
import { History } from "./History.tsx";
import { RestructureDialog } from "./Restructure.tsx";
import type { Asking } from "./Restructure.tsx";

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
  // The reader's own deletions are off the screen at once: wordings, and options (M3a-2).
  const view = useMemo(() => (state.view ? leaveOptionsOut(leaveOut(state.view, state.leftOut), state.optionsLeftOut) : null), [state.view, state.leftOut, state.optionsLeftOut]);

  if (state.phase === "missing") return <NotFound />;
  if (state.phase === "no_access")
    return (
      <main className="sm-meta sm-dead-end">
        <p>You don’t have access to this steelman.</p>
        <a className="sm-link-button cursor-interaction" href="/">
          Go to Your steelmen
        </a>
      </main>
    );
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
  const [chosenSide, setSide] = useState(arrival.side ?? options[0]?.id);
  // The side shown on a phone: the one chosen, or the first while that one is deleted (M3a-2).
  const side = options.some((option) => option.id === chosenSide) ? chosenSide : options[0]?.id;
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
  // Options (M3a-2): an Editor or the Owner may add, rename, and delete them.
  const mayStructure = can(reader, state.role, "structure", { closed: false }) === null;
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
    (addButton.current ?? document.querySelector<HTMLElement>(".sm-column-tools button"))?.focus();
  }, [state.optionGone]);
  const undoOptionDelete = () => {
    const gone = state.optionGone;
    session.undoOptionDelete();
    if (gone && zoom !== "case") setFocusTo(`#sm-col-${CSS.escape(gone.id)} .sm-column-tools button`);
  };
  /** Brings an argument into view, with the cursor on its leading wording: from a row combined into it. */
  const goTo = (argumentId: string) => {
    const optionId = view.rows.arguments[argumentId]?.optionId;
    if (optionId) setSide(optionId);
    document.querySelector(`[data-node="${CSS.escape(argumentId)}"]`)?.scrollIntoView({ block: "center", inline: "nearest" });
    setFocusTo(`[data-node="${CSS.escape(argumentId)}"] .sm-claim-button`);
  };
  const cardControl = (versionId: string, control: "claim" | "menu") => `[data-card="${CSS.escape(versionId)}"] .${control === "claim" ? "sm-claim-button" : "sm-card-menu-button"}`;
  /** The row's wordings that are still there. */
  /**
   * Whether deleting this wording deletes its argument: only when no other wording is left, counting one a moderator
   * hid, which keeps the argument on the service (writing.ts) and can be restored (M2-4).
   */
  /**
   * Whether it's its argument's last wording on the service, which decides whether combining makes two arguments one
   * and whether it can be separated (M3a-7): from the rows, not the screen, which may still show a wording someone
   * moved or deleted. A hidden wording counts, as on the service.
   */
  const lastOnService = (version: VersionRow) => !Object.values(view.rows.versions).some((v) => v.argumentId === version.argumentId && v.id !== version.id && !v.deleted);
  const isLast = (version: VersionRow) =>
    (view.shown.versions[version.argumentId] ?? []).filter((id) => id !== version.id && !view.rows.versions[id]?.deleted && (view.rows.versions[id]?.hidden || isLiveVersion(view.rows.versions[id]))).length === 0;

  // When the owner lowers the reader's role below writing, an open draft or edit closes, as the prototype's role
  // switch does, so they don't go on typing something the service would refuse (M2-2b). Kept drafts stay kept.
  const mayWrite = whyNot(reader, state.role, "add") === null;
  useEffect(() => {
    if (!mayWrite && writing !== null) {
      setWriting(null);
      session.announce("Your role on this board changed: you can no longer write here.");
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
  /** The wording an argument leads with on screen, for "Combine here" and the dialog. */
  const leadOf = (argumentId: string) => view.rows.versions[(view.shown.versions[argumentId] ?? [])[0] ?? ""]?.wording ?? "";
  const askCombine = (from: Moving, intoId: string) => {
    setMoving(null);
    setAsking({ kind: "combine", versionId: from.versionId, wording: from.wording, intoId, intoWording: leadOf(intoId), last: from.last, returnTo: from.returnTo });
  };
  const askSeparate = (from: Moving) => setAsking({ kind: "separate", versionId: from.versionId, wording: from.wording, returnTo: from.returnTo });
  const cancelMove = () => {
    if (!moving) return;
    setMoving(null);
    setFocusTo(moving.returnTo);
    session.announce("Combining was cancelled.");
  };
  useEffect(() => {
    if (!moving) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelMove();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moving]);
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
        ? ["copyLink", ...moderationItem(version, reader, state.role)]
        : [...versionMenu(version, reader, state.role, isLast(version), { others: others(version), last: lastOnService(version) }), ...reportItem(version, reader, state.role), ...moderationItem(version, reader, state.role)],
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
      const lead = shownInto ? leadOf(into) : "";
      return (
        <>
          <p className="sm-removed-note">
            <Icon name="merge" />
            <span>{lead ? `This wording was combined with “${short(lead)}”.` : "This wording moved to another argument."}</span>
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
      reportSource: (sourceId) => session.reportSource(sourceId),
      clearSourceReport: (sourceId, own) => session.clearSourceReport(sourceId, own),
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
    session.announce(`${editing ? "Your changes were discarded. " : ""}Strongest case: each option’s most important arguments, in their best wording. Choose one to open it on the board.`);
  }, [zoom, session, writing]);
  /** Choosing an argument in Strongest case opens its wording on the board, its row unfolded if the wording doesn't lead it there. */
  const openFromCase = (item: CaseItem) => showVersion(item.argumentId, item.versionId);
  /** Opens a wording on the board, from Strongest case or History: its row unfolded if it isn't the leading one, and its card open. */
  const showVersion = (argumentId: string, versionId: string) => {
    const at = (view.shown.versions[argumentId] ?? []).indexOf(versionId);
    if (writing?.kind === "wording") setWriting(null);
    setOpen(at > 0 ? argumentId : null);
    setExpanded(versionId);
    setSide(view.rows.arguments[argumentId]!.optionId);
    setArrived(versionId);
    setFocusTo(cardControl(versionId, "claim"));
    onZoom("read");
  };

  // History (M3a-4, J-03): a panel beside the board, opened from the question header.
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyButton = useRef<HTMLButtonElement>(null);
  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    session.announce("History closed.");
    historyButton.current?.focus();
  }, [session]);
  const openFromHistory = (versionId: string) => {
    const version = view.rows.versions[versionId];
    if (!version) return;
    // Where the panel covers the board, it closes, so the wording can be seen.
    if (window.matchMedia("(max-width: 1199px)").matches) setHistoryOpen(false);
    showVersion(version.argumentId, versionId);
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
      <div className={`sm-scene${historyOpen ? " sm-with-drawer" : ""}`}>
        <section className="sm-head" aria-label="The question">
          <div className="sm-head-tools">
            <button
              ref={historyButton}
              type="button"
              className="sm-head-button sm-history-button cursor-interaction"
              aria-expanded={historyOpen}
              aria-controls="sm-history"
              onClick={() => {
                if (historyOpen) return closeHistory();
                setHistoryOpen(true);
                session.announce("History is open.");
              }}
            >
              <Icon name="history" />
              <span>History</span>
            </button>
          </div>
          <h1 ref={question} tabIndex={-1}>
            {state.question}
          </h1>
          {state.access && state.role ? <Sharing access={state.access} role={state.role} me={reader} session={session} /> : null}
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
            session={session}
            logSeq={state.logSeq}
            heldOptions={state.optionsLeftOut.length}
            onOpen={openFromHistory}
            onClose={closeHistory}
          />
        ) : null}
        <main id="sm-content">
          {zoom === "case" ? (
            <div className="sm-board" style={{ "--sm-cols": boardColumns(options, undefined) } as React.CSSProperties}>
              {state.undo && (
                <div className="sm-board-undo">
                  <UndoBar held={state.undo} onUndo={undo} />
                </div>
              )}
              {state.optionGone && <OptionUndoBar onUndo={undoOptionDelete} />}
              <StrongestCase view={view} leftOut={state.leftOut} mine={state.mine} onOpen={openFromCase} />
            </div>
          ) : (
            <div className="sm-board" style={{ "--sm-cols": boardColumns(options, openOption, addColumn ? (naming ? "naming" : "add") : null) } as React.CSSProperties}>
              {state.optionGone && <OptionUndoBar onUndo={undoOptionDelete} />}
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
                  deleteBlocked={options.length <= OPTIONS_PER_BOARD.min ? "A question needs at least two options." : (view.shown.arguments[option.id] ?? []).some((id) => isLive(view.rows.arguments[id])) ? "Move or delete its arguments first." : null}
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
function boardColumns(options: OptionRow[], wide: string | undefined, extra: "add" | "naming" | null = null): string {
  const rest = wide ? `minmax(${options.length === 2 ? 260 : 200}px,1fr)` : "minmax(0,1fr)";
  const columns = options.map((option) => (option.id === wide ? "minmax(0,2.6fr)" : rest)).join(" 32px ");
  // After the last option, the prototype's dashed "Add an option", or the new option being named (M3a-2).
  return extra === "add" ? `${columns} 20px max-content` : extra === "naming" ? `${columns} 32px ${rest}` : columns;
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
  const movedBar = moved ? <PlainUndoBar label={moved.label} onUndo={structure.undo} /> : null;
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
        {first && ranked && (
          <div className="sm-col-vaxis">
            <Axis kind="v" start="more important" end="less important" />
          </div>
        )}
        <OptionHead option={option} mayStructure={mayStructure} deleteBlocked={deleteBlocked} session={session} />
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
        {held && barAfter === null && <UndoBar held={held} onUndo={onUndo} />}
        {moved && movedAfter === null && movedBar}
        {argumentIds.map((id) => {
          const argument = view.rows.arguments[id];
          return argument ? (
            <Fragment key={id}>
              <Row argument={argument} open={open === id} onToggle={() => onToggle(id)} writer={writer} opening={opening} view={view} state={state} session={session} structure={structure} />
              {held && barAfter === id && <UndoBar held={held} onUndo={onUndo} />}
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
          blocked={whyNot(reader, state.role, "add")}
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
  if (!lead) return null;
  const label = short(lead.wording ?? (lead.hidden && !lead.deleted ? "Removed by a moderator" : `Deleted by ${lead.authorName}`));
  const { vote, score } = importanceShown(argument, state.mine);
  const count = versionIds.length;
  const [at, setAt] = useState(0);
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
        blocked={whyNot(reader, state.role, "vote")}
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
        {/* Asked again after a combine, when the reader's two votes disagreed (PRD §5), until they vote: the prototype's note. */}
        {argument.askedAgain && vote === null ? (
          <p className="sm-vote-again" role="note">
            <Icon name="rotate-ccw" />
            <span>Your votes on the two arguments disagreed, so vote again.</span>
          </p>
        ) : null}
        {target && structure.picking ? (
          <button type="button" className="sm-move-here cursor-interaction" aria-label={`Combine here: same point as “${label}”`} onClick={() => structure.pick(argument.id)}>
            <span>
              <Icon name="merge" />
              Combine here
            </span>
          </button>
        ) : null}
      </div>
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
  const lead = view.rows.versions[(view.shown.versions[into] ?? [])[0] ?? ""]?.wording ?? null;
  return (
    <section className="sm-idea sm-merged" data-node={argument.id} aria-label={label}>
      <div className="sm-card-wrap">
        <article className="sm-card sm-removed sm-gone">
          <p className="sm-removed-note">
            <Icon name="merge" />
            <span>{lead ? `This was combined with “${short(lead)}”.` : "This was combined with another argument."}</span>
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

/** Where an argument's wordings are now: itself, or the argument it was combined into, followed through later combines. */
function finalArgument(view: ReaderView, argumentId: string): string {
  let id = argumentId;
  for (let hops = 0; hops < 50; hops++) {
    const next = view.rows.arguments[id]?.mergedInto;
    if (!next) return id;
    id = next;
  }
  return id;
}

/**
 * An option's header (M3a-2, A-07): its name, and for an Editor or the Owner
 * the prototype's ⋯, "Options for …", with Rename option and Delete option.
 * Renaming happens in the header itself.
 */
function OptionHead({ option, mayStructure, deleteBlocked, session }: { option: OptionRow; mayStructure: boolean; deleteBlocked: string | null; session: BoardSession }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const back = () => window.setTimeout(() => trigger.current?.focus());
  const close = useCallback(() => setMenuOpen(false), []);
  return (
    <div className="sm-column-head">
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
      {mayStructure && !renaming && (
        <div className="sm-column-tools">
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
          {menuOpen && (
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

/** "You deleted the option. Undo", above the board, for ten seconds (M3a-2). The status line announces it. */
function OptionUndoBar({ onUndo }: { onUndo(): void }) {
  return (
    <div className="sm-board-undo sm-option-undo">
      <div className="sm-undo">
        <span>You deleted the option.</span>
        <button type="button" className="sm-link-button cursor-interaction" onClick={onUndo}>
          Undo
        </button>
      </div>
    </div>
  );
}

/** "You combined the arguments. Undo", under the row it joined, for ten seconds (M3a-7). The status line announces it. */
function PlainUndoBar({ label, onUndo }: { label: string; onUndo(): void }) {
  return (
    <div className="sm-undo">
      <span>{label}</span>
      <button type="button" className="sm-link-button cursor-interaction" onClick={onUndo}>
        Undo
      </button>
    </div>
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
