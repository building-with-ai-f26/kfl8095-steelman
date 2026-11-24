// A closing time as History says it (M3b-3, I-05): "Nov 30 at 5 PM EST", in
// the reader's own time zone, named. Node reads TZ when it changes, so this
// file sets New York's before each test.

import { beforeAll, expect, test } from "vitest";
import { momentWithZone } from "../src/when.ts";

beforeAll(() => {
  process.env.TZ = "America/New_York";
});

test("I-05: a whole hour has no minutes, and the zone is named", () => {
  expect(momentWithZone("2026-11-30T22:00:00Z", "2026-11-24T12:00:00Z")).toBe("Nov 30 at 5 PM EST");
});

test("I-05: a time with minutes shows them", () => {
  expect(momentWithZone("2026-11-30T22:30:00Z", "2026-11-24T12:00:00Z")).toBe("Nov 30 at 5:30 PM EST");
});

test("I-05: summer time is named as such", () => {
  expect(momentWithZone("2026-07-04T16:00:00Z", "2026-06-01T12:00:00Z")).toBe("Jul 4 at 12 PM EDT");
});

test("I-05: a time in another year than the one it was set in shows its year", () => {
  expect(momentWithZone("2027-01-05T15:00:00Z", "2026-12-20T12:00:00Z")).toBe("Jan 5, 2027 at 10 AM EST");
});
