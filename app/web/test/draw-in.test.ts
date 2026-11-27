import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CARD_GAP_MS, LAST_CARD_BY_MS, OPENING_MS, WAITING_ATTRIBUTE, drawInAfter, drawInOrder, finishDrawIn } from "../src/board/draw-in.ts";
import type { Placed } from "../src/board/draw-in.ts";

// A board draws itself when it opens (M3d-23, M-15). drawInOrder() says when
// each part of the board starts to come in: the question first, then the
// wires, then the option headers in column order, and then the cards by row
// and then by column. Cards start 50 ms apart, and the last one starts by
// 600 ms however many cards the board has, and early enough that it ends
// within a second at --sm-slow. The order's tests run in Node on plain
// numbers, because the order is pure arithmetic.

const SLOW = 420;

/** A board of `rows` rows in each of `columns` columns, one card a row, listed column by column as the page lists them. */
function grid(columns: number, rows: number): Placed[] {
  const cards: Placed[] = [];
  for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) cards.push({ column, row, along: 0 });
  return cards;
}

describe("drawInOrder", () => {
  test("M-15: the order is the question, the wires, the headers, and then the cards", () => {
    const steps = drawInOrder(2, grid(2, 3), SLOW);
    expect(steps.map((step) => step.kind)).toEqual(["question", "wires", "header", "header", "card", "card", "card", "card", "card", "card"]);
    // Each step starts no earlier than the one before it, and the question starts at once.
    expect(steps[0]!.delay).toBe(0);
    for (let n = 1; n < steps.length; n++) expect(steps[n]!.delay).toBeGreaterThanOrEqual(steps[n - 1]!.delay);
    // Each kind starts after the kind before it.
    const first = (kind: string) => steps.find((step) => step.kind === kind)!.delay;
    const last = (kind: string) => steps.filter((step) => step.kind === kind).at(-1)!.delay;
    expect(first("wires")).toBeGreaterThan(first("question"));
    expect(first("header")).toBeGreaterThan(first("wires"));
    expect(first("card")).toBeGreaterThan(last("header"));
  });

  test("M-15: the headers come in column order", () => {
    const headers = drawInOrder(3, [], SLOW).filter((step) => step.kind === "header");
    expect(headers.map((step) => step.index)).toEqual([0, 1, 2]);
    expect(headers[1]!.delay).toBeGreaterThan(headers[0]!.delay);
    expect(headers[2]!.delay).toBeGreaterThan(headers[1]!.delay);
  });

  test("M-15: the cards come in by row and then by column, and along an unfolded row from its start", () => {
    // Given column by column, as the page lists them: Yes has three rows, the second unfolded to three wordings; No has two.
    const cards: Placed[] = [
      { column: 0, row: 0, along: 0 },
      { column: 0, row: 1, along: 0 },
      { column: 0, row: 1, along: 1 },
      { column: 0, row: 1, along: 2 },
      { column: 0, row: 2, along: 0 },
      { column: 1, row: 0, along: 0 },
      { column: 1, row: 1, along: 0 },
    ];
    const order = drawInOrder(2, cards, SLOW)
      .filter((step) => step.kind === "card")
      .map((step) => cards[step.index]!);
    expect(order).toEqual([
      { column: 0, row: 0, along: 0 },
      { column: 1, row: 0, along: 0 },
      { column: 0, row: 1, along: 0 },
      { column: 0, row: 1, along: 1 },
      { column: 0, row: 1, along: 2 },
      { column: 1, row: 1, along: 0 },
      { column: 0, row: 2, along: 0 },
    ]);
  });

  test("M-15: on a small board the cards start 50 ms apart", () => {
    const cards = drawInOrder(2, grid(2, 2), SLOW).filter((step) => step.kind === "card");
    for (let n = 1; n < cards.length; n++) expect(cards[n]!.delay - cards[n - 1]!.delay).toBe(CARD_GAP_MS);
    expect(CARD_GAP_MS).toBe(50);
  });

  test("M-15: on a board of 60 cards the last card starts by 600 ms, and every step ends within a second", () => {
    const steps = drawInOrder(2, grid(2, 30), SLOW);
    const cards = steps.filter((step) => step.kind === "card");
    expect(cards).toHaveLength(60);
    expect(LAST_CARD_BY_MS).toBe(600);
    expect(cards.at(-1)!.delay).toBeLessThanOrEqual(600);
    // The cards still start one after another, closer together than 50 ms.
    for (let n = 1; n < cards.length; n++) {
      expect(cards[n]!.delay).toBeGreaterThan(cards[n - 1]!.delay);
      expect(cards[n]!.delay - cards[n - 1]!.delay).toBeLessThan(CARD_GAP_MS);
    }
    expect(OPENING_MS).toBe(1000);
    for (const step of steps) expect(step.delay + SLOW).toBeLessThanOrEqual(OPENING_MS);
  });

  test("M-15: the last card starts by 600 ms on every board size, and the opening ends within a second", () => {
    for (const rows of [1, 2, 5, 7, 12, 30, 100]) {
      const steps = drawInOrder(2, grid(2, rows), SLOW);
      const cards = steps.filter((step) => step.kind === "card");
      expect(cards).toHaveLength(rows * 2);
      expect(cards.at(-1)!.delay).toBeLessThanOrEqual(LAST_CARD_BY_MS);
      for (const step of steps) expect(step.delay + SLOW).toBeLessThanOrEqual(OPENING_MS);
    }
  });

  test("M-15: a longer --sm-slow starts the last card sooner, so the opening still ends within a second", () => {
    const steps = drawInOrder(3, grid(3, 20), 600);
    for (const step of steps) expect(step.delay + 600).toBeLessThanOrEqual(OPENING_MS);
    expect(steps.filter((step) => step.kind === "card").at(-1)!.delay).toBeLessThanOrEqual(LAST_CARD_BY_MS);
  });

  test("M-15: a board with no cards draws the question, the wires, and the headers", () => {
    expect(drawInOrder(2, [], SLOW).map((step) => step.kind)).toEqual(["question", "wires", "header", "header"]);
  });
});

// drawInAfter() waits for the list's zoom before the board draws itself, and Board.tsx calls it from an effect that
// React runs twice in development (StrictMode): a run, its cleanup (finishDrawIn), and a second run. These tests stand
// in for the page with the little of window and document the waiting uses. The stand-in surface holds no board, so
// drawIn() starts nothing, and each test counts how many times the drawing was handed on.
describe("drawInAfter", () => {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  let reduce = false;
  const fakeDocument = {
    addEventListener: (type: string, listener: (event: Event) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: (event: Event) => void) => listeners.get(type)?.delete(listener),
  };
  const fakeWindow = {
    matchMedia: () => ({ matches: reduce, addEventListener: () => undefined, removeEventListener: () => undefined }),
  };
  /** A surface with no board in it, which notes whether the parts are hidden while it waits. */
  function surface() {
    const attributes = new Set<string>();
    return {
      isConnected: true,
      attributes,
      setAttribute: (name: string) => attributes.add(name),
      removeAttribute: (name: string) => attributes.delete(name),
      querySelector: () => null,
    } as unknown as HTMLElement & { attributes: Set<string> };
  }
  /** A promise and what settles it, as the zoom's `finished` is. */
  function zoom() {
    let end!: () => void;
    let cancel!: () => void;
    const finished = new Promise<void>((resolve, reject) => {
      end = resolve;
      cancel = () => reject(new Error("cancelled"));
    });
    return { finished, end, cancel };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const press = (type: string) => {
    for (const listener of [...(listeners.get(type) ?? [])]) listener({ type, target: null } as unknown as Event);
  };

  beforeEach(() => {
    listeners.clear();
    reduce = false;
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("document", fakeDocument);
    vi.stubGlobal("Node", class {});
  });
  afterEach(() => {
    finishDrawIn();
    vi.unstubAllGlobals();
  });

  test("M-15 E-07: StrictMode's run, cleanup, and second run draw the board once, when the zoom ends", async () => {
    const board = surface();
    const grow = zoom();
    const started = vi.fn();
    drawInAfter(board, grow.finished, started);
    finishDrawIn();
    drawInAfter(board, grow.finished, started);
    // The parts stay hidden while the zoom plays.
    expect(board.attributes.has(WAITING_ATTRIBUTE)).toBe(true);
    await settle();
    expect(started).not.toHaveBeenCalled();
    grow.end();
    await settle();
    expect(started).toHaveBeenCalledTimes(1);
    expect(board.attributes.has(WAITING_ATTRIBUTE)).toBe(false);
  });

  test("M-15 E-07: a press, a key, or a tour during the zoom means the board never draws itself, and shows at once", async () => {
    for (const end of [() => press("pointerdown"), () => press("keydown"), () => press("click"), () => finishDrawIn()]) {
      const board = surface();
      const grow = zoom();
      const started = vi.fn();
      drawInAfter(board, grow.finished, started);
      end();
      expect(board.attributes.has(WAITING_ATTRIBUTE)).toBe(false);
      grow.end();
      await settle();
      expect(started).not.toHaveBeenCalled();
      // Nothing is left listening once it's over.
      expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
    }
  });

  test("M-15 E-07: a zoom that's cancelled draws nothing, and the board shows", async () => {
    const board = surface();
    const grow = zoom();
    const started = vi.fn();
    drawInAfter(board, grow.finished, started);
    grow.cancel();
    await settle();
    expect(started).not.toHaveBeenCalled();
    expect(board.attributes.has(WAITING_ATTRIBUTE)).toBe(false);
  });

  test("M-15: under reduced motion nothing waits, nothing is hidden, and nothing draws", async () => {
    reduce = true;
    const board = surface();
    const started = vi.fn();
    drawInAfter(board, Promise.resolve(), started);
    expect(board.attributes.has(WAITING_ATTRIBUTE)).toBe(false);
    await settle();
    expect(started).not.toHaveBeenCalled();
  });
});
