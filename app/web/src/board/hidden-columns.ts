// Hidden columns (M3d-6, A-08), ported from the prototype's isHidden,
// firstVisible and its hiddenCols, keyed by colKey (board:option)
// (docs/prototype/source/steelman-refined.html). Hiding is a way of reading:
// which columns a reader has hidden is kept for each board in this browser's
// localStorage, as the prototype keeps it, and it never reaches the service
// or PostHog. Every read and write is inside try and catch, so blocked
// storage (a private window, cleared or blocked site data) means nothing is
// hidden, and the board still works.

import type { OptionRow, ReaderView } from "@steelman/shared";
import { isLive } from "./display.ts";

const key = (board: string) => `steelman-hidden-columns:${board}`;

/** The options saved as hidden on this board, in this browser: none when storage is blocked or holds something else. */
export function readHidden(board: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(board)) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Saves the options hidden on this board, or forgets the board once none is. */
export function saveHidden(board: string, ids: readonly string[]): void {
  try {
    if (ids.length) localStorage.setItem(key(board), JSON.stringify(ids));
    else localStorage.removeItem(key(board));
  } catch {
    // Storage blocked: the columns are hidden until the page is left.
  }
}

/**
 * The options hidden on the board drawn now, as the prototype's isHidden decides it: an option saved as hidden that is
 * on the board, and only while another option on it shows, so at least one column always shows. At 640 px and
 * narrower the board shows one side at a time, so nothing is hidden there; what's saved stays saved for a wider window.
 */
export function hiddenOf(options: readonly OptionRow[], saved: readonly string[], narrow: boolean): Set<string> {
  if (narrow) return new Set();
  const marked = new Set(saved);
  return new Set(options.filter((option) => marked.has(option.id) && options.some((other) => other.id !== option.id && !marked.has(other.id))).map((option) => option.id));
}

/** The first option, by position, that isn't hidden: its column carries the importance axis and the first column's styling. */
export function firstVisible(options: readonly OptionRow[], hidden: ReadonlySet<string>): string | undefined {
  return [...options].sort((a, b) => a.position - b.position).find((option) => !hidden.has(option.id))?.id;
}

/** How many arguments an option's strip counts: those on the board neither deleted nor combined, as the list counts them. */
export function argumentCount(view: ReaderView, optionId: string): number {
  return (view.shown.arguments[optionId] ?? []).filter((id) => isLive(view.rows.arguments[id])).length;
}

export function argumentsLabel(n: number): string {
  return `${n} ${n === 1 ? "argument" : "arguments"}`;
}
