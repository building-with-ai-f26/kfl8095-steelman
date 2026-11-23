import { expect, test } from "vitest";
import type { VersionRow } from "@steelman/shared";
import { editShown, moderationItem, reportItem, versionMenu } from "../src/board/display.ts";

// What a version's ⋯ menu offers (A-12), by the reader's role and whether
// they wrote it, and how the reader's own edit shows before it's back (A-06).
// The service decides; the menu only offers what it would allow.

const version = (extra: Partial<VersionRow> = {}): VersionRow => ({
  id: "v1",
  argumentId: "a1",
  authorId: "ana",
  authorName: "ana",
  createdSeq: 1,
  rev: 3,
  wording: "Sunday is the only free day.",
  context: "Many work weekdays.",
  previousWording: null,
  votesBefore: null,
  sourceIds: ["s1"],
  articulation: 2,
  articulationVoters: 2,
  yes: 4,
  no: 1,
  deleted: false,
  hidden: false,
  hiddenReason: null,
  changedSeq: 1,
  myVote: null,
  myAssessment: true,
  myReport: null,
  reports: null,
  ...extra,
});

test("A-12: the author copies the link, edits, and deletes, with Delete last", () => {
  expect(versionMenu(version(), "ana", "contributor", false)).toEqual(["copyLink", "edit", "deleteVersion"]);
  expect(versionMenu(version(), "ana", "owner", false)).toEqual(["copyLink", "edit", "deleteVersion"]);
});

test("A-12: deleting a row's only wording deletes the argument, and says so", () => {
  expect(versionMenu(version(), "ana", "contributor", true)).toEqual(["copyLink", "edit", "deleteArgument"]);
});

test("A-12: someone else who may write suggests a revised version; nobody else edits or deletes it, the owner included", () => {
  expect(versionMenu(version(), "ben", "contributor", false)).toEqual(["copyLink", "suggest"]);
  expect(versionMenu(version(), "ben", "owner", true)).toEqual(["copyLink", "suggest"]);
});

test("A-12: a voter, or a reader with no role, only copies the link", () => {
  expect(versionMenu(version(), "ben", "voter", false)).toEqual(["copyLink"]);
  expect(versionMenu(version(), "ana", "voter", false)).toEqual(["copyLink"]);
  expect(versionMenu(version(), null, null, false)).toEqual(["copyLink"]);
});

test("A-06: the reader's own edit shows at once as the next revision, marked edited, with its credibility score reset", () => {
  const edit = { kind: "edit" as const, versionId: "v1", baseRev: 3, wording: "Sunday is the one free day.", context: "" };

  const shown = editShown(version(), [edit]);

  expect(shown).toMatchObject({ rev: 4, wording: "Sunday is the one free day.", context: "", previousWording: "Sunday is the only free day.", yes: 0, no: 0, myAssessment: null });
  expect(shown.articulation).toBe(2);
  expect(shown.sourceIds).toEqual(["s1"]);
});

test("A-06: as the service does, the wording before an edit is the one it replaced, even when only the context changed", () => {
  const edit = { kind: "edit" as const, versionId: "v1", baseRev: 3, wording: "Sunday is the only free day.", context: "New context." };

  expect(editShown(version({ previousWording: "First wording." }), [edit])).toMatchObject({ rev: 4, context: "New context.", previousWording: "Sunday is the only free day." });
});

test("A-06: once the edit is back, or for another version, the version shows as the service sent it", () => {
  const edit = { kind: "edit" as const, versionId: "v1", baseRev: 3, wording: "Changed.", context: "" };
  const back = version({ rev: 4, wording: "Changed.", context: "", yes: 0, no: 0 });

  expect(editShown(back, [edit])).toBe(back);
  expect(editShown(version({ id: "v2" }), [edit]).wording).toBe("Sunday is the only free day.");
});

test("M2-3, J-01: anyone who can read may report someone else's wording; nobody reports their own", () => {
  expect(reportItem(version(), "ben", "viewer")).toEqual(["report"]);
  expect(reportItem(version(), "ben", "editor")).toEqual(["report"]);
  expect(reportItem(version(), "ana", "contributor")).toEqual([]);
  expect(reportItem(version(), null, null)).toEqual([]);
});

test("M2-3, J-01: with their report open, the reader is offered Withdraw your report instead", () => {
  expect(reportItem(version({ myReport: "spam" }), "ben", "voter")).toEqual(["withdrawReport"]);
});

test("M2-4, J-02: an Editor and the Owner may hide someone else's wording, or restore a hidden one; nobody else, nothing deleted, and not their own", () => {
  expect(moderationItem(version(), "ben", "editor")).toEqual(["hide"]);
  expect(moderationItem(version({ authorId: "cy" }), "ana", "owner")).toEqual(["hide"]);
  expect(moderationItem(version(), "ana", "owner")).toEqual([]);
  expect(moderationItem(version({ hidden: true, hiddenReason: "spam" }), "ben", "editor")).toEqual(["restore"]);
  expect(moderationItem(version(), "ben", "contributor")).toEqual([]);
  expect(moderationItem(version({ deleted: true }), "ben", "editor")).toEqual([]);
});

test("M2-4, J-01: nobody is offered Report on a hidden wording", () => {
  expect(reportItem(version({ hidden: true, hiddenReason: "spam" }), "ben", "voter")).toEqual([]);
});

test("M2-5, A-06: the reader's own edit shows no vote counts from before it until the service has the edit, which says them", () => {
  const edit = { kind: "edit" as const, versionId: "v1", baseRev: 3, wording: "Sunday is the one free day.", context: "" };

  expect(editShown(version({ previousWording: "First wording.", votesBefore: { importance: 4, articulation: 2 } }), [edit]).votesBefore).toBeNull();
});

test("M3a-7, A-10: on the board, an Editor or the Owner also combines and separates, before Delete; a Contributor doesn't", () => {
  expect(versionMenu(version(), "ana", "owner", false, { others: true })).toEqual(["copyLink", "edit", "combine", "separate", "deleteVersion"]);
  expect(versionMenu(version(), "ana", "owner", true, { others: true })).toEqual(["copyLink", "edit", "combine", "deleteArgument"]);
  expect(versionMenu(version(), "ana", "owner", false, { others: false })).toEqual(["copyLink", "edit", "separate", "deleteVersion"]);
  expect(versionMenu(version(), "ana", "contributor", false, { others: true })).toEqual(["copyLink", "edit", "deleteVersion"]);
});
