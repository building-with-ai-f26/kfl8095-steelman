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

/** The number on the pill: moves to the newest order, plus each change still marked in place. */
export function pillCount(view: ReaderView): number {
  return staleCount(view.shown, view.published, markedChanges(view));
}

/**
 * Things others removed that the reader still sees, marked, until Update. An
 * argument deleted along with its wordings counts once.
 */
function markedChanges(view: ReaderView): number {
  let marked = 0;
  for (const [optionId, argumentIds] of Object.entries(view.shown.arguments)) {
    if (!view.rows.options[optionId]) continue;
    for (const id of argumentIds) if (!isLive(view.rows.arguments[id])) marked++;
  }
  for (const [argumentId, versionIds] of Object.entries(view.shown.versions)) {
    if (!isLive(view.rows.arguments[argumentId])) continue;
    for (const id of versionIds) if (!isLiveVersion(view.rows.versions[id])) marked++;
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
      shown.versions[argumentId] = inOrder(order.versions[argumentId] ?? [], versions);
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

/** What's on screen after new rows arrive: everything stays where it is, and new things join the end. */
function holdStill(shown: BoardOrder, rows: BoardRows): BoardOrder {
  const next: BoardOrder = { arguments: { ...shown.arguments }, versions: { ...shown.versions } };
  const options = Object.values(rows.options).filter((option) => !option.deleted).sort((a, b) => a.position - b.position);
  for (const option of options) {
    const held = next.arguments[option.id] ?? [];
    const added = Object.values(rows.arguments).filter((argument) => argument.optionId === option.id && isLive(argument) && !held.includes(argument.id)).sort(byAdded);
    next.arguments[option.id] = [...held, ...added.map((argument) => argument.id)];
  }
  for (const argumentIds of Object.values(next.arguments)) {
    for (const argumentId of argumentIds) {
      if (!isLive(rows.arguments[argumentId]) && next.versions[argumentId] !== undefined) continue;
      const held = next.versions[argumentId] ?? [];
      const added = Object.values(rows.versions).filter((version) => version.argumentId === argumentId && isLiveVersion(version) && !held.includes(version.id)).sort(byAdded);
      next.versions[argumentId] = [...held, ...added.map((version) => version.id)];
    }
  }
  return next;
}
