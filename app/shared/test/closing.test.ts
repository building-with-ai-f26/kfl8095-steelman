import { expect, test } from "vitest";
import { closedSince } from "../src/index.ts";

// The one rule for whether a board is closed (I-05, M3b-3): closed by hand,
// or its closing time has passed. Nothing is written when the time passes,
// so the service and the browser both ask this rule with the time now.

const AT = new Date("2026-11-30T22:00:00Z");
const before = (ms: number) => new Date(AT.getTime() - ms);
const after = (ms: number) => new Date(AT.getTime() + ms);

test("I-05: a board with neither date is open", () => {
  expect(closedSince({ closedAt: null, closesAt: null }, AT)).toBeNull();
});

test("I-05: a board closed by hand is closed since then, whatever the time now", () => {
  expect(closedSince({ closedAt: AT, closesAt: null }, after(1))).toEqual(AT);
  expect(closedSince({ closedAt: AT, closesAt: null }, before(60_000))).toEqual(AT);
});

test("I-05: a millisecond before its closing time a board is open; at the instant and after, it is closed since that time", () => {
  expect(closedSince({ closedAt: null, closesAt: AT }, before(1))).toBeNull();
  expect(closedSince({ closedAt: null, closesAt: AT }, AT)).toEqual(AT);
  expect(closedSince({ closedAt: null, closesAt: AT }, after(86_400_000))).toEqual(AT);
});

test("I-05: with both dates set, it is closed since the earlier of the two that has come", () => {
  const byHand = before(3_600_000);
  expect(closedSince({ closedAt: byHand, closesAt: AT }, before(1))).toEqual(byHand);
  expect(closedSince({ closedAt: byHand, closesAt: AT }, after(1))).toEqual(byHand);
  expect(closedSince({ closedAt: after(60_000), closesAt: AT }, after(120_000))).toEqual(AT);
});
