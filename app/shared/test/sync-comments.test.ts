import { describe, expect, test } from "vitest";
import { openView, pressUpdate, receive } from "../src/index.ts";
import type { ArgumentRow, BoardChanges, BoardSnapshot, CommentRow, OptionRow, VersionRow } from "../src/index.ts";

// Comments in the browser's sync rules (D-01, M3b-10): a comment row merges
// by its ID, as every other row does, so an answer received twice or out of
// order changes nothing, and comments never move what's on screen.

const option = (id: string, position: number): OptionRow => ({ id, name: id, position, deleted: false, changedSeq: 1 });
const argument = (id: string, optionId: string): ArgumentRow => ({ id, optionId, createdSeq: 1, importance: 0, importanceVoters: 0, deleted: false, mergedInto: null, changedSeq: 1, myVote: null });
const version = (id: string, argumentId: string): VersionRow => ({
  id,
  argumentId,
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
});
const comment = (id: string, changedSeq: number, extra: Partial<CommentRow> = {}): CommentRow => ({
  id,
  optionId: null,
  versionId: "a1",
  parentId: null,
  authorId: "ben",
  authorName: "ben",
  body: "Which survey is this from?",
  createdAt: "2026-11-24T12:00:00.000Z",
  resolved: false,
  deleted: false,
  hidden: false,
  changedSeq,
  ...extra,
});

const snapshot = (comments?: CommentRow[]): BoardSnapshot => ({
  board: { id: "board", question: "Q?", closed: false, seq: 5 },
  options: [option("yes", 1), option("no", 2)],
  arguments: [argument("a", "yes"), argument("n", "no")],
  versions: [version("a1", "a"), version("n1", "n")],
  sources: [],
  order: { arguments: { yes: ["a"], no: ["n"] }, versions: { a: ["a1"], n: ["n1"] } },
  ...(comments ? { comments } : {}),
});
const answer = (seq: number, comments?: CommentRow[]): BoardChanges => ({ seq, options: [], arguments: [], versions: [], sources: [], order: null, log: [], ...(comments ? { comments } : {}) });

describe("comments in a reader's rows", () => {
  test("D-01, M-02: the snapshot's comments are held by ID, and a snapshot with none holds none", () => {
    expect(openView(snapshot([comment("c1", 3)])).rows.comments).toEqual({ c1: comment("c1", 3) });
    expect(openView(snapshot()).rows.comments).toEqual({});
  });

  test("D-01, M-02: a new comment is added, and a resolve or a delete replaces the row held", () => {
    let view = openView(snapshot([comment("c1", 3)]));

    view = receive(view, answer(6, [comment("c2", 6)]));
    expect(Object.keys(view.rows.comments).sort()).toEqual(["c1", "c2"]);

    view = receive(view, answer(7, [comment("c1", 7, { resolved: true })]));
    expect(view.rows.comments.c1).toEqual(comment("c1", 7, { resolved: true }));

    view = receive(view, answer(8, [comment("c2", 8, { deleted: true, body: null })]));
    expect(view.rows.comments.c2).toEqual(comment("c2", 8, { deleted: true, body: null }));
  });

  test("D-01, M-02: an answer with no comments keeps the comments held", () => {
    const view = receive(openView(snapshot([comment("c1", 3)])), answer(6));

    expect(view.rows.comments).toEqual({ c1: comment("c1", 3) });
  });

  test("D-01, M-02: an answer received twice changes nothing the second time", () => {
    const once = receive(openView(snapshot()), answer(6, [comment("c1", 6)]));
    const twice = receive(once, answer(6, [comment("c1", 6)]));

    expect(twice).toEqual(once);
  });

  test("D-01, M-02: an older answer arriving after a newer one changes nothing", () => {
    const newer = receive(openView(snapshot()), answer(7, [comment("c1", 7, { resolved: true })]));
    const late = receive(newer, answer(6, [comment("c1", 6)]));

    expect(late).toEqual(newer);
    expect(late.rows.comments.c1?.resolved).toBe(true);
  });

  test("D-01, M-02: comments never move what's on screen, and Update leaves them as they are", () => {
    const view = openView(snapshot());
    const after = receive(view, answer(6, [comment("c1", 6), comment("c2", 6, { versionId: null, optionId: "yes" })]));

    expect(after.shown).toEqual(view.shown);
    expect(pressUpdate(after).rows.comments).toEqual(after.rows.comments);
    expect(pressUpdate(after).shown).toEqual(view.shown);
  });
});
