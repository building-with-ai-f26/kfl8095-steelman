import { expect, test } from "vitest";
import { newBoardInput } from "../src/index.ts";

// New steelman's Space menu (G-05, F-01, M3d-19): a new board can start in a
// space the person is in, named by its ID, and only a board that starts in a
// space can start shared with everyone in it. The service checks that the
// person is in the space (boards.ts); the input only checks its shape.

const SPACE = "s".repeat(20);
const BOARD = { question: "Should our library open on Sundays?", options: ["Yes", "No"] };

test("G-05, F-01: a new board may name the space it starts in, and be shared with everyone in it", () => {
  expect(newBoardInput.safeParse({ ...BOARD, space: SPACE, access: { general: "space", linkRole: "voter" } }).data).toEqual({ ...BOARD, space: SPACE, access: { general: "space", linkRole: "voter" } });
  // In a space, it may still be open to anyone with the link, or to invited people only.
  for (const general of ["link", "invited"] as const) expect(newBoardInput.safeParse({ ...BOARD, space: SPACE, access: { general, linkRole: "contributor" } }).success, general).toBe(true);
  expect(newBoardInput.safeParse({ ...BOARD, space: SPACE }).success).toBe(true);
});

test("G-05, F-01: a space that isn't the shape of an ID is refused, and so is null", () => {
  for (const space of ["short", "s".repeat(21), "has spaces in it 0000", 7, null]) expect(newBoardInput.safeParse({ ...BOARD, space }).success, String(space)).toBe(false);
});

test("G-05, F-01: without a space, sharing with everyone in one is still refused, on General access, with a full sentence", () => {
  const refused = newBoardInput.safeParse({ ...BOARD, access: { general: "space", linkRole: "voter" } });
  expect(refused.success).toBe(false);
  expect(refused.error?.issues.map((issue) => issue.path.join("."))).toEqual(["access.general"]);
  expect(refused.error?.issues[0]?.message).toMatch(/^[A-Z][^.]* [a-z]+[^.]*\.$/);
});
