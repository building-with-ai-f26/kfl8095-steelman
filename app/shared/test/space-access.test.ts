import { expect, test } from "vitest";
import { accessInput, boardSpaceInput, newBoardInput } from "../src/index.ts";

// Boards in a space (G-04, G-05, H-02, M3d-18; plans/architecture.md §7,
// point 4): General access gains "space", meaning everyone in the board's
// space at the link's role. A board is put in a space by its own write, so a
// new board can't be shared with everyone in a space it isn't in yet, and the
// space is named by an ID or cleared with null.

const SPACE = "s".repeat(20);

test("H-02, G-05: General access takes 'space' at each role a link may give, and nothing else is added", () => {
  for (const linkRole of ["viewer", "voter", "contributor"] as const) {
    expect(accessInput.safeParse({ general: "space", linkRole }).data).toEqual({ general: "space", linkRole });
  }
  for (const linkRole of ["editor", "owner", undefined]) expect(accessInput.safeParse({ general: "space", linkRole }).success, String(linkRole)).toBe(false);
  expect(accessInput.safeParse({ general: "space", linkRole: "voter", space: SPACE }).success).toBe(false);
  expect(accessInput.safeParse({ general: "everyone", linkRole: "voter" }).success).toBe(false);
  // The two older choices are as they were.
  expect(accessInput.safeParse({ general: "link", linkRole: "voter" }).success).toBe(true);
  expect(accessInput.safeParse({ general: "invited", linkRole: "voter" }).success).toBe(true);
});

test("G-05, H-02: a new board can't start shared with everyone in a space, since it isn't in one yet", () => {
  const board = { question: "Should our library open on Sundays?", options: ["Yes", "No"] };
  const refused = newBoardInput.safeParse({ ...board, access: { general: "space", linkRole: "voter" } });
  expect(refused.success).toBe(false);
  expect(refused.error?.issues.map((issue) => issue.path.join("."))).toEqual(["access.general"]);
  expect(newBoardInput.safeParse({ ...board, access: { general: "invited", linkRole: "voter" } }).success).toBe(true);
  expect(newBoardInput.safeParse(board).success).toBe(true);
});

test("G-05: a board's space is a space's ID, or null to take it out, and nothing else", () => {
  expect(boardSpaceInput.safeParse({ space: SPACE }).data).toEqual({ space: SPACE });
  expect(boardSpaceInput.safeParse({ space: null }).data).toEqual({ space: null });
  for (const space of ["short", "s".repeat(21), "has spaces in it 0000", 7, undefined]) expect(boardSpaceInput.safeParse({ space }).success, String(space)).toBe(false);
  expect(boardSpaceInput.safeParse({ space: SPACE, general: "space" }).success).toBe(false);
  expect(boardSpaceInput.safeParse({}).success).toBe(false);
});
