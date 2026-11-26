import { afterEach, expect, test, vi } from "vitest";
import type { BoardListing } from "@steelman/shared";
import { SORTS, matches, needsHelp, readSort, saveSort, sortBoards, sortSentence, searchSentence } from "../src/listSearch.ts";

// Searching and sorting Your steelmen (M3d-13; E-03, E-04, E-05). Search
// finds the words in a board's question or in any option's name, whatever
// their case, as the prototype's visibleBoards does. Recently updated keeps
// the service's order, Newest puts the board made last first, and Needs help
// puts each board with an option under two arguments first and keeps the
// rest of the order as it was.

const listing = (id: string, question: string, over: Partial<BoardListing> = {}): BoardListing => ({
  id,
  question,
  options: [
    { name: "Yes", arguments: 2 },
    { name: "No", arguments: 2 },
  ],
  role: "owner",
  owner: "ana",
  changedAt: "2026-11-20T12:00:00.000Z",
  createdAt: "2026-11-10T12:00:00.000Z",
  comments: 0,
  ...over,
});

const library = listing("library", "Should our library open on Sundays?");
const cafe = listing("cafe", "Should the café stay open late?", { options: [{ name: "Until midnight", arguments: 3 }, { name: "Closing at nine", arguments: 2 }] });
const park = listing("park", "Should the park allow dogs off the lead?", { options: [{ name: "Yes", arguments: 1 }, { name: "No", arguments: 4 }] });

test("E-05: matching ignores case and finds text in the question", () => {
  expect(matches(library, "LIBRARY")).toBe(true);
  expect(matches(library, "sundays")).toBe(true);
  expect(matches(library, "Open on")).toBe(true);
  expect(matches(library, "museum")).toBe(false);
});

test("E-05: matching finds text in an option's name, and the board's other text isn't searched", () => {
  expect(matches(cafe, "MIDNIGHT")).toBe(true);
  expect(matches(cafe, "at nine")).toBe(true);
  expect(matches(cafe, "ana")).toBe(false);
});

test("E-05: an empty search, or one of spaces, matches every board, and spaces around the words are ignored", () => {
  expect(matches(library, "")).toBe(true);
  expect(matches(library, "   ")).toBe(true);
  expect(matches(library, "  library  ")).toBe(true);
});

test("E-04: Recently updated keeps the service's order, which is the last change first", () => {
  const boards = [cafe, library, park];
  expect(sortBoards(boards, "updated").map((board) => board.id)).toEqual(["cafe", "library", "park"]);
});

test("E-04: Newest puts the board made last first", () => {
  const older = listing("older", "Older", { createdAt: "2026-11-01T09:00:00.000Z", changedAt: "2026-11-24T09:00:00.000Z" });
  const newer = listing("newer", "Newer", { createdAt: "2026-11-21T09:00:00.000Z", changedAt: "2026-11-22T09:00:00.000Z" });
  const middle = listing("middle", "Middle", { createdAt: "2026-11-15T09:00:00.000Z", changedAt: "2026-11-23T09:00:00.000Z" });
  expect(sortBoards([older, middle, newer], "newest").map((board) => board.id)).toEqual(["newer", "middle", "older"]);
});

test("E-04: Needs help puts each board with an option under two arguments first, keeps the order within each group, and drops none", () => {
  const empty = listing("empty", "Should the pool open earlier?", { options: [{ name: "Yes", arguments: 0 }, { name: "No", arguments: 0 }] });
  const boards = [cafe, library, park, empty];
  expect(needsHelp(park)).toBe(true);
  expect(needsHelp(empty)).toBe(true);
  expect(needsHelp(library)).toBe(false);
  expect(sortBoards(boards, "help").map((board) => board.id)).toEqual(["park", "empty", "cafe", "library"]);
});

test("E-04: sorting leaves the list it was given as it was", () => {
  const boards = [cafe, library, park];
  sortBoards(boards, "help");
  sortBoards(boards, "newest");
  expect(boards.map((board) => board.id)).toEqual(["cafe", "library", "park"]);
});

test("E-04: the Sort menu offers Recently updated, Newest, and Needs help, in that order, each with a sentence that says what it does", () => {
  expect(SORTS.map((sort) => sort.label)).toEqual(["Recently updated", "Newest", "Needs help"]);
  for (const sort of SORTS) expect(sort.hint).toMatch(/^[A-Z].* .*\.$/);
  expect(sortSentence("newest")).toBe("The newest steelmen come first.");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A tab's sessionStorage, held in a Map, so the unit tests can read what was kept. */
function stubStorage(): Map<string, string> {
  const kept = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  });
  return kept;
}

test("E-04: without storage the sort is Recently updated", () => {
  // The unit tests run without a browser, so there is no sessionStorage, and the sort is the default.
  expect(readSort()).toBe("updated");
  expect(() => saveSort("newest")).not.toThrow();
  expect(readSort()).toBe("updated");
});

test("E-04: the sort a tab was left on is read back, and Recently updated, the default, keeps nothing", () => {
  const kept = stubStorage();
  saveSort("newest");
  expect(readSort()).toBe("newest");
  saveSort("help");
  expect(readSort()).toBe("help");
  expect(kept.size).toBe(1);
  saveSort("updated");
  expect(kept.size).toBe(0);
  expect(readSort()).toBe("updated");
});

test("E-04: a saved sort the menu doesn't offer, or storage that throws, reads as Recently updated", () => {
  const kept = stubStorage();
  saveSort("newest");
  const [key] = [...kept.keys()];
  kept.set(key!, "bogus");
  expect(readSort()).toBe("updated");
  vi.stubGlobal("sessionStorage", {
    getItem: () => {
      throw new Error("The storage is blocked.");
    },
    setItem: () => {
      throw new Error("The storage is blocked.");
    },
    removeItem: () => {
      throw new Error("The storage is blocked.");
    },
  });
  expect(readSort()).toBe("updated");
  expect(() => saveSort("newest")).not.toThrow();
});

test("E-05: what a search announces is a sentence with the number of steelmen found, and never the search text", () => {
  expect(searchSentence(0)).toBe("No steelmen match that search.");
  expect(searchSentence(1)).toBe("1 steelman matches that search.");
  expect(searchSentence(3)).toBe("3 steelmen match that search.");
});
