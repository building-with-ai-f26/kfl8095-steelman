import { expect, test } from "vitest";
import type { FoundSpace } from "@steelman/shared";
import { FIND_SPACES_PATH, readLink } from "../src/links.ts";
import { accessHint } from "../src/board/spaceAccess.ts";
import {
  VISIBILITY_SENTENCE,
  findSpacesEmpty,
  joinedSentence,
  leftSentence,
  makePublicQuestion,
  matchesSpace,
  peopleHiddenSentence,
  spaceSearchSentence,
  visibilityLabel,
  visibilitySaved,
} from "../src/spaces.ts";

// Public spaces on screen (G-07, G-01, G-05, M3d-20): the Find spaces
// address, its search, which filters in the browser by name and about text,
// the in-place question before a space is made public, with its counts, and
// the sentences said after a join, a leave, or a change of visibility. Every
// line a person reads is a full sentence (AGENTS.md rule 13).

const SENTENCE = /^[A-Z0-9][^]* [^]*[.?]$/;

const space = (name: string, about: string, members = 3): FoundSpace => ({ id: name.padEnd(20, "x").slice(0, 20), name, about, canvas: "stone", visibility: "public", members });

test("G-07, G-01: Find spaces has its own address, beside New space, and /spaces stays home", () => {
  expect(FIND_SPACES_PATH).toBe("/spaces/find");
  expect(readLink(FIND_SPACES_PATH)).toEqual({ kind: "find-spaces" });
  expect(readLink(`${FIND_SPACES_PATH}/`)).toEqual({ kind: "find-spaces" });
  expect(readLink("/spaces")).toEqual({ kind: "home" });
});

test("G-07: Search spaces filters by name and about text, ignoring capitals and the spaces around it", () => {
  const brooklyn = space("Brooklyn Streets", "Transit, housing, and street design");
  expect(matchesSpace(brooklyn, "")).toBe(true);
  expect(matchesSpace(brooklyn, "  brooklyn ")).toBe(true);
  expect(matchesSpace(brooklyn, "HOUSING")).toBe(true);
  expect(matchesSpace(brooklyn, "campus")).toBe(false);
  expect(spaceSearchSentence(0)).toBe("No spaces match that search.");
  expect(spaceSearchSentence(1)).toBe("1 space matches that search.");
  expect(spaceSearchSentence(4)).toBe("4 spaces match that search.");
});

test("G-07: the question before Make public counts the members and the steelmen that open, and says which stop being shared", () => {
  expect(makePublicQuestion("POD 6", { members: 12, shared: 4, unshared: 2 })).toEqual([
    "Anyone with a Steelman account can then join POD 6, which has 12 members, and open its 4 steelmen that are shared with everyone in the space, with their history and comments.",
    "The 2 steelmen that other members own stop being shared with the space, until their Owners share them again.",
  ]);
  expect(makePublicQuestion("POD 6", { members: 1, shared: 1, unshared: 1 })).toEqual([
    "Anyone with a Steelman account can then join POD 6, which has 1 member, and open its 1 steelman that is shared with everyone in the space, with its history and comments.",
    "The 1 steelman that another member owns stops being shared with the space, until its Owner shares it again.",
  ]);
  expect(makePublicQuestion("POD 6", { members: 2, shared: 0, unshared: 0 })).toEqual([
    "Anyone with a Steelman account can then join POD 6, which has 2 members, and open any steelman you share with everyone in the space, with its history and comments.",
  ]);
});

test("G-07, G-05: the visibility's words, and Share's hint on a board in a public space", () => {
  expect(visibilityLabel("private")).toBe("Private space");
  expect(visibilityLabel("public")).toBe("Public space");
  // A word the web doesn't know reads as private, which says the least.
  expect(visibilityLabel("open")).toBe("Private space");
  expect(VISIBILITY_SENTENCE).toEqual({ private: "Only members can find and open this space.", public: "Anyone with a Steelman account can find this space and join it." });
  expect(accessHint({ general: "space", linkRole: "contributor" }, "POD 6", "public")).toBe("Anyone with a Steelman account can join POD 6 and then find this steelman, vote, and write.");
  expect(accessHint({ general: "space", linkRole: "voter" }, "POD 6", "public")).toBe("Anyone with a Steelman account can join POD 6 and then find this steelman and vote.");
  expect(accessHint({ general: "space", linkRole: "viewer" }, "POD 6", "public")).toBe("Anyone with a Steelman account can join POD 6 and then find this steelman and read it.");
  // A private space's hint, and a board not shared with the space, read as before.
  expect(accessHint({ general: "space", linkRole: "voter" }, "POD 6")).toBe("Everyone in POD 6 can find this steelman and vote.");
  expect(accessHint({ general: "invited", linkRole: "voter" }, "POD 6", "public")).toBe("Only invited people can open it.");
});

test("G-07: every sentence said after a join, a leave, or a change of visibility is a full sentence", () => {
  const sentences = [
    joinedSentence("POD 6"),
    leftSentence("POD 6"),
    visibilitySaved("POD 6", "public"),
    visibilitySaved("POD 6", "private"),
    peopleHiddenSentence,
    findSpacesEmpty,
    ...Object.values(VISIBILITY_SENTENCE),
    ...makePublicQuestion("POD 6", { members: 3, shared: 2, unshared: 1 }),
  ];
  expect(joinedSentence("POD 6")).toBe("You joined POD 6.");
  expect(leftSentence("POD 6")).toBe("You left POD 6.");
  expect(visibilitySaved("POD 6", "public")).toBe("POD 6 is now public.");
  expect(visibilitySaved("POD 6", "private")).toBe("POD 6 is now private, and everyone who joined stays in it.");
  for (const sentence of sentences) expect(sentence).toMatch(SENTENCE);
});
