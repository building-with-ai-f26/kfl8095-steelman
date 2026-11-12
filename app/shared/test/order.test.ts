import { describe, expect, test } from "vitest";
import { nextBoardOrder, nextOrder } from "@steelman/shared";
import type { Ranked } from "@steelman/shared";

// The shared order (plans/architecture.md §3): items sort by score, and ties
// keep the previous order. An item nobody has voted on counts as zero: it sits
// above anything voted down (the builder's decision, Nov 12, Q23) and after
// anything else at zero, in the order it was added.

/** `voters` is how many people have a vote on the item; `score` is the sum of their votes. */
const item = (id: string, score: number, voters: number): Ranked => ({ id, score, voters });

describe("the shared order of one list", () => {
  test("B-05: items sort by score, highest first", () => {
    const items = [item("a", 1, 1), item("b", 5, 5), item("c", 3, 3)];

    expect(nextOrder([], items)).toEqual(["b", "c", "a"]);
  });

  test("B-05: ties keep the previous order", () => {
    const items = [item("a", 2, 2), item("b", 2, 2), item("c", 2, 2)];

    expect(nextOrder(["c", "a", "b"], items)).toEqual(["c", "a", "b"]);
  });

  test("B-05: a tie is not broken by which item was added first", () => {
    const items = [item("older", 2, 2), item("newer", 2, 2)];

    expect(nextOrder(["newer", "older"], items)).toEqual(["newer", "older"]);
  });

  test("B-05: an item that overtakes moves; the ones it ties with keep their order", () => {
    const previous = ["a", "b", "c", "d"];
    const items = [item("a", 4, 4), item("b", 3, 3), item("c", 3, 3), item("d", 3, 3)];
    const afterVotesForD = items.map((i) => (i.id === "d" ? item("d", 5, 5) : i));

    expect(nextOrder(previous, items)).toEqual(["a", "b", "c", "d"]);
    expect(nextOrder(previous, afterVotesForD)).toEqual(["d", "a", "b", "c"]);
  });

  test("B-05: unvoted items sit below anything voted up, in the order they were added", () => {
    const items = [item("first", 0, 0), item("voted", 1, 1), item("second", 0, 0)];

    expect(nextOrder([], items)).toEqual(["voted", "first", "second"]);
  });

  test("B-05: an unvoted item sits above one voted down (Q23)", () => {
    const items = [item("down", -3, 3), item("unvoted", 0, 0)];

    expect(nextOrder([], items)).toEqual(["unvoted", "down"]);
  });

  test("B-05: votes that cancel out sort at zero, just above the unvoted", () => {
    const items = [item("unvoted", 0, 0), item("down", -1, 1), item("split", 0, 2), item("up", 1, 1)];

    expect(nextOrder([], items)).toEqual(["up", "split", "unvoted", "down"]);
  });

  test("B-05: at zero, a voted item stays above the unvoted even if it was below them before", () => {
    const previous = ["unvoted", "split"];
    const items = [item("unvoted", 0, 0), item("split", 0, 2)];

    expect(nextOrder(previous, items)).toEqual(["split", "unvoted"]);
  });

  test("B-05: an item whose votes were all withdrawn rejoins the unvoted, in the order it was added", () => {
    const previous = ["b", "a", "c"]; // b was on top while it had votes
    const items = [item("a", 0, 0), item("b", 0, 0), item("c", 1, 1)];

    expect(nextOrder(previous, items)).toEqual(["c", "a", "b"]);
  });

  test("B-05: a newly voted item that ties goes after the ones already in the order", () => {
    const previous = ["a", "b"];
    const items = [item("new", 1, 1), item("a", 1, 1), item("b", 1, 1)];

    expect(nextOrder(previous, items)).toEqual(["a", "b", "new"]);
  });

  test("B-05: an item that is gone drops out of the order", () => {
    const previous = ["a", "deleted", "b"];
    const items = [item("a", 2, 2), item("b", 2, 2)];

    expect(nextOrder(previous, items)).toEqual(["a", "b"]);
  });

  test("B-05: recalculating with nothing changed gives the same order again", () => {
    const items = [item("a", 1, 3), item("b", 1, 1), item("c", 0, 0), item("d", -2, 2), item("e", 1, 5)];
    const once = nextOrder(["e", "b", "a"], items);

    expect(nextOrder(once, items)).toEqual(once);
  });

  test("B-05: it leaves what it was given untouched", () => {
    const previous = Object.freeze(["b", "a"]);
    const items = Object.freeze([item("a", 5, 5), item("b", 1, 1)]);

    expect(nextOrder(previous, items)).toEqual(["a", "b"]);
    expect(previous).toEqual(["b", "a"]);
  });
});

describe("the shared order of a whole board", () => {
  test("B-01, B-02, B-05: arguments order by importance within each option, wordings by articulation within each argument", () => {
    const previous = {
      arguments: { yes: ["y1", "y2"], no: ["n1"] },
      versions: { y1: ["v1", "v2"], y2: ["v3"], n1: ["v4"] },
    };
    const counts = {
      arguments: {
        yes: [item("y1", 1, 1), item("y2", 4, 4), item("y3", 0, 0)],
        no: [item("n1", 0, 0)],
      },
      versions: {
        y1: [item("v1", 2, 2), item("v2", 3, 3)],
        y2: [item("v3", 0, 0)],
        y3: [item("v5", 0, 0)],
        n1: [item("v4", 1, 1), item("v6", 1, 1)],
      },
    };

    expect(nextBoardOrder(previous, counts)).toEqual({
      arguments: { yes: ["y2", "y1", "y3"], no: ["n1"] },
      versions: { y1: ["v2", "v1"], y2: ["v3"], y3: ["v5"], n1: ["v4", "v6"] },
    });
  });

  test("B-05: an importance vote never reorders another option's arguments", () => {
    const previous = { arguments: { yes: ["y1", "y2"], no: ["n1", "n2"] }, versions: {} };
    const counts = {
      arguments: {
        yes: [item("y1", 1, 1), item("y2", 9, 9)],
        no: [item("n1", 1, 1), item("n2", 1, 1)],
      },
      versions: {},
    };

    expect(nextBoardOrder(previous, counts).arguments.no).toEqual(["n1", "n2"]);
  });

  test("B-05: the very first order needs no previous one", () => {
    const counts = { arguments: { yes: [item("y1", 0, 0), item("y2", 1, 1)] }, versions: { y1: [], y2: [] } };

    expect(nextBoardOrder({ arguments: {}, versions: {} }, counts)).toEqual({
      arguments: { yes: ["y2", "y1"] },
      versions: { y1: [], y2: [] },
    });
  });
});
