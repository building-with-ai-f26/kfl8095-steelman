// Your statistics on Your account (L-09, M3d-14): the counts the service
// works out, said as plain sentences (rule 13). Wikipedia's
// Special:Contributions says it the same way, "A user with 15,156 edits."
// (checked Nov 25). Like GitHub's contribution count and Stack Overflow's
// profile stats (from memory), each figure is a number of things you did, and
// a zero is shown too, quieter, so the lines keep their places. A new account
// sees one sentence instead of a list of zeros.

import type { AccountStatistics } from "@steelman/shared";

export const NOTHING_YET = "You haven’t written anything yet.";

export interface StatisticLine {
  name: "arguments" | "wordings" | "sources" | "comments" | "boards" | "nothing";
  text: string;
  /** Nothing of this kind yet, so the line is drawn quieter. */
  zero: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "and 3 of them are in their option’s top three." for many, "and it is in its option’s top three." for one. */
function andOfThem(total: number, some: number, words: { it: string; itNot: string; one: string; many: string; none: string }): string {
  if (total === 1) return some === 1 ? words.it : words.itNot;
  if (some === 0) return words.none;
  return some === 1 ? `1 of them ${words.one}` : `${some} of them ${words.many}`;
}

export function statisticLines(s: AccountStatistics): StatisticLine[] {
  if (s.arguments + s.wordings + s.sources + s.comments + s.boards === 0) return [{ name: "nothing", text: NOTHING_YET, zero: true }];
  const top = { it: "it is in its option’s top three", itNot: "it isn’t in its option’s top three", one: "is in its option’s top three", many: "are in their option’s top three", none: "none of them are in their option’s top three" };
  const lead = { it: "it leads its row", itNot: "it doesn’t lead its row", one: "leads its row", many: "lead their row", none: "none of them lead their row" };
  return [
    {
      name: "arguments",
      text: s.arguments === 0 ? "You haven’t written an argument yet." : `You wrote ${plural(s.arguments, "argument", "arguments")}, and ${andOfThem(s.arguments, s.argumentsInTopThree, top)}.`,
      zero: s.arguments === 0,
    },
    {
      name: "wordings",
      text: s.wordings === 0 ? "You haven’t written a wording yet." : `You wrote ${plural(s.wordings, "wording", "wordings")}, and ${andOfThem(s.wordings, s.wordingsLeading, lead)}.`,
      zero: s.wordings === 0,
    },
    { name: "sources", text: s.sources === 0 ? "You haven’t added a source yet." : `You added ${plural(s.sources, "source", "sources")}.`, zero: s.sources === 0 },
    { name: "comments", text: s.comments === 0 ? "You haven’t written a comment yet." : `You wrote ${plural(s.comments, "comment", "comments")}.`, zero: s.comments === 0 },
    { name: "boards", text: s.boards === 0 ? "You haven’t taken part in a board yet." : `You took part in ${plural(s.boards, "board", "boards")}.`, zero: s.boards === 0 },
  ];
}
