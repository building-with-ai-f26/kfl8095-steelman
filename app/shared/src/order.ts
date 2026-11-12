// The shared order: the one order of arguments and wordings that everybody's
// votes produce (B-05). From PRD §7 and plans/architecture.md §3:
//
//   "Assessed items sort by their respective net scores. Ties preserve the
//    existing order. Items with no active assessments remain at the end",
//   in the order they were added.
//
// Because ties keep the previous order, the order is not a pure function of
// the votes alone: it also needs the order before it. That is why the server
// saves each one it calculates.

/** One argument (ranked by importance) or one wording (ranked by articulation). */
export interface Ranked {
  id: string;
  /** The sum of the votes on it: each is +1 or −1. */
  score: number;
  /** How many people have a vote on it. Zero means nobody has voted. */
  voters: number;
}

/**
 * The next order of one list.
 *
 * @param previous The order before this one. Items it doesn't mention count
 *   as coming after the ones it does.
 * @param items Everything in the list now, in the order it was added. Leave
 *   out what is deleted, hidden, or combined away.
 * @returns The IDs, best first.
 */
export function nextOrder(previous: readonly string[], items: readonly Ranked[]): string[] {
  const place = new Map(previous.map((id, index) => [id, index]));
  const placeOf = (item: Ranked) => place.get(item.id) ?? Number.POSITIVE_INFINITY;

  const voted = items.filter((item) => item.voters > 0);
  const unvoted = items.filter((item) => item.voters === 0);

  // Array.sort is stable, so items that tie on score and on previous place
  // (two that are new since the last order) keep the order they were added.
  voted.sort((a, b) => b.score - a.score || comparePlaces(placeOf(a), placeOf(b)));

  return [...voted, ...unvoted].map((item) => item.id);
}

function comparePlaces(a: number, b: number): number {
  if (a === b) return 0; // Also covers two items the previous order didn't have.
  return a < b ? -1 : 1;
}

/** The order of a whole board: its arguments within each option, and the wordings within each argument. */
export interface BoardOrder {
  /** Option ID → its arguments' IDs, most important first. */
  arguments: Record<string, string[]>;
  /** Argument ID → its wordings' IDs, best articulated first. */
  versions: Record<string, string[]>;
}

/** What `nextBoardOrder` needs to know about a board: each list's items with their counts, in the order added. */
export interface BoardCounts {
  /** Option ID → its arguments, with importance scores. */
  arguments: Record<string, readonly Ranked[]>;
  /** Argument ID → its wordings, with articulation scores. */
  versions: Record<string, readonly Ranked[]>;
}

/** The next order of a whole board. Each option and each argument is ordered on its own. */
export function nextBoardOrder(previous: BoardOrder, counts: BoardCounts): BoardOrder {
  const orderEach = (before: Record<string, string[]>, lists: Record<string, readonly Ranked[]>) =>
    Object.fromEntries(Object.entries(lists).map(([id, items]) => [id, nextOrder(before[id] ?? [], items)]));

  return {
    arguments: orderEach(previous.arguments, counts.arguments),
    versions: orderEach(previous.versions, counts.versions),
  };
}
