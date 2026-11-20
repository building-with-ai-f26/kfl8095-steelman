import { expect, test } from "vitest";
import { NEW_PATH, readLink } from "../src/links.ts";
import { ago } from "../src/when.ts";

// The list (E-03, M2-7): the home page lists your steelmen, and New steelman's
// sheet moves to its own address; each board says how long ago it changed,
// in the prototype's short form (ago in docs/prototype/source/steelman-refined.html).

test("E-03, F-01: New steelman's sheet has its own address, and the home page stays the list", () => {
  expect(readLink(NEW_PATH)).toEqual({ kind: "new" });
  expect(readLink("/new/")).toEqual({ kind: "new" });
  expect(readLink("/")).toEqual({ kind: "home" });
  expect(readLink("/newer")).toEqual({ kind: "home" });
});

test("E-03: how long ago, in minutes, then hours, then days", () => {
  const now = "2026-11-16T12:00:00.000Z";
  const before = (minutes: number) => new Date(Date.parse(now) - minutes * 60_000).toISOString();

  expect(ago(before(0), now)).toBe("just now");
  expect(ago(before(0.4), now)).toBe("just now");
  expect(ago(before(1), now)).toBe("1m ago");
  expect(ago(before(59), now)).toBe("59m ago");
  expect(ago(before(60), now)).toBe("1h ago");
  expect(ago(before(23 * 60), now)).toBe("23h ago");
  expect(ago(before(24 * 60), now)).toBe("1d ago");
  expect(ago(before(9 * 24 * 60), now)).toBe("9d ago");
});

test("E-03: a time a little ahead of now, from clocks that disagree, is just now", () => {
  expect(ago("2026-11-16T12:00:05.000Z", "2026-11-16T12:00:00.000Z")).toBe("just now");
});
