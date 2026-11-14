// The planted project's only test. Named .fixture.ts so the repository's own
// test run doesn't pick it up.
import { expect, test } from "vitest";
import { isAdult } from "./planted.ts";

test("adults and children", () => {
  expect(isAdult(30)).toBe(true);
  expect(isAdult(5)).toBe(false);
});
