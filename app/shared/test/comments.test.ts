import { describe, expect, test } from "vitest";
import { openCount, subjectStands, threadsOn } from "../src/index.ts";
import type { BoardRows, CommentRow, OptionRow, VersionRow } from "../src/index.ts";

// A target's threads and its open count (D-01, M3b-10), as the prototype
// counts them: replies count; deleted comments and resolved threads don't;
// hidden ones do. A comment whose wording is deleted or hidden, or whose
// option is deleted, is left out, even for a reader who already holds it.

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
let made = 0;
const comment = (id: string, extra: Partial<CommentRow> = {}): CommentRow => ({
  id,
  optionId: null,
  versionId: null,
  parentId: null,
  authorId: "ben",
  authorName: "ben",
  body: `Comment ${id}`,
  // Each later than the last, so the order they were added is the order they were made.
  createdAt: new Date(Date.UTC(2026, 10, 24, 12, made++)).toISOString(),
  resolved: false,
  deleted: false,
  hidden: false,
  changedSeq: 1,
  ...extra,
});
const rows = (comments: CommentRow[], extra: Partial<BoardRows> = {}): BoardRows => ({
  options: { yes: option("yes"), gone: option("gone", { deleted: true }) },
  arguments: {},
  versions: { v1: version("v1"), hidden: version("hidden", { hidden: true }), deleted: version("deleted", { deleted: true, wording: null }) },
  sources: {},
  comments: Object.fromEntries(comments.map((c) => [c.id, c])),
  ...extra,
});

describe("the open count", () => {
  test("D-01: counts each first comment and each of its replies on the target, and nothing on another target", () => {
    const held = rows([
      comment("q1"),
      comment("q1r1", { parentId: "q1" }),
      comment("q1r2", { parentId: "q1" }),
      comment("q2"),
      comment("o1", { optionId: "yes" }),
      comment("v1", { versionId: "v1" }),
      comment("v1r1", { versionId: "v1", parentId: "v1" }),
    ]);

    expect(openCount(held, "question")).toBe(4);
    expect(openCount(held, { optionId: "yes" })).toBe(1);
    expect(openCount(held, { versionId: "v1" })).toBe(2);
    expect(openCount(held, { optionId: "other" })).toBe(0);
    expect(openCount(held, { versionId: "other" })).toBe(0);
  });

  test("D-01: a resolved thread adds nothing, its replies included", () => {
    const held = rows([comment("q1", { resolved: true }), comment("q1r1", { parentId: "q1" }), comment("q2")]);

    expect(openCount(held, "question")).toBe(1);
  });

  test("D-01: a deleted first comment adds nothing, but its replies still count; a deleted reply adds nothing", () => {
    const held = rows([comment("q1", { deleted: true, body: null }), comment("q1r1", { parentId: "q1" }), comment("q1r2", { parentId: "q1", deleted: true, body: null })]);

    expect(openCount(held, "question")).toBe(1);
  });

  test("D-01: a hidden comment counts, as the prototype counts it", () => {
    const held = rows([comment("q1", { hidden: true, body: null }), comment("q1r1", { parentId: "q1", hidden: true, body: null })]);

    expect(openCount(held, "question")).toBe(2);
  });

  test("D-01: comments on a wording deleted or hidden, on a deleted option, or on one the reader doesn't hold count nothing", () => {
    const held = rows([
      comment("h1", { versionId: "hidden" }),
      comment("d1", { versionId: "deleted" }),
      comment("g1", { optionId: "gone" }),
      comment("m1", { versionId: "missing" }),
      comment("n1", { optionId: "missing" }),
    ]);

    expect(openCount(held, { versionId: "hidden" })).toBe(0);
    expect(openCount(held, { versionId: "deleted" })).toBe(0);
    expect(openCount(held, { optionId: "gone" })).toBe(0);
    expect(openCount(held, { versionId: "missing" })).toBe(0);
    expect(openCount(held, { optionId: "missing" })).toBe(0);
  });

  test("D-01: a reader who holds no comments yet counts none", () => {
    expect(openCount(rows([]), "question")).toBe(0);
    // A view made without comments at all, as some older tests build one, counts none too.
    const older = { ...rows([]), comments: undefined } as unknown as BoardRows;
    expect(openCount(older, "question")).toBe(0);
    expect(threadsOn(older, "question")).toEqual([]);
  });
});

describe("a target's threads", () => {
  test("D-01: each first comment on the target comes with its replies, both oldest first", () => {
    const first = comment("t1");
    const second = comment("t2");
    const reply1 = comment("r1", { parentId: "t1" });
    const reply2 = comment("r2", { parentId: "t1" });
    const elsewhere = comment("o1", { optionId: "yes" });
    // Held in an order unlike the order they were added.
    const held = rows([reply2, second, elsewhere, reply1, first]);

    expect(threadsOn(held, "question")).toEqual([
      { comment: first, replies: [reply1, reply2] },
      { comment: second, replies: [] },
    ]);
    expect(threadsOn(held, { optionId: "yes" })).toEqual([{ comment: elsewhere, replies: [] }]);
  });

  test("D-01: comments made in the same moment come in the order of their IDs", () => {
    const at = "2026-11-24T12:00:00.000Z";
    const b = comment("b", { createdAt: at });
    const a = comment("a", { createdAt: at });

    expect(threadsOn(rows([b, a]), "question").map((thread) => thread.comment.id)).toEqual(["a", "b"]);
  });

  test("D-01: a resolved thread and a hidden comment stay among the threads, marked", () => {
    const resolved = comment("t1", { resolved: true });
    const hidden = comment("t2", { hidden: true, body: null });

    expect(threadsOn(rows([resolved, hidden]), "question")).toEqual([
      { comment: resolved, replies: [] },
      { comment: hidden, replies: [] },
    ]);
  });

  test("D-01: a deleted reply is left out, and so is a deleted first comment with no reply left, which departs from the prototype when the replies were deleted after it", () => {
    const kept = comment("t1", { deleted: true, body: null });
    const reply = comment("r1", { parentId: "t1" });
    const deletedReply = comment("r2", { parentId: "t1", deleted: true, body: null });
    const alone = comment("t2", { deleted: true, body: null });
    const emptied = comment("t3", { deleted: true, body: null });
    const emptiedReply = comment("r3", { parentId: "t3", deleted: true, body: null });

    expect(threadsOn(rows([kept, reply, deletedReply, alone, emptied, emptiedReply]), "question")).toEqual([{ comment: kept, replies: [reply] }]);
  });

  test("D-01: a wording deleted or hidden, or an option deleted, has no threads for a reader who already holds its comments", () => {
    const held = rows([comment("h1", { versionId: "hidden" }), comment("d1", { versionId: "deleted" }), comment("g1", { optionId: "gone" })]);

    expect(threadsOn(held, { versionId: "hidden" })).toEqual([]);
    expect(threadsOn(held, { versionId: "deleted" })).toEqual([]);
    expect(threadsOn(held, { optionId: "gone" })).toEqual([]);
  });
});

describe("whether a comment's subject stands", () => {
  test("D-01: the question always stands; a wording stands unless deleted or hidden; an option unless deleted; one not held doesn't", () => {
    const held = rows([]);

    expect(subjectStands(held, comment("q"))).toBe(true);
    expect(subjectStands(held, comment("v", { versionId: "v1" }))).toBe(true);
    expect(subjectStands(held, comment("o", { optionId: "yes" }))).toBe(true);
    expect(subjectStands(held, comment("h", { versionId: "hidden" }))).toBe(false);
    expect(subjectStands(held, comment("d", { versionId: "deleted" }))).toBe(false);
    expect(subjectStands(held, comment("g", { optionId: "gone" }))).toBe(false);
    expect(subjectStands(held, comment("mv", { versionId: "missing" }))).toBe(false);
    expect(subjectStands(held, comment("mo", { optionId: "missing" }))).toBe(false);
  });

  test("D-01: a wording both deleted and hidden doesn't stand, and one restored stands again", () => {
    const both = rows([], { versions: { v: version("v", { deleted: true, hidden: true }) } });
    const restored = rows([], { versions: { v: version("v") } });

    expect(subjectStands(both, comment("c", { versionId: "v" }))).toBe(false);
    expect(subjectStands(restored, comment("c", { versionId: "v" }))).toBe(true);
  });
});
