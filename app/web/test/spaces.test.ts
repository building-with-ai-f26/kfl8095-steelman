import { expect, test } from "vitest";
import type { BoardListing } from "@steelman/shared";
import { NEW_SPACE_PATH, readLink, spacePath, spaceSettingsPath } from "../src/links.ts";
import { boardsIn, canvasLabel, countsBySpace, helpEmpty, helpSentence, membersLabel, needsYourHelp } from "../src/spaces.ts";

// Spaces on screen (G-01, G-02, G-05, E-08, M3d-19): a space's address, the
// boards the sidebar counts and the list shows under it, the rail's "Needs
// your help", and the sentences they say. Each line a person reads is a full
// sentence (AGENTS.md rule 13), except the labels and counts beside a name.

const SPACE = "s".repeat(20);
const OTHER = "o".repeat(20);

const listing = (id: string, options: [string, number][], extra: Partial<BoardListing> = {}): BoardListing => ({
  id,
  question: `Question ${id}?`,
  options: options.map(([name, count]) => ({ name, arguments: count })),
  role: "contributor",
  owner: "maya.chen",
  changedAt: "2026-11-26T12:00:00.000Z",
  createdAt: "2026-11-26T11:00:00.000Z",
  comments: 0,
  ...extra,
});

test("G-01, G-02: a space's page, its settings, and New space have addresses that read back as what they name", () => {
  expect(readLink(spacePath(SPACE))).toEqual({ kind: "home", space: SPACE });
  expect(readLink(`${spacePath(SPACE)}/`)).toEqual({ kind: "home", space: SPACE });
  expect(readLink(spaceSettingsPath(SPACE))).toEqual({ kind: "space-settings", space: SPACE });
  expect(readLink(NEW_SPACE_PATH)).toEqual({ kind: "new-space" });
  // Home stays home, and nothing else under /s/ names a space.
  expect(readLink("/")).toEqual({ kind: "home" });
  expect(readLink("/somewhere")).toEqual({ kind: "home" });
  expect(readLink("/spaces")).toEqual({ kind: "home" });
  for (const path of ["/s", "/s/", "/s/short", `/s/${SPACE}/members`, `/s/${SPACE}x`]) expect(readLink(path), path).toEqual({ kind: "unknown" });
});

test("G-01, E-08: the sidebar counts each space's boards, and the list under a space shows only its boards", () => {
  const boards = [listing("a", [["Yes", 2]], { space: SPACE }), listing("b", [["Yes", 2]]), listing("c", [["Yes", 2]], { space: SPACE }), listing("d", [["Yes", 2]], { space: OTHER })];
  expect(countsBySpace(boards)).toEqual(new Map([[SPACE, 2], [OTHER, 1]]));
  expect(boardsIn(boards, SPACE).map((board) => board.id)).toEqual(["a", "c"]);
  expect(boardsIn(boards, null).map((board) => board.id)).toEqual(["a", "b", "c", "d"]);
});

test("E-08: Needs your help lists the space's boards with an option under two arguments, the thinnest first, at most four", () => {
  const boards = [
    listing("full", [["Yes", 2], ["No", 3]], { space: SPACE }),
    listing("one", [["Yes", 1], ["No", 3]], { space: SPACE }),
    listing("none", [["Yes", 0], ["No", 1]], { space: SPACE }),
    listing("elsewhere", [["Yes", 0], ["No", 0]], { space: OTHER }),
    listing("closed", [["Yes", 0], ["No", 0]], { space: SPACE, closing: { closed: true, closedAt: "2026-11-26T10:00:00.000Z", closesAt: null } }),
    // A Voter can't add an argument, so the rail doesn't ask them to.
    listing("voter", [["Yes", 0], ["No", 0]], { space: SPACE, role: "voter" }),
    listing("one-b", [["Yes", 1], ["No", 1]], { space: SPACE }),
    listing("one-c", [["Yes", 1], ["No", 2]], { space: SPACE }),
    listing("one-d", [["Yes", 1], ["No", 2]], { space: SPACE }),
  ];
  expect(needsYourHelp(boards, SPACE).map((board) => board.id)).toEqual(["none", "one", "one-b", "one-c"]);
  expect(needsYourHelp([boards[0]!], SPACE)).toEqual([]);
});

test("E-08, G-01: the rail's line under each board, the member count, and each canvas's name", () => {
  expect(helpSentence(listing("x", [["Yes", 1], ["No", 3]]))).toBe("Yes has one argument.");
  expect(helpSentence(listing("x", [["Yes", 4], ["No", 0]]))).toBe("No has no arguments yet.");
  expect(helpSentence(listing("x", [["Yes", 1], ["No", 0], ["Maybe", 5]]))).toBe("2 options have fewer than two arguments.");
  for (const board of [listing("x", [["Yes", 1], ["No", 3]]), listing("x", [["Yes", 1], ["No", 0]])]) expect(helpSentence(board)).toMatch(/^\S.* (has|have) .*\.$/);
  expect(membersLabel(1)).toBe("1 member");
  expect(membersLabel(1200)).toBe("1,200 members");
  expect(["stone", "cool", "sand", "slate", "sage", "lilac"].map((canvas) => canvasLabel(canvas as never))).toEqual(["Warm stone", "Cool gray", "Sand", "Slate", "Sage", "Lilac"]);
});

test("E-08: when Needs your help lists nothing, its sentence says every option has two arguments only when that's true", () => {
  const closed = { closing: { closed: true, closedAt: "2026-11-26T10:00:00.000Z", closesAt: null } };
  const full = listing("full", [["Yes", 2], ["No", 3]], { space: SPACE });
  expect(helpEmpty([full, listing("closed-full", [["Yes", 2], ["No", 2]], { space: SPACE, ...closed })], SPACE)).toBe("Every option here has at least two arguments.");
  // A thin board elsewhere doesn't count against this space.
  expect(helpEmpty([full, listing("elsewhere", [["Yes", 0]], { space: OTHER })], SPACE)).toBe("Every option here has at least two arguments.");
  // Every thin board is closed, or held as a Voter or a Viewer, so the rail lists nothing, and says why truly.
  for (const extra of [closed, { role: "voter" as const }, { role: "viewer" as const }]) {
    const boards = [full, listing("thin", [["Yes", 0], ["No", 1]], { space: SPACE, ...extra })];
    expect(needsYourHelp(boards, SPACE)).toEqual([]);
    expect(helpEmpty(boards, SPACE)).toBe("No steelman here needs an argument from you right now.");
  }
  for (const boards of [[full], [full, listing("thin", [["Yes", 0]], { space: SPACE, role: "voter" })]]) expect(helpEmpty(boards, SPACE)).toMatch(/^[A-Z][^]* [^]*\.$/);
});
