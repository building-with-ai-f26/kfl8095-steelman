import { expect, test } from "vitest";
import type { AccountStatistics } from "@steelman/shared";
import { NOTHING_YET, statisticLines } from "../src/statistics.ts";

// Your statistics on Your account (L-09, M3d-14): each line is a plain
// sentence (rule 13) that handles one, many, and none, and a new account sees
// one sentence instead of a list of zeros.

const ZERO: AccountStatistics = { arguments: 0, argumentsInTopThree: 0, wordings: 0, wordingsLeading: 0, sources: 0, comments: 0, boards: 0 };
const texts = (over: Partial<AccountStatistics>) => statisticLines({ ...ZERO, ...over }).map((line) => line.text);

test("L-09: a new account gets one sentence instead of a list of zeros", () => {
  expect(statisticLines(ZERO)).toEqual([{ name: "nothing", text: NOTHING_YET, zero: true }]);
  expect(NOTHING_YET).toBe("You haven’t written anything yet.");
});

test("L-09: many of each are counted in full sentences", () => {
  expect(texts({ arguments: 12, argumentsInTopThree: 3, wordings: 5, wordingsLeading: 2, sources: 4, comments: 7, boards: 2 })).toEqual([
    "You wrote 12 arguments, and 3 of them are in their option’s top three.",
    "You wrote 5 wordings, and 2 of them lead their row.",
    "You added 4 sources.",
    "You wrote 7 comments.",
    "You took part in 2 boards.",
  ]);
});

test("L-09: one of each is singular", () => {
  expect(texts({ arguments: 1, argumentsInTopThree: 1, wordings: 1, wordingsLeading: 1, sources: 1, comments: 1, boards: 1 })).toEqual([
    "You wrote 1 argument, and it is in its option’s top three.",
    "You wrote 1 wording, and it leads its row.",
    "You added 1 source.",
    "You wrote 1 comment.",
    "You took part in 1 board.",
  ]);
  expect(texts({ arguments: 1, wordings: 1, boards: 1 }).slice(0, 2)).toEqual(["You wrote 1 argument, and it isn’t in its option’s top three.", "You wrote 1 wording, and it doesn’t lead its row."]);
  expect(texts({ arguments: 4, argumentsInTopThree: 1, wordings: 3, wordingsLeading: 1, boards: 1 }).slice(0, 2)).toEqual([
    "You wrote 4 arguments, and 1 of them is in its option’s top three.",
    "You wrote 3 wordings, and 1 of them leads its row.",
  ]);
});

test("L-09: none of many, and none at all, are sentences too, and a zero line is marked", () => {
  const lines = statisticLines({ ...ZERO, arguments: 2, wordings: 2, boards: 1 });
  expect(lines.map((line) => line.text)).toEqual([
    "You wrote 2 arguments, and none of them are in their option’s top three.",
    "You wrote 2 wordings, and none of them lead their row.",
    "You haven’t added a source yet.",
    "You haven’t written a comment yet.",
    "You took part in 1 board.",
  ]);
  expect(lines.map((line) => line.zero)).toEqual([false, false, true, true, false]);
  expect(texts({ sources: 1, boards: 1 }).slice(0, 2)).toEqual(["You haven’t written an argument yet.", "You haven’t written a wording yet."]);
});

test("L-09: no line names a vote or an assessment", () => {
  for (const text of texts({ arguments: 3, argumentsInTopThree: 2, wordings: 4, wordingsLeading: 1, sources: 2, comments: 1, boards: 1 })) {
    expect(text).not.toMatch(/vot|assess/i);
    expect(text).toMatch(/^You [^.]+\.$/);
  }
});
