// The rows on Your account enter on the tokens (M3d-11, L-04, M-15): each
// rises 4 px into place on --sm-medium and --sm-ease, the rows that arrive
// together about 20 ms apart in reading order, as the board's moves are
// staggered (motion.ts). A row that arrives later (the tour's, once the list
// has been read) enters on its own. The rows rise without fading, so their
// words are never drawn half there, which also keeps an accessibility scan
// made as the page opens from reading a faded colour. The rows keep their
// layout, a key, its value, and its action, as GOV.UK's summary list sets
// them (checked Nov 25); the rise is the prototype's entrance for a panel,
// without its fade. Everything goes through play(), so nothing moves
// under reduced motion, and nothing holds its end, so each row ends where it
// is drawn without motion.

import { useLayoutEffect } from "react";
import type { RefObject } from "react";
import { MOST_TURNS, STAGGER_MS, play } from "./board/motion.ts";

interface Arrivals {
  /** The rows drawn in this render that haven't entered yet. */
  rows: Element[];
  /** The turn the first of them takes. */
  first: number;
}

/** Your account's rows. */
const accountRows: Arrivals = { rows: [], first: 0 };
/**
 * Your statistics' lines (L-09, M3d-14), staggered among themselves from one turn in, so they follow Username, which
 * enters at once. They keep a turn of their own so the rows above and below keep theirs.
 */
const statisticLines: Arrivals = { rows: [], first: 1 };
/** Every row that has entered, so a row drawn twice (development's StrictMode) enters once. */
const entered = new WeakSet<Element>();

function enterTogether(arrivals: Arrivals): void {
  const rows = arrivals.rows.filter((row) => row.isConnected).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  arrivals.rows = [];
  rows.forEach((row, turn) =>
    play(row, [{ translate: "0 4px" }, { translate: "0 0" }], { delay: Math.min(arrivals.first + turn, MOST_TURNS) * STAGGER_MS, fill: "backwards" }),
  );
}

function arrive(arrivals: Arrivals, element: HTMLElement | null): void {
  if (!element || entered.has(element)) return;
  entered.add(element);
  // Every row React draws in one go notes itself before this runs, so they enter together.
  if (!arrivals.rows.length) queueMicrotask(() => enterTogether(arrivals));
  arrivals.rows.push(element);
}

/**
 * A row of Your account rises into place as it's first drawn, after the rows above it drawn at the same time. It looks
 * after every render, since a component may draw its row only once its data has arrived.
 */
export function useRowEntrance(row: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => arrive(accountRows, row.current));
}

/** A line of Your statistics rises into place the same way, after the lines above it. */
export function useStatisticEntrance(line: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => arrive(statisticLines, line.current));
}
