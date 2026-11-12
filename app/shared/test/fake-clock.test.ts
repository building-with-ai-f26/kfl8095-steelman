import { describe, expect, test } from "vitest";
import { createFakeClock } from "@steelman/shared/testing";

describe("the fake clock", () => {
  test("M0-1: it starts at the time it is given and stays there", () => {
    const clock = createFakeClock(new Date("2026-11-16T09:00:00Z"));

    expect(clock.now().toISOString()).toBe("2026-11-16T09:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-11-16T09:00:00.000Z");
  });

  test("M0-1: it moves only when a test moves it", () => {
    const clock = createFakeClock(new Date("2026-11-16T09:00:00Z"));

    clock.advance(60_000);
    expect(clock.now().toISOString()).toBe("2026-11-16T09:01:00.000Z");

    clock.set(new Date("2027-01-01T00:00:00Z"));
    expect(clock.now().toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  test("M0-1: it refuses to go backwards", () => {
    const clock = createFakeClock(new Date("2026-11-16T09:00:00Z"));

    expect(() => clock.advance(-1)).toThrow();
    expect(() => clock.set(new Date("2026-11-16T08:59:59Z"))).toThrow();
  });

  test("M0-1: changing a time it handed out does not change the clock", () => {
    const clock = createFakeClock(new Date("2026-11-16T09:00:00Z"));

    clock.now().setFullYear(1999);

    expect(clock.now().toISOString()).toBe("2026-11-16T09:00:00.000Z");
  });
});
