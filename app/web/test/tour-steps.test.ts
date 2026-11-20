import { expect, test } from "vitest";
import type { ArgumentRow, OptionRow, ReaderView, VersionRow } from "@steelman/shared";
import { tourSteps } from "../src/board/tour-steps.ts";

// How the tour picks its examples from the board (L-02), as the prototype's
// tourSteps does: importance on the top argument of the first option that has
// one, articulation on the argument with the most wordings (only when one has
// two or more), and evidence on the leading wording with the most assessments.
// A hidden or deleted wording is never an example.

const option = (id: string, position: number): OptionRow => ({ id, name: id === "yes" ? "Yes" : "No", position, deleted: false, changedSeq: 1 });
const argument = (id: string, optionId: string, extra: Partial<ArgumentRow> = {}): ArgumentRow => ({
  id,
  optionId,
  createdSeq: 1,
  importance: 0,
  importanceVoters: 0,
  deleted: false,
  mergedInto: null,
  changedSeq: 1,
  myVote: null,
  ...extra,
});
const version = (id: string, argumentId: string, extra: Partial<VersionRow> = {}): VersionRow => ({
  id,
  argumentId,
  authorId: "ana",
  authorName: "ana",
  createdSeq: 1,
  rev: 1,
  wording: `Wording ${id}.`,
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

/** A board drawn as given: each option's arguments, and each argument's wordings, in order. */
function board(layout: Record<string, Record<string, VersionRow[]>>, arguments_: ArgumentRow[] = []): ReaderView {
  const options = Object.keys(layout).map((id, at) => option(id, at));
  const args = Object.entries(layout).flatMap(([optionId, rows]) => Object.keys(rows).map((id) => arguments_.find((a) => a.id === id) ?? argument(id, optionId)));
  const versions = Object.values(layout).flatMap((rows) => Object.values(rows).flat());
  const shown = {
    arguments: Object.fromEntries(Object.entries(layout).map(([optionId, rows]) => [optionId, Object.keys(rows)])),
    versions: Object.fromEntries(Object.values(layout).flatMap((rows) => Object.entries(rows).map(([id, vs]) => [id, vs.map((v) => v.id)]))),
  };
  return {
    seq: 1,
    rows: {
      options: Object.fromEntries(options.map((o) => [o.id, o])),
      arguments: Object.fromEntries(args.map((a) => [a.id, a])),
      versions: Object.fromEntries(versions.map((v) => [v.id, v])),
    },
    published: shown,
    shown,
  } as unknown as ReaderView;
}

test("L-02: on a board with every kind of example, the tour has three steps, in the prototype's order", () => {
  const view = board({
    yes: { a1: [version("v1", "a1")], a2: [version("v2", "a2"), version("v3", "a2")] },
    no: { a3: [version("v4", "a3", { yes: 3, no: 1 })] },
  });

  expect(tourSteps(view)).toEqual([
    { kind: "importance", argumentId: "a1", optionId: "yes", versionId: "v1", optionName: "Yes" },
    { kind: "articulation", argumentId: "a2", optionId: "yes", versionId: "v2", nextId: "v3", wordings: 2 },
    { kind: "evidence", argumentId: "a3", optionId: "no", versionId: "v4", yes: 3, no: 1 },
  ]);
});

test("L-02: with no argument that has two wordings, there's no articulation step", () => {
  const view = board({ yes: { a1: [version("v1", "a1")] }, no: {} });

  expect(tourSteps(view).map((step) => step.kind)).toEqual(["importance", "evidence"]);
});

test("L-02: with no arguments at all, there's nothing to point at, so no steps", () => {
  expect(tourSteps(board({ yes: {}, no: {} }))).toEqual([]);
});

test("L-02: an argument whose leading wording was hidden or deleted is never an example", () => {
  const view = board({
    yes: { a1: [version("v1", "a1", { hidden: true, hiddenReason: "spam", yes: 9 })], a2: [version("v2", "a2", { deleted: true, wording: null })], a3: [version("v3", "a3")] },
    no: {},
  });

  expect(tourSteps(view)).toEqual([
    { kind: "importance", argumentId: "a3", optionId: "yes", versionId: "v3", optionName: "Yes" },
    { kind: "evidence", argumentId: "a3", optionId: "yes", versionId: "v3", yes: 0, no: 0 },
  ]);
});

test("L-02: the articulation step doesn't compare a wording with a hidden one", () => {
  const view = board({ yes: { a1: [version("v1", "a1"), version("v2", "a1", { hidden: true, hiddenReason: "spam" })] }, no: {} });

  expect(tourSteps(view).map((step) => step.kind)).toEqual(["importance", "evidence"]);
});

test("L-02: a deleted argument is never an example", () => {
  const view = board({ yes: { a1: [version("v1", "a1")], a2: [version("v2", "a2")] }, no: {} }, [argument("a1", "yes", { deleted: true })]);

  expect(tourSteps(view)[0]).toMatchObject({ kind: "importance", argumentId: "a2" });
});
