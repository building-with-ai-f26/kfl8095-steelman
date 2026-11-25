import { describe, expect, test } from "vitest";
import type { BoardRows, CommentRow, OptionRow, VersionRow } from "@steelman/shared";
import { boardPath, commentPath, readLink, versionPath } from "../src/links.ts";
import { COMMENT_DELETED, SUBJECT_REMOVED, commentLanding } from "../src/board/comment-link.ts";

// A comment's address (M3b-13, D-01, M-06): /b/<board>/c/<comment>, beside
// the version's, and where a link to one lands. links.test.ts, which holds
// the board's and the version's addresses, is left as it was: a comment key
// appears only on a comment's link.

describe("a comment's address", () => {
  test("D-01, M-06: a comment's address names its board and the comment, and no version", () => {
    expect(readLink("/b/demo-board-1/c/AbC_-0123456789xyzQW")).toEqual({ kind: "board", board: "demo-board-1", version: null, comment: "AbC_-0123456789xyzQW" });
    expect(readLink("/b/demo-board-1/c/AbC_-0123456789xyzQW/")).toEqual({ kind: "board", board: "demo-board-1", version: null, comment: "AbC_-0123456789xyzQW" });
  });

  test("D-01, M-06: a board's and a version's address have no comment key at all", () => {
    expect(readLink("/b/demo-board-1")).not.toHaveProperty("comment");
    expect(readLink("/b/demo-board-1/v/v1")).not.toHaveProperty("comment");
  });

  test("D-01, M-06: an address under /c/ that can't be a comment is a board that doesn't exist", () => {
    for (const path of ["/b/x/c/", "/b/x/c/a/b", "/b/x/c/a/v/b", "/b/x/v/a/c/b", "/b/x/c/no such comment"]) expect(readLink(path), path).toEqual({ kind: "unknown" });
  });

  test("D-01, M-06: the comment address the app writes reads back as what it names", () => {
    expect(commentPath("demo-board-1", "c1")).toBe("/b/demo-board-1/c/c1");
    expect(readLink(commentPath("demo-board-1", "c1"))).toEqual({ kind: "board", board: "demo-board-1", version: null, comment: "c1" });
    // Beside the others, not instead of them.
    expect(boardPath("demo-board-1")).toBe("/b/demo-board-1");
    expect(versionPath("demo-board-1", "v1")).toBe("/b/demo-board-1/v/v1");
  });
});

const option = (id: string, extra: Partial<OptionRow> = {}): OptionRow => ({ id, name: id, position: 1, deleted: false, changedSeq: 1, ...extra });
const version = (id: string, extra: Partial<VersionRow> = {}): VersionRow => ({
  id,
  argumentId: "a",
  authorId: "ana",
  authorName: "ana",
  createdSeq: 1,
  rev: 1,
  wording: `Wording ${id}`,
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
const comment = (id: string, extra: Partial<CommentRow> = {}): CommentRow => ({
  id,
  optionId: null,
  versionId: null,
  parentId: null,
  authorId: "ben",
  authorName: "ben",
  body: `Comment ${id}`,
  createdAt: "2026-11-24T12:00:00.000Z",
  resolved: false,
  deleted: false,
  hidden: false,
  changedSeq: 1,
  ...extra,
});
const rows = (comments: CommentRow[]): BoardRows => ({
  options: { yes: option("yes"), gone: option("gone", { deleted: true }) },
  arguments: {},
  versions: { v1: version("v1"), hidden: version("hidden", { hidden: true }), deleted: version("deleted", { deleted: true, wording: null }) },
  sources: {},
  comments: Object.fromEntries(comments.map((c) => [c.id, c])),
});

describe("where a comment's link lands", () => {
  test("D-01, M-06: a comment on the question, an option, or a wording opens its own thread there", () => {
    const held = rows([comment("q"), comment("o", { optionId: "yes" }), comment("w", { versionId: "v1" })]);

    expect(commentLanding(held, "q", null)).toEqual({ kind: "thread", target: "question", thread: "q", resolved: false });
    expect(commentLanding(held, "o", null)).toEqual({ kind: "thread", target: { optionId: "yes" }, thread: "o", resolved: false });
    expect(commentLanding(held, "w", null)).toEqual({ kind: "thread", target: { versionId: "v1" }, thread: "w", resolved: false });
  });

  test("D-01, M-06: a reply opens its thread, which is the first comment's, resolved when that one is", () => {
    const held = rows([comment("top", { versionId: "v1", resolved: true }), comment("re", { versionId: "v1", parentId: "top" })]);

    expect(commentLanding(held, "re", null)).toEqual({ kind: "thread", target: { versionId: "v1" }, thread: "top", resolved: true });
    expect(commentLanding(held, "top", null)).toEqual({ kind: "thread", target: { versionId: "v1" }, thread: "top", resolved: true });
  });

  test("D-01, M-06: a reply whose first comment was deleted still opens the thread, which reads on", () => {
    const held = rows([comment("top", { deleted: true, body: null }), comment("re", { parentId: "top" })]);

    expect(commentLanding(held, "re", null)).toEqual({ kind: "thread", target: "question", thread: "top", resolved: false });
  });

  test("D-01, M-06: a deleted comment, a reply or a first comment, says the comment was deleted", () => {
    const held = rows([comment("top", { deleted: true, body: null }), comment("re", { parentId: "top" }), comment("gone", { parentId: "top", deleted: true, body: null })]);

    expect(commentLanding(held, "top", null)).toEqual({ kind: "note", note: COMMENT_DELETED });
    expect(commentLanding(held, "gone", null)).toEqual({ kind: "note", note: COMMENT_DELETED });
  });

  test("D-01, M-06: a reply whose thread the reader doesn't hold says the comment was deleted", () => {
    expect(commentLanding(rows([comment("re", { parentId: "missing" })]), "re", null)).toEqual({ kind: "note", note: COMMENT_DELETED });
  });

  test("D-01, M-06: a comment held whose wording was deleted or hidden, or whose option was deleted, says its subject was removed", () => {
    const held = rows([comment("d", { versionId: "deleted" }), comment("h", { versionId: "hidden" }), comment("o", { optionId: "gone" }), comment("unheld", { versionId: "nowhere" })]);

    for (const id of ["d", "h", "o", "unheld"]) expect(commentLanding(held, id, null), id).toEqual({ kind: "note", note: SUBJECT_REMOVED });
  });

  test("D-01, M-06: a deleted comment on a removed subject says the comment was deleted, which comes first", () => {
    expect(commentLanding(rows([comment("d", { versionId: "deleted", deleted: true, body: null })]), "d", null)).toEqual({ kind: "note", note: COMMENT_DELETED });
  });

  test("D-01, M-06: a comment the reader doesn't hold takes the service's word: subject removed, or else deleted", () => {
    const none = rows([]);

    expect(commentLanding(none, "x", "subject_removed")).toEqual({ kind: "note", note: SUBJECT_REMOVED });
    expect(commentLanding(none, "x", "deleted")).toEqual({ kind: "note", note: COMMENT_DELETED });
    // Added after the board was read, or not asked about: the reader can't open what they don't hold.
    expect(commentLanding(none, "x", "stands")).toEqual({ kind: "note", note: COMMENT_DELETED });
    expect(commentLanding(none, "x", null)).toEqual({ kind: "note", note: COMMENT_DELETED });
  });

  test("D-01, M-06: the notes are plain sentences, with the app's curly apostrophe", () => {
    expect(COMMENT_DELETED).toBe("That comment was deleted.");
    expect(SUBJECT_REMOVED).toBe("That comment’s subject was removed.");
  });
});
