import { expect, test } from "vitest";
import { systemClock, systemIds } from "../src/system.ts";

test("M0-1: the real clock reads the system's time", () => {
  const before = Date.now();
  const now = systemClock.now().getTime();
  const after = Date.now();

  expect(now).toBeGreaterThanOrEqual(before);
  expect(now).toBeLessThanOrEqual(after);
});

test("M0-1: real IDs have the same shape as seeded ones and do not repeat", () => {
  expect(systemIds.boardId()).toMatch(/^[A-Za-z0-9_-]{12}$/);
  expect(systemIds.itemId()).toMatch(/^[A-Za-z0-9_-]{20}$/);

  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) seen.add(systemIds.boardId());
  expect(seen.size).toBe(1000);
});
