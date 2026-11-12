import { describe, expect, test } from "vitest";
import { openView, pillCount, pressUpdate, receive } from "@steelman/shared";
import type { ArgumentRow, BoardChanges, BoardSnapshot, OptionRow, VersionRow } from "@steelman/shared";

// The browser's sync rules (plans/architecture.md §3), as pure functions so
// the simulation can run them without a browser. What's on screen is held
// still: new things join the end, changed rows update in place, and
// nothing moves until the reader presses Update.

const option = (id: string, position: number, extra: Partial<OptionRow> = {}): OptionRow => ({ id, name: id, position, deleted: false, changedSeq: 1, ...extra });
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
  ...extra,
});

const snapshot = (): BoardSnapshot => ({
  board: { id: "board", question: "Q?", closed: false, seq: 5 },
  options: [option("yes", 1), option("no", 2)],
  arguments: [argument("a", "yes", 1), argument("b", "yes", 2), argument("c", "yes", 3), argument("n", "no", 1)],
  versions: [version("a1", "a", 1), version("a2", "a", 1), version("b1", "b", 2), version("c1", "c", 3), version("n1", "n", 1)],
  sources: [],
  order: { arguments: { yes: ["b", "a", "c"], no: ["n"] }, versions: { a: ["a2", "a1"], b: ["b1"], c: ["c1"], n: ["n1"] } },
});

const nothing = (seq: number): BoardChanges => ({ seq, options: [], arguments: [], versions: [], sources: [], order: null, log: [] });

describe("opening a board", () => {
  test("M-02, B-05: draws the board in the published order", () => {
    const view = openView(snapshot());

    expect(view.seq).toBe(5);
    expect(view.shown).toEqual(snapshot().order);
    expect(pillCount(view)).toBe(0);
  });

  test("M-02: arguments and wordings the order doesn't have yet go at the end, in the order they were added", () => {
    const s = snapshot();
    s.arguments.push(argument("d", "yes", 6), argument("e", "yes", 7));
    s.versions.push(version("d1", "d", 6), version("e1", "e", 7), version("a3", "a", 7));

    const view = openView(s);

    expect(view.shown.arguments.yes).toEqual(["b", "a", "c", "d", "e"]);
    expect(view.shown.versions.a).toEqual(["a2", "a1", "a3"]);
  });

  test("M-02: deleted things aren't drawn", () => {
    const s = snapshot();
    s.arguments[2] = argument("c", "yes", 3, { deleted: true });
    s.versions[0] = version("a1", "a", 1, { deleted: true, wording: null });

    const view = openView(s);

    expect(view.shown.arguments.yes).toEqual(["b", "a"]);
    expect(view.shown.versions.a).toEqual(["a2"]);
    expect(view.shown.versions.c).toBeUndefined();
  });
});

describe("receiving changes", () => {
  test("M-02: new counts update in place; nothing moves", () => {
    const view = openView(snapshot());

    const after = receive(view, { ...nothing(6), arguments: [argument("c", "yes", 3, { importance: 5, importanceVoters: 5, changedSeq: 6 })] });

    expect(after.rows.arguments.c?.importance).toBe(5);
    expect(after.shown).toEqual(view.shown);
    expect(after.seq).toBe(6);
  });

  test("M-02: a new argument joins the end of its column; a new wording joins the end of its row", () => {
    const view = openView(snapshot());

    const after = receive(view, { ...nothing(6), arguments: [argument("z", "no", 6)], versions: [version("z1", "z", 6), version("b2", "b", 6)] });

    expect(after.shown.arguments.no).toEqual(["n", "z"]);
    expect(after.shown.versions.z).toEqual(["z1"]);
    expect(after.shown.versions.b).toEqual(["b1", "b2"]);
    expect(after.shown.arguments.yes).toEqual(view.shown.arguments.yes);
  });

  test("M-02: a deleted wording keeps its place, marked, and counts toward the pill", () => {
    const view = openView(snapshot());

    const after = receive(view, { ...nothing(6), versions: [version("a2", "a", 1, { deleted: true, wording: null, changedSeq: 6 })] });

    expect(after.shown.versions.a).toEqual(["a2", "a1"]);
    expect(after.rows.versions.a2?.deleted).toBe(true);
    expect(pillCount(after)).toBe(1);
  });

  test("M-02: an argument deleted with its last wording counts once", () => {
    const view = openView(snapshot());

    const after = receive(view, {
      ...nothing(6),
      arguments: [argument("c", "yes", 3, { deleted: true, changedSeq: 6 })],
      versions: [version("c1", "c", 3, { deleted: true, wording: null, changedSeq: 6 })],
    });

    expect(after.shown.arguments.yes).toEqual(["b", "a", "c"]);
    expect(pillCount(after)).toBe(1);
  });

  test("B-05: a newer order is kept aside, and the pill counts the fewest moves to it", () => {
    const view = openView(snapshot());

    const after = receive(view, { ...nothing(6), order: { arguments: { yes: ["c", "b", "a"], no: ["n"] }, versions: snapshot().order.versions } });

    expect(after.shown).toEqual(view.shown);
    expect(after.published.arguments.yes).toEqual(["c", "b", "a"]);
    expect(pillCount(after)).toBe(1);
  });

  test("M-02: receiving the same changes twice is the same as once", () => {
    const changes = { ...nothing(6), arguments: [argument("z", "no", 6)], versions: [version("z1", "z", 6)] };
    const once = receive(openView(snapshot()), changes);

    expect(receive(once, changes)).toEqual(once);
  });

  test("M-02: an answer older than what the reader holds is ignored", () => {
    const view = receive(openView(snapshot()), { ...nothing(8), arguments: [argument("c", "yes", 3, { importance: 5, importanceVoters: 5, changedSeq: 8 })] });

    const stale = receive(view, { ...nothing(7), arguments: [argument("c", "yes", 3, { importance: 1, importanceVoters: 1, changedSeq: 7 })] });

    expect(stale).toEqual(view);
  });
});

describe("pressing Update", () => {
  test("B-05: applies the order the browser is holding and drops what was deleted", () => {
    const view = receive(openView(snapshot()), {
      ...nothing(6),
      versions: [version("a2", "a", 1, { deleted: true, wording: null, changedSeq: 6 })],
      order: { arguments: { yes: ["c", "b", "a"], no: ["n"] }, versions: snapshot().order.versions },
    });

    const updated = pressUpdate(view);

    expect(updated.shown.arguments.yes).toEqual(["c", "b", "a"]);
    expect(updated.shown.versions.a).toEqual(["a1"]);
    expect(pillCount(updated)).toBe(0);
  });

  test("M-02: a reader who caught up and pressed Update sees what a newly arrived reader sees", () => {
    const changes: BoardChanges = {
      ...nothing(7),
      arguments: [argument("z", "no", 6)],
      versions: [version("z1", "z", 6), version("a2", "a", 1, { deleted: true, wording: null, changedSeq: 7 })],
      order: { arguments: { yes: ["c", "b", "a"], no: ["n"] }, versions: { ...snapshot().order.versions, a: ["a1", "a2"] } },
    };
    const caughtUp = pressUpdate(receive(openView(snapshot()), changes));

    const later = snapshot();
    later.board.seq = 7;
    later.arguments.push(argument("z", "no", 6));
    later.versions[1] = version("a2", "a", 1, { deleted: true, wording: null, changedSeq: 7 });
    later.versions.push(version("z1", "z", 6));
    later.order = changes.order!;

    expect(caughtUp).toEqual(openView(later));
  });
});
