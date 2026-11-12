import { describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";

describe("seeded IDs", () => {
  test("M0-1: the same seed gives the same IDs in the same order", () => {
    const first = createSeededIds(42);
    const second = createSeededIds(42);

    const a = [first.boardId(), first.itemId(), first.itemId()];
    const b = [second.boardId(), second.itemId(), second.itemId()];

    expect(a).toEqual(b);
  });

  test("M0-1: a different seed gives different IDs", () => {
    expect(createSeededIds(1).itemId()).not.toBe(createSeededIds(2).itemId());
  });

  test("M0-1: a board ID is 12 URL-safe characters (72 bits)", () => {
    expect(createSeededIds(7).boardId()).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  test("M0-1: an item ID is 20 URL-safe characters (120 bits)", () => {
    expect(createSeededIds(7).itemId()).toMatch(/^[A-Za-z0-9_-]{20}$/);
  });

  test("M0-1: ten thousand IDs from one seed never repeat", () => {
    const ids = createSeededIds(2026);
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(ids.itemId());

    expect(seen.size).toBe(10_000);
  });
});
