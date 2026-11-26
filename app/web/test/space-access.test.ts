// Who can get in, in words (H-02, G-05, M3d-18): the pill, Share's General
// access and its hint, and what is read out after a change. A board shared
// with everyone in its space names the space for its members and says "the
// space" to anyone else. Every line is a full sentence (AGENTS.md rule 13).

import { expect, test } from "vitest";
import { NO_SPACE_LABEL, accessAnnouncement, accessHint, generalLabel } from "../src/board/spaceAccess.ts";

test("G-05, H-02: the General access choices name the space for a member, and say 'the space' to anyone else", () => {
  expect(generalLabel("space", "POD 6")).toBe("Everyone in POD 6");
  expect(generalLabel("space", null)).toBe("Everyone in the space");
  expect(generalLabel("link", "POD 6")).toBe("Anyone with the link");
  expect(generalLabel("invited", "POD 6")).toBe("Invited only");
  expect(NO_SPACE_LABEL).toBe("Everyone in a space");
});

test("G-05, H-02: the hint is a sentence whose verb follows the space's role", () => {
  expect(accessHint({ general: "space", linkRole: "voter" }, "POD 6")).toBe("Everyone in POD 6 can find this steelman and vote.");
  expect(accessHint({ general: "space", linkRole: "viewer" }, "POD 6")).toBe("Everyone in POD 6 can find this steelman and read it.");
  expect(accessHint({ general: "space", linkRole: "contributor" }, "POD 6")).toBe("Everyone in POD 6 can find this steelman, vote, and write.");
  expect(accessHint({ general: "space", linkRole: "voter" }, null)).toBe("Everyone in the space can find this steelman and vote.");
});

test("H-02: the hints for the link and for invited people are as they were", () => {
  expect(accessHint({ general: "link", linkRole: "contributor" }, null)).toBe("Anyone with the link can read, vote, and write.");
  expect(accessHint({ general: "link", linkRole: "voter" }, null)).toBe("Anyone with the link can read and vote.");
  expect(accessHint({ general: "invited", linkRole: "voter" }, "POD 6")).toBe("Only invited people can open it.");
});

test("G-05, H-02: what is read out after a change is a sentence too", () => {
  expect(accessAnnouncement({ general: "space", linkRole: "voter" }, "POD 6")).toBe("Everyone in POD 6 can vote.");
  expect(accessAnnouncement({ general: "space", linkRole: "contributor" }, null)).toBe("Everyone in the space can contribute.");
  expect(accessAnnouncement({ general: "link", linkRole: "viewer" }, null)).toBe("Anyone with the link can view.");
  expect(accessAnnouncement({ general: "invited", linkRole: "viewer" }, null)).toBe("Only invited people can open it.");
});
