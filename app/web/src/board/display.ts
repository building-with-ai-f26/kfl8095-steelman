// What each part of the board shows, read from what the reader holds. No
// decisions about order live here: the order on screen is `view.shown`,
// which only the shared rules change.

import type { ArgumentRow, OptionRow, QueuedAction, ReaderView, VersionRow } from "@steelman/shared";

export type Vote = 1 | -1 | null;

/** The options with a column, left to right. */
export function columns(view: ReaderView): OptionRow[] {
  return Object.keys(view.shown.arguments)
    .map((id) => view.rows.options[id])
    .filter((option): option is OptionRow => option !== undefined)
    .sort((a, b) => a.position - b.position);
}

export function isLive(argument: ArgumentRow | undefined): boolean {
  return argument !== undefined && !argument.deleted && argument.mergedInto === null;
}

export function isLiveVersion(version: VersionRow | undefined): boolean {
  return version !== undefined && !version.deleted && !version.hidden;
}

/** The reader's own importance vote and the count with it, counting a choice not yet sent or not yet back. */
export function importanceShown(argument: ArgumentRow, mine: readonly QueuedAction[]): { vote: Vote; score: number } {
  const queued = mine.find((action) => action.kind === "importance" && action.argumentId === argument.id);
  if (!queued || queued.kind !== "importance") return { vote: argument.myVote, score: argument.importance };
  return { vote: queued.value, score: argument.importance - (argument.myVote ?? 0) + (queued.value ?? 0) };
}

export function articulationShown(version: VersionRow, mine: readonly QueuedAction[]): { vote: Vote; score: number } {
  const queued = mine.find((action) => action.kind === "articulation" && action.versionId === version.id);
  if (!queued || queued.kind !== "articulation") return { vote: version.myVote, score: version.articulation };
  return { vote: queued.value, score: version.articulation - (version.myVote ?? 0) + (queued.value ?? 0) };
}

/** As the prototype labels a row: its leading wording, cut at 60 characters. */
export function short(wording: string): string {
  return wording.length > 60 ? `${wording.slice(0, 57)}…` : wording;
}
