import { describe, expect, test } from "vitest";
import { openView, receive, strongestCase } from "@steelman/shared";
import type { ArgumentRow, BoardChanges, BoardSnapshot, OptionRow, VersionRow } from "@steelman/shared";

// Strongest case (E-01): each option's top three arguments, each in its best
// wording, taken from the newest shared order the reader has been sent, not
// from the order on their screen (the builder's decision, Nov 15).

const option = (id: string, position: number): OptionRow => ({ id, name: id, position, deleted: false, changedSeq: 1 });
const argument = (id: string, optionId: string, createdSeq: number, extra: Partial<ArgumentRow> = {}): ArgumentRow => ({
  id,
  optionId,
  createdSeq,
  importance: 0,
  importanceVoters: 0,
  deleted: false,
  mergedInto: null,
  changedSeq: createdSeq,
  myVote: null,
  ...extra,
});
const version = (id: string, argumentId: string, createdSeq: number, extra: Partial<VersionRow> = {}): VersionRow => ({
  id,
  argumentId,
  authorId: "ana",
  authorName: "ana",
  createdSeq,
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
  changedSeq: createdSeq,
  myVote: null,
  myAssessment: null,
  myReport: null,
  reports: null,
  ...extra,
});

const snapshot = (): BoardSnapshot => ({
  board: { id: "board", question: "Q?", closed: false, seq: 5 },
  options: [option("yes", 1), option("no", 2)],
  arguments: [argument("a", "yes", 1), argument("b", "yes", 2), argument("c", "yes", 3), argument("d", "yes", 4), argument("n", "no", 1)],
  versions: [version("a1", "a", 1), version("a2", "a", 1), version("b1", "b", 2), version("c1", "c", 3), version("d1", "d", 4), version("n1", "n", 1)],
  sources: [],
  order: { arguments: { yes: ["b", "a", "c", "d"], no: ["n"] }, versions: { a: ["a2", "a1"], b: ["b1"], c: ["c1"], d: ["d1"], n: ["n1"] } },
});

const nothing = (seq: number): BoardChanges => ({ seq, options: [], arguments: [], versions: [], sources: [], order: null, log: [] });
const ids = (items: { argumentId: string; versionId: string }[]) => items.map((item) => `${item.argumentId}:${item.versionId}`);

describe("Strongest case", () => {
  test("E-01: an option's top three arguments, each in its best wording, with how many wordings it beat", () => {
    const yes = strongestCase(openView(snapshot()), "yes");

    expect(ids(yes.items)).toEqual(["b:b1", "a:a2", "c:c1"]);
    expect(yes.items.map((item) => item.wordings)).toEqual([1, 2, 1]);
    expect(yes.total).toBe(4);
  });

  test("E-01: follows the newest shared order, not the order on the reader's screen", () => {
    const view = receive(openView(snapshot()), {
      ...nothing(6),
      order: { arguments: { yes: ["d", "c", "b", "a"], no: ["n"] }, versions: { a: ["a1", "a2"], b: ["b1"], c: ["c1"], d: ["d1"], n: ["n1"] } },
    });

    // The board holds still until Update; the case doesn't wait.
    expect(view.shown.arguments.yes).toEqual(["b", "a", "c", "d"]);
    expect(ids(strongestCase(view, "yes").items)).toEqual(["d:d1", "c:c1", "b:b1"]);
    expect(ids(strongestCase({ ...view, published: { ...view.published, arguments: { yes: ["a", "b", "c", "d"], no: ["n"] } } }, "yes").items)[0]).toBe("a:a1");
  });

  test("E-01: leaves out deleted and combined arguments, and deleted or hidden wordings", () => {
    const s = snapshot();
    s.arguments[1] = argument("b", "yes", 2, { deleted: true });
    s.arguments[2] = argument("c", "yes", 3, { mergedInto: "a" });
    s.versions[1] = version("a2", "a", 1, { hidden: true });
    const view = receive(openView(snapshot()), { ...nothing(6), arguments: [s.arguments[1]!, s.arguments[2]!], versions: [s.versions[1]!] });

    const yes = strongestCase(view, "yes");
    expect(ids(yes.items)).toEqual(["a:a1", "d:d1"]);
    expect(yes.items[0]!.wordings).toBe(1);
    expect(yes.total).toBe(2);
  });

  test("E-01: an argument whose every wording is gone isn't in it", () => {
    const view = receive(openView(snapshot()), { ...nothing(6), versions: [version("b1", "b", 2, { deleted: true, wording: null })] });

    expect(ids(strongestCase(view, "yes").items)).toEqual(["a:a2", "c:c1", "d:d1"]);
  });

  test("E-01: arguments and wordings the shared order hasn't ranked yet come after those it has, in the order added", () => {
    const view = receive(openView(snapshot()), {
      ...nothing(6),
      arguments: [argument("m", "no", 6), argument("o", "no", 7)],
      versions: [version("m1", "m", 6), version("o1", "o", 7), version("n2", "n", 7)],
    });

    const no = strongestCase(view, "no");
    expect(ids(no.items)).toEqual(["n:n1", "m:m1", "o:o1"]);
    expect(no.items[0]!.wordings).toBe(2);
  });

  test("E-01, A-06: leaves out the reader's own deletions, held for Undo or on their way", () => {
    const yes = strongestCase(openView(snapshot()), "yes", ["b1", "a2"]);

    expect(ids(yes.items)).toEqual(["a:a1", "c:c1", "d:d1"]);
    expect(yes.total).toBe(3);
  });

  test("E-01: a side with no arguments has an empty case", () => {
    const s = snapshot();
    s.options.push(option("maybe", 3));
    s.order.arguments.maybe = [];

    expect(strongestCase(openView(s), "maybe")).toEqual({ items: [], total: 0 });
  });
});
