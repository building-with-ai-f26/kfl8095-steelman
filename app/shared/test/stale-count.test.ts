import { describe, expect, test } from "vitest";
import { fewestMoves, staleCount } from "@steelman/shared";

// The pill ("3 changes · Update") counts the fewest moves from what is on
// screen to the newest shared order, plus the structural changes other people
// made that are still marked in place (plans/architecture.md §3). Cases from
// tests/build-1-manual.md, "Live changes" and "Live changes, structure".

const letters = (text: string) => text.split("");

describe("the fewest moves between two orders of one list", () => {
  test("B-05: the same order needs no moves", () => {
    expect(fewestMoves(letters("abcde"), letters("abcde"))).toBe(0);
  });

  test("B-05: three rows jumping to the top is 3 moves, not the 9 rows they push down", () => {
    const shown = letters("abcdefghij");
    const live = letters("ghiabcdefj");

    const displaced = shown.filter((id, position) => live[position] !== id).length;
    expect(displaced).toBe(9);
    expect(fewestMoves(shown, live)).toBe(3);
  });

  test("B-05: one row moving from the bottom to the top is one move", () => {
    expect(fewestMoves(letters("abcde"), letters("eabcd"))).toBe(1);
  });

  test("B-05: two neighbours swapping is one move", () => {
    expect(fewestMoves(letters("abcde"), letters("abdce"))).toBe(1);
  });

  test("B-05: a fully reversed list keeps one row and moves the rest", () => {
    expect(fewestMoves(letters("abcde"), letters("edcba"))).toBe(4);
  });

  test("M-02: a new row that the shared order doesn't know yet is not a move", () => {
    expect(fewestMoves(letters("abcN"), letters("abc"))).toBe(0);
  });

  test("M-02: a new row shown last that the shared order puts first is one move", () => {
    expect(fewestMoves(letters("abcN"), letters("Nabc"))).toBe(1);
  });

  test("M-02: a row still shown after it was deleted is not a move; the rows around it aren't either", () => {
    expect(fewestMoves(letters("abXcd"), letters("abcd"))).toBe(0);
  });

  test("B-05: an empty list needs no moves", () => {
    expect(fewestMoves([], [])).toBe(0);
    expect(fewestMoves([], letters("abc"))).toBe(0);
  });
});

describe("the number on the pill", () => {
  const board = {
    arguments: { yes: letters("abcdefghij"), no: letters("klm") },
    versions: { a: ["a1", "a2", "a3"], k: ["k1", "k2"] },
  };

  test("B-05: an up-to-date board has nothing to update", () => {
    expect(staleCount(board, board, 0)).toBe(0);
  });

  test("B-05: moves add up across options and across each argument's wordings", () => {
    const live = {
      arguments: { yes: letters("ghiabcdefj"), no: letters("mkl") },
      versions: { a: ["a3", "a1", "a2"], k: ["k1", "k2"] },
    };

    expect(staleCount(board, live, 0)).toBe(3 + 1 + 1);
  });

  test("M-02: each structural change still marked in place counts once", () => {
    // "Separate": the placeholder stays in place and the pill says "1 change".
    expect(staleCount(board, board, 1)).toBe(1);
    // Then a combine as well: "2 changes".
    expect(staleCount(board, board, 2)).toBe(2);
  });

  test("M-02: a new argument on screen that no shared order has ranked yet adds nothing", () => {
    const shown = {
      arguments: { ...board.arguments, no: [...board.arguments.no, "new"] },
      versions: { ...board.versions, new: ["new1"] },
    };

    expect(staleCount(shown, board, 0)).toBe(0);
  });

  test("B-05: an option the reader hasn't loaded adds nothing", () => {
    const live = { arguments: { ...board.arguments, maybe: ["x", "y"] }, versions: board.versions };

    expect(staleCount(board, live, 0)).toBe(0);
  });

  test("M-02: a count of marked changes that isn't a whole number from zero up is a bug, and says so", () => {
    expect(() => staleCount(board, board, -1)).toThrow();
    expect(() => staleCount(board, board, 1.5)).toThrow();
  });
});
