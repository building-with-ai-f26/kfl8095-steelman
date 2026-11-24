import { expect, test } from "vitest";
import type { VersionRow } from "@steelman/shared";
import { WHY, moderationItem, reportItem, versionMenu, whyNot } from "../src/board/display.ts";

// What a closed board does to a reader's controls (M3b-5, I-05): a control
// the service would refuse says "This board is closed.", after any reason
// the reader's role gives; and a menu offers only Copy link.

const version = (extra: Partial<VersionRow> = {}): VersionRow => ({
  id: "v1",
  argumentId: "a1",
  authorId: "ana",
  authorName: "ana",
  createdSeq: 1,
  rev: 3,
  wording: "Sunday is the only free day.",
  context: "",
  previousWording: null,
  votesBefore: null,
  sourceIds: [],
  articulation: 0,
  articulationVoters: 0,
  yes: 0,
  no: 0,
  deleted: false,
  hidden: false,
  hiddenReason: null,
  changedSeq: 1,
  myVote: null,
  myAssessment: null,
  myReport: null,
  reports: null,
  ...extra,
});

test("I-05: on a closed board, voting and writing say the board is closed", () => {
  expect(WHY.closed.why).toBe("This board is closed.");
  for (const role of ["voter", "contributor", "editor", "owner"] as const) expect(whyNot("ben", role, "vote", true), role).toBe(WHY.closed);
  for (const role of ["contributor", "editor", "owner"] as const) expect(whyNot("ben", role, "add", true), role).toBe(WHY.closed);
});

test("I-05: a role too low says so before the board being closed, as the service orders them", () => {
  expect(whyNot("ben", "viewer", "vote", true)).toBe(WHY.vote);
  expect(whyNot("ben", "voter", "add", true)).toBe(WHY.add);
});

test("I-05: on an open board nothing changes", () => {
  expect(whyNot("ben", "contributor", "vote", false)).toBeNull();
  expect(whyNot("ben", "contributor", "vote")).toBeNull();
});

test("I-05: on a closed board a wording's menu offers only Copy link, to its author, someone else, and the Owner", () => {
  expect(versionMenu(version(), "ana", "contributor", false, { others: true, last: false }, true)).toEqual(["copyLink"]);
  expect(versionMenu(version(), "ben", "contributor", false, { others: true, last: false }, true)).toEqual(["copyLink"]);
  expect(versionMenu(version(), "ben", "owner", true, { others: true, last: false }, true)).toEqual(["copyLink"]);
  expect(reportItem(version(), "ben", "contributor", true)).toEqual([]);
  expect(moderationItem(version(), "ben", "owner", true)).toEqual([]);
  expect(moderationItem(version({ hidden: true }), "ben", "owner", true)).toEqual([]);
});

test("I-05: on an open board the menus are as they were", () => {
  expect(versionMenu(version(), "ben", "owner", false, { others: true, last: false }, false)).toEqual(["copyLink", "suggest", "combine", "separate"]);
  expect(reportItem(version(), "ben", "contributor", false)).toEqual(["report"]);
  expect(moderationItem(version(), "ben", "owner", false)).toEqual(["hide"]);
});
