// Changing your username (L-04): the sentences Your account says before and
// after asking the service. They're the ones Choose a username says (L-01),
// and the day a second change is allowed is said in the reader's own time
// zone. Node reads TZ when it changes, so this file sets New York's first.

import { beforeAll, expect, test } from "vitest";
import { USERNAME_SHAPE, usernameProblem, usernameTaken } from "../src/signIn/usernameRules.ts";
import { monthDay } from "../src/when.ts";

beforeAll(() => {
  process.env.TZ = "America/New_York";
});

test("L-01, L-04: a name of the wrong shape, a reserved one, and a taken one each get the sentence Choose a username uses", () => {
  expect(USERNAME_SHAPE).toBe("Use 3 to 20 letters, numbers, or underscores.");
  for (const name of ["ab", "lin.zhao", "sam reyes", "a".repeat(21), ""]) expect(usernameProblem(name), name).toBe(USERNAME_SHAPE);
  expect(usernameProblem("admin")).toBe("admin is reserved.");
  expect(usernameProblem("lin_zhao")).toBe("");
  expect(usernameTaken("lin_zhao")).toBe("lin_zhao is taken.");
});

test("L-04: the day a second change is allowed is said as the month and day, in the reader's time zone", () => {
  expect(monthDay("2026-12-24T12:00:00.000Z")).toBe("Dec 24");
  // Half past midnight in London is still the evening before in New York.
  expect(monthDay("2026-12-25T00:30:00.000Z")).toBe("Dec 24");
});
