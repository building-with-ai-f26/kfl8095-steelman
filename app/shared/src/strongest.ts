// Strongest case (E-01, plans/architecture.md §2 F6): each option's top three
// arguments, each in its best wording. It is derived, never stored, and it
// follows the newest shared order the reader has been sent, not the order on
// their screen: the board holds still until Update, the case doesn't wait
// (the builder's decision, Nov 15).
//
// What the shared order hasn't ranked yet (added since it was published)
// comes after what it has, in the order added, as on the board.

import type { ReaderView } from "./sync.ts";

/** How many arguments make an option's case. */
export const CASE_SIZE = 3;

export interface CaseItem {
  argumentId: string;
  /** Its best wording. */
  versionId: string;
  /** How many wordings it has, the best one included. */
  wordings: number;
}

export interface OptionCase {
  /** The top arguments, best first: at most CASE_SIZE. */
  items: CaseItem[];
  /** How many arguments the option has in all. */
  total: number;
}

/**
 * @param leftOut The reader's own deleted wordings: held for Undo, on their way, or back.
 */
export function strongestCase(view: ReaderView, optionId: string, leftOut: readonly string[] = []): OptionCase {
  const { rows, published } = view;
  const gone = new Set(leftOut);
  const wordingsOf = (argumentId: string) =>
    ranked(
      published.versions[argumentId] ?? [],
      Object.values(rows.versions).filter((version) => version.argumentId === argumentId && !version.deleted && !version.hidden && !gone.has(version.id)),
    );
  const live = Object.values(rows.arguments).filter((argument) => argument.optionId === optionId && !argument.deleted && argument.mergedInto === null);

  const all: CaseItem[] = [];
  for (const argumentId of ranked(published.arguments[optionId] ?? [], live)) {
    const wordings = wordingsOf(argumentId);
    if (wordings.length > 0) all.push({ argumentId, versionId: wordings[0]!, wordings: wordings.length });
  }
  return { items: all.slice(0, CASE_SIZE), total: all.length };
}

/** The live items' IDs: those the order ranks, in its order, then the rest in the order added. */
function ranked(order: readonly string[], live: readonly { id: string; createdSeq: number }[]): string[] {
  const here = new Set(live.map((item) => item.id));
  const inOrder = order.filter((id) => here.has(id));
  const placed = new Set(inOrder);
  const rest = live
    .filter((item) => !placed.has(item.id))
    .sort((a, b) => a.createdSeq - b.createdSeq || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((item) => item.id);
  return [...inOrder, ...rest];
}
