// The browser's sync rules (plans/architecture.md §3), as pure functions:
// what a reader holds, how changed rows are merged into it, and what Update
// does. The board screen (M0-6) uses them, and so does the simulation
// (M0-5), which is how the riskiest part gets tested without a browser.
//
// A reader holds the rows as of change `seq`, the newest published order it
// has been sent, and what is on screen. What's on screen is held still:
// counts update in place, new things join the end, deleted things stay,
// marked, and nothing moves until the reader presses Update.

import type { ArgumentRow, BoardChanges, BoardSnapshot, OptionRow, SourceRow, VersionRow } from "./api.ts";
import type { BoardOrder } from "./order.ts";
import { staleCount } from "./stale.ts";

export interface BoardRows {
  options: Record<string, OptionRow>;
  arguments: Record<string, ArgumentRow>;
  versions: Record<string, VersionRow>;
  sources: Record<string, SourceRow>;
}

export interface ReaderView {
  /** The change number the reader's rows are as of. */
  seq: number;
  rows: BoardRows;
  /** The newest shared order the reader has been sent. */
  published: BoardOrder;
  /** What's on screen, in the order it's drawn. */
  shown: BoardOrder;
}

/** What a reader sees on opening a board. */
export function openView(snapshot: BoardSnapshot): ReaderView {
  const rows = merge(emptyRows(), snapshot);
  return { seq: snapshot.board.seq, rows, published: snapshot.order, shown: layout(rows, snapshot.order) };
}

/**
 * Merges an answer to "changes after S" into what the reader holds. Each row
 * sent replaces the one held; nothing on screen moves. An answer older than
 * what the reader already holds changes nothing, and so does one received
 * twice.
 */
export function receive(view: ReaderView, changes: BoardChanges): ReaderView {
  if (changes.seq < view.seq) return view;
  const rows = merge(view.rows, changes);
  const published = changes.order ?? view.published;
  return { seq: changes.seq, rows, published, shown: holdStill(view.shown, rows) };
}

/** Update: draws the board in the newest order the reader holds, without what was deleted. */
export function pressUpdate(view: ReaderView): ReaderView {
  return { ...view, shown: layout(view.rows, view.published) };
}

/**
 * What's on screen without the reader's own deletions (A-06). Others'
 * deletions stay, marked, until Update; one's own leaves at once, unmarked:
 * held for Undo, on its way, or back. An argument with no live wording left
 * on screen goes with it. Nothing else moves.
 */
export function leaveOut(view: ReaderView, versionIds: readonly string[]): ReaderView {
  if (versionIds.length === 0) return view;
  const gone = new Set(versionIds);
  const shown: BoardOrder = { arguments: {}, versions: {} };
  const emptied = new Set<string>();
  for (const [argumentId, ids] of Object.entries(view.shown.versions)) {
    const kept = ids.filter((id) => !gone.has(id));
    if (kept.length < ids.length && !kept.some((id) => isLiveVersion(view.rows.versions[id]))) emptied.add(argumentId);
    else shown.versions[argumentId] = kept;
  }
  for (const [optionId, ids] of Object.entries(view.shown.arguments)) shown.arguments[optionId] = ids.filter((id) => !emptied.has(id));
  return { ...view, shown };
}

/** The number on the pill: moves to the newest order, plus each change still marked in place. */
export function pillCount(view: ReaderView): number {
  // The shared order leaves out what a moderator hid, which keeps its place on screen (M2-4): it isn't a move.
  const kept = (id: string) => view.rows.versions[id]?.hidden === true && !view.rows.versions[id]?.deleted;
  const versions = Object.fromEntries(Object.entries(view.shown.versions).map(([argumentId, ids]) => [argumentId, ids.filter((id) => !kept(id))]));
  return staleCount({ ...view.shown, versions }, view.published, markedChanges(view));
}

/**
 * Things others removed that the reader still sees, marked, until Update. An
 * argument deleted along with its wordings counts once, and so does one
 * combined into another; a wording separated out counts once.
 */
function markedChanges(view: ReaderView): number {
  let marked = 0;
  for (const [optionId, argumentIds] of Object.entries(view.shown.arguments)) {
    if (!view.rows.options[optionId]) continue;
    for (const id of argumentIds) if (!isLive(view.rows.arguments[id])) marked++;
  }
  for (const [argumentId, versionIds] of Object.entries(view.shown.versions)) {
    if (!isLive(view.rows.arguments[argumentId])) continue;
    // A wording a moderator hid keeps its place after Update too (layout), so it isn't waiting for one (M2-4).
    for (const id of versionIds) {
      const version = view.rows.versions[id];
      if (!isLiveVersion(version) && !(version?.hidden && !version.deleted)) marked++;
      // A wording someone separated into its own argument, still shown where it was (M3a-6).
      else if (version && version.argumentId !== argumentId) marked++;
    }
  }
  return marked;
}

const isLive = (argument: ArgumentRow | undefined) => argument !== undefined && !argument.deleted && argument.mergedInto === null;
const isLiveVersion = (version: VersionRow | undefined) => version !== undefined && !version.deleted && !version.hidden;
const byAdded = (a: { createdSeq: number; id: string }, b: { createdSeq: number; id: string }) => a.createdSeq - b.createdSeq || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function emptyRows(): BoardRows {
  return { options: {}, arguments: {}, versions: {}, sources: {} };
}

function merge(rows: BoardRows, sent: { options: OptionRow[]; arguments: ArgumentRow[]; versions: VersionRow[]; sources: SourceRow[] }): BoardRows {
  const byId = <T extends { id: string }>(held: Record<string, T>, rowsSent: T[]) => ({ ...held, ...Object.fromEntries(rowsSent.map((row) => [row.id, row])) });
  return {
    options: byId(rows.options, sent.options),
    arguments: byId(rows.arguments, sent.arguments),
    versions: byId(rows.versions, sent.versions),
    sources: byId(rows.sources, sent.sources),
  };
}

/** The board as a newly arrived reader draws it: the order first, then anything it doesn't have yet, in the order added. */
function layout(rows: BoardRows, order: BoardOrder): BoardOrder {
  const shown: BoardOrder = { arguments: {}, versions: {} };
  const options = Object.values(rows.options).filter((option) => !option.deleted).sort((a, b) => a.position - b.position);
  for (const option of options) {
    const live = Object.values(rows.arguments).filter((argument) => argument.optionId === option.id && isLive(argument));
    const argumentIds = inOrder(order.arguments[option.id] ?? [], live);
    shown.arguments[option.id] = argumentIds;
    for (const argumentId of argumentIds) {
      const versions = Object.values(rows.versions).filter((version) => version.argumentId === argumentId && isLiveVersion(version));
      // A wording a moderator hid keeps a place, after the live ones (the shared order leaves it out), as "Removed by a
      // moderator · Spam": a link to it lands there, and an Editor finds it there to restore it (M2-4, invariant 6).
      const hidden = Object.values(rows.versions).filter((version) => version.argumentId === argumentId && version.hidden && !version.deleted).sort(byAdded);
      shown.versions[argumentId] = [...inOrder(order.versions[argumentId] ?? [], versions), ...hidden.map((version) => version.id)];
    }
  }
  return shown;
}

/** The ordered IDs that are still live, then the live ones the order doesn't have, in the order added. */
function inOrder(ordered: string[], live: { id: string; createdSeq: number }[]): string[] {
  const liveIds = new Set(live.map((item) => item.id));
  const first = ordered.filter((id) => liveIds.has(id));
  const placed = new Set(first);
  return [...first, ...live.filter((item) => !placed.has(item.id)).sort(byAdded).map((item) => item.id)];
}

/**
 * What's on screen after new rows arrive: everything stays where it is, and
 * new things join the end. A deleted option leaves at once (A-07): only an
 * empty one can be deleted, so nothing else moves, and any of its arguments
 * still shown, marked deleted, go with it.
 */
function holdStill(shown: BoardOrder, rows: BoardRows): BoardOrder {
  const next: BoardOrder = { arguments: { ...shown.arguments }, versions: { ...shown.versions } };
  for (const [optionId, argumentIds] of Object.entries(shown.arguments)) {
    if (!rows.options[optionId]?.deleted) continue;
    delete next.arguments[optionId];
    for (const argumentId of argumentIds) delete next.versions[argumentId];
  }
  // A wording that moved, by a combine or a separation (M3a-6), stays where the reader sees it until Update; it doesn't
  // also join the argument it went into. A new argument made only of wordings shown elsewhere waits for Update too.
  const shownAnywhere = new Set(Object.values(next.versions).flat());
  const waiting = (argumentId: string) => {
    const wordings = Object.values(rows.versions).filter((version) => version.argumentId === argumentId && isLiveVersion(version));
    return wordings.length > 0 && wordings.every((version) => shownAnywhere.has(version.id));
  };
  const options = Object.values(rows.options).filter((option) => !option.deleted).sort((a, b) => a.position - b.position);
  for (const option of options) {
    const held = next.arguments[option.id] ?? [];
    const added = Object.values(rows.arguments)
      .filter((argument) => argument.optionId === option.id && isLive(argument) && !held.includes(argument.id) && !waiting(argument.id))
      .sort(byAdded);
    next.arguments[option.id] = [...held, ...added.map((argument) => argument.id)];
  }
  for (const argumentIds of Object.values(next.arguments)) {
    for (const argumentId of argumentIds) {
      if (!isLive(rows.arguments[argumentId]) && next.versions[argumentId] !== undefined) continue;
      const held = next.versions[argumentId] ?? [];
      const added = Object.values(rows.versions)
        .filter((version) => version.argumentId === argumentId && isLiveVersion(version) && !held.includes(version.id) && !shownAnywhere.has(version.id))
        .sort(byAdded);
      next.versions[argumentId] = [...held, ...added.map((version) => version.id)];
    }
  }
  return next;
}

/**
 * The reader's own combine or separation, shown at once (M3a-7), as their own
 * deletion is: the wording leaves where it's shown and joins its argument
 * now, at the place the newest shared order gives it; that argument joins its
 * option the same way if it isn't shown yet. An argument left with nothing
 * shown leaves too. Nothing else moves.
 */
export function showMoved(view: ReaderView, versionId: string): ReaderView {
  const version = view.rows.versions[versionId];
  const argument = version ? view.rows.arguments[version.argumentId] : undefined;
  if (!version || !argument) return view;
  const versions: Record<string, string[]> = {};
  const emptied = new Set<string>();
  for (const [argumentId, ids] of Object.entries(view.shown.versions)) {
    const kept = ids.filter((id) => id !== versionId);
    // The argument it left goes too when it has nothing left to show, or was combined away: a wording still shown
    // there, marked, that someone deleted or moved, doesn't keep it (the service decides by the rows too).
    const left = kept.length < ids.length && argumentId !== argument.id;
    if (left && (kept.length === 0 || view.rows.arguments[argumentId]?.mergedInto)) emptied.add(argumentId);
    else versions[argumentId] = kept;
  }
  versions[argument.id] = insertInOrder(versions[argument.id] ?? [], versionId, view.published.versions[argument.id]);
  const args: Record<string, string[]> = {};
  for (const [optionId, ids] of Object.entries(view.shown.arguments)) args[optionId] = ids.filter((id) => !emptied.has(id));
  const column = args[argument.optionId] ?? [];
  if (!column.includes(argument.id)) args[argument.optionId] = insertInOrder(column, argument.id, view.published.arguments[argument.optionId]);
  return { ...view, shown: { arguments: args, versions } };
}

/**
 * Undo of the reader's own combine or separation (M3a-7): the board as it was
 * on screen before it, with anything new since added as a poll adds it.
 */
export function putBack(view: ReaderView, shown: BoardOrder): ReaderView {
  return { ...view, shown: holdStill(shown, view.rows) };
}

/** Puts `id` among `ids` where `order` ranks it, or at the end when it doesn't. */
function insertInOrder(ids: string[], id: string, order: readonly string[] | undefined): string[] {
  const rank = order?.indexOf(id) ?? -1;
  if (rank < 0) return [...ids, id];
  const at = ids.findIndex((other) => order!.indexOf(other) > rank);
  return at < 0 ? [...ids, id] : [...ids.slice(0, at), id, ...ids.slice(at)];
}
