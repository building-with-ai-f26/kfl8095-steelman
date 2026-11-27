import { expect, test } from "vitest";
import { rankLive } from "@steelman/shared";

// The ranking Strongest case uses (E-01), shared with Your statistics (L-09,
// M3d-14) so "in its option's top three" and "leads its row" there mean what
// they mean on the board: the live items the published order ranks, in its
// order, then the live items it hasn't ranked yet, in the order added.

const item = (id: string, createdSeq: number) => ({ id, createdSeq });

test("L-09 E-01: the published order comes first, then what it hasn't ranked, in the order added", () => {
  expect(rankLive(["c", "a"], [item("a", 1), item("b", 3), item("c", 2), item("d", 2)])).toEqual(["c", "a", "d", "b"]);
});

test("L-09 E-01: an item the order ranks that is no longer live is left out", () => {
  expect(rankLive(["gone", "b", "a"], [item("a", 1), item("b", 2)])).toEqual(["b", "a"]);
});

test("L-09 E-01: items added at the same change go by their IDs", () => {
  expect(rankLive([], [item("y", 4), item("x", 4)])).toEqual(["x", "y"]);
});
