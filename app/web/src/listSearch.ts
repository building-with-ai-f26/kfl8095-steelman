// Searching and sorting Your steelmen (M3d-13; E-04, E-05), as pure functions
// over the list the page already holds, so no search text reaches the service
// or PostHog. Search is the prototype's (visibleBoards in
// docs/prototype/source/steelman-refined.html): the words, trimmed and in any
// case, found in the question or in an option's name.
//
// The sorts are GitHub's repository list's, checked live on Nov 25: a Sort
// menu whose first choice is Last updated. Here it is Recently updated (the
// service's own order), then Newest (the board made last first), and the
// prototype's Needs help, which puts each board with an option under two
// arguments first. The prototype's Needs help shows only those boards; here
// it only orders them first, as the row asks, so no board goes missing from
// the list. The prototype's Hot and Top wait, since the activity score's
// meaning is untested (E-04's gap).
//
// The sort a tab was left on stays in that tab's sessionStorage, as the way
// back does (places.ts), so it survives Back and a reload of the list. The
// search text is never stored.

import type { BoardListing } from "@steelman/shared";

export type ListSort = "updated" | "newest" | "help";

/** The Sort menu's choices, in order, each with the sentence that says what it does. */
export const SORTS: readonly { value: ListSort; label: string; hint: string }[] = [
  { value: "updated", label: "Recently updated", hint: "The steelmen that changed last come first." },
  { value: "newest", label: "Newest", hint: "The newest steelmen come first." },
  { value: "help", label: "Needs help", hint: "Steelmen with an option under two arguments come first." },
];

const KEY = "steelman-list-sort";

/** Whether the board's question or any option's name holds the search, whatever the case. An empty search matches all. */
export function matches(board: BoardListing, query: string): boolean {
  const words = query.trim().toLowerCase();
  if (!words) return true;
  return board.question.toLowerCase().includes(words) || board.options.some((option) => option.name.toLowerCase().includes(words));
}

/** Whether any option has fewer than two arguments, as the post's dashed option shows it. */
export function needsHelp(board: BoardListing): boolean {
  return board.options.some((option) => option.arguments < 2);
}

/**
 * The boards in the sort's order, as a new list. Recently updated is the order the list came in. Newest puts the board
 * made last first. Needs help puts the boards that need it first, and both groups keep the order the list came in.
 */
export function sortBoards(boards: readonly BoardListing[], sort: ListSort): BoardListing[] {
  if (sort === "newest") return [...boards].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  if (sort === "help") return [...boards.filter(needsHelp), ...boards.filter((board) => !needsHelp(board))];
  return [...boards];
}

/** What a change of sort announces to a screen reader. */
export function sortSentence(sort: ListSort): string {
  return SORTS.find((each) => each.value === sort)!.hint;
}

/** What a change of search announces to a screen reader: how many steelmen it finds, and never the words searched. */
export function searchSentence(found: number): string {
  if (found === 0) return "No steelmen match that search.";
  return found === 1 ? "1 steelman matches that search." : `${found} steelmen match that search.`;
}

/** The sort this tab was left on, or Recently updated when there's none or storage is blocked. */
export function readSort(): ListSort {
  try {
    const saved = sessionStorage.getItem(KEY);
    return SORTS.some((each) => each.value === saved) ? (saved as ListSort) : "updated";
  } catch {
    // Storage blocked, or no browser: the default.
    return "updated";
  }
}

/** Keeps the sort for this tab; Recently updated, the default, keeps nothing. */
export function saveSort(sort: ListSort): void {
  try {
    if (sort === "updated") sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, sort);
  } catch {
    // Storage blocked: the sort lasts until the page is left.
  }
}
