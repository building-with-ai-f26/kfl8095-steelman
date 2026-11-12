// The number on the pill ("3 changes · Update"): how far what a reader has on
// screen is from the newest shared order (B-05, M-02).
//
// A reader's rows never move by themselves. When other people's votes change
// the shared order, the browser keeps the new order aside and shows this
// count; pressing Update applies it (plans/architecture.md §3). This is the
// prototype's staleCount().

import type { BoardOrder } from "./order.ts";

/**
 * The fewest rows that have to move to turn the order on screen into the
 * target order.
 *
 * Counting every row whose position changed would overstate it: when three
 * rows jump to the top, the nine below them all shift down, but only three
 * moved. So this finds the longest run of rows that are already in the right
 * order relative to each other, and counts the rest.
 *
 * Rows that are in only one of the two lists aren't moves: a new row the
 * shared order hasn't ranked yet, or a deleted row still shown, marked.
 */
export function fewestMoves(shown: readonly string[], target: readonly string[]): number {
  const targetPlace = new Map(target.map((id, index) => [id, index]));
  const places = shown.map((id) => targetPlace.get(id)).filter((place) => place !== undefined);
  return places.length - longestRisingRun(places);
}

/**
 * The length of the longest run of numbers, not necessarily next to each
 * other, that goes up from left to right. (The "longest increasing
 * subsequence", by the standard method: `ends[n]` is the smallest number
 * that a rising run of length n + 1 can end on.)
 */
function longestRisingRun(numbers: readonly number[]): number {
  const ends: number[] = [];
  for (const number of numbers) {
    let low = 0;
    let high = ends.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (ends[middle]! < number) low = middle + 1;
      else high = middle;
    }
    ends[low] = number;
  }
  return ends.length;
}

/**
 * The number on the pill.
 *
 * @param shown The order the reader has on screen.
 * @param published The newest shared order the browser has been sent.
 * @param markedChanges How many structural changes by other people are still
 *   shown in place, marked, waiting for Update: an argument combined away, a
 *   wording separated out, a wording deleted or hidden.
 */
export function staleCount(shown: BoardOrder, published: BoardOrder, markedChanges: number): number {
  if (!Number.isInteger(markedChanges) || markedChanges < 0) {
    throw new Error(`The count of marked changes must be a whole number from zero up, got ${markedChanges}`);
  }
  const movesIn = (onScreen: Record<string, string[]>, target: Record<string, string[]>) =>
    Object.entries(onScreen).reduce((sum, [id, list]) => sum + fewestMoves(list, target[id] ?? []), 0);

  return movesIn(shown.arguments, published.arguments) + movesIn(shown.versions, published.versions) + markedChanges;
}
