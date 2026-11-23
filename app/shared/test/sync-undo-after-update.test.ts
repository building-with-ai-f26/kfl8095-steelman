import { describe, expect, test } from "vitest";
import { openView, pillCount, pressUpdate, putBack, receive, showMoved } from "@steelman/shared";
import type { ArgumentRow, BoardChanges, BoardSnapshot, OptionRow, VersionRow } from "@steelman/shared";

// Undo of the reader's own combine after they pressed Update (the M3a audit,
// Nov 22). The Undo bar keeps the screen from before the combine, and
// `putBack` draws it again: right when nothing else changed, wrong once
// Update has redrawn the board, since it brings back the old order and the
// markers Update cleared. The board (session.ts) then uses `showMoved`
// instead, which moves only the wording. These pin both halves of that.

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
  hiddenReason: null,
  changedSeq: createdSeq,
  myVote: null,
  myAssessment: null,
  myReport: null,
  reports: null,
  ...extra,
});

/** Three arguments in one option, shown in the order a, b, c, with a having two wordings. */
const snapshot = (): BoardSnapshot => ({
  board: { id: "board", question: "Q?", closed: false, seq: 5 },
  options: [option("yes", 1), option("no", 2)],
  arguments: [argument("a", "yes", 1), argument("b", "yes", 2), argument("c", "yes", 3)],
  versions: [version("a1", "a", 1), version("a2", "a", 1), version("b1", "b", 2), version("c1", "c", 3)],
  sources: [],
  order: { arguments: { yes: ["a", "b", "c"], no: [] }, versions: { a: ["a1", "a2"], b: ["b1"], c: ["c1"] } },
});
const nothing = (seq: number): BoardChanges => ({ seq, options: [], arguments: [], versions: [], sources: [], order: null, log: [] });

/**
 * The reader's screen through the steps: a newer shared order arrives (c first) with someone's delete of b1; the
 * reader combines a1 into c; presses Update; then their Undo is taken, and the rows say a1 is back in a.
 */
function afterUpdateAndUndo() {
  const opened = openView(snapshot());
  const waiting = receive(opened, {
    ...nothing(6),
    arguments: [argument("b", "yes", 2, { deleted: true, changedSeq: 6 })],
    versions: [version("b1", "b", 2, { deleted: true, wording: null, changedSeq: 6 })],
    order: { arguments: { yes: ["c", "a"], no: [] }, versions: { a: ["a1", "a2"], c: ["c1"] } },
  });
  const beforeCombine = waiting.shown;
  const combined = showMoved(receive(waiting, { ...nothing(7), versions: [version("a1", "c", 1, { changedSeq: 7 })] }), "a1");
  const updated = pressUpdate(combined);
  const undone = receive(updated, { ...nothing(8), versions: [version("a1", "a", 1, { changedSeq: 8 })] });
  return { waiting, beforeCombine, updated, undone };
}

describe("undoing the reader's own combine after they pressed Update", () => {
  test("A-10, J-05, M-02: before Update, two changes wait, and Update draws the newest order without the deleted row", () => {
    const { waiting, updated } = afterUpdateAndUndo();

    expect(pillCount(waiting)).toBeGreaterThan(0);
    expect(updated.shown.arguments.yes).toEqual(["c", "a"]);
    expect(pillCount(updated)).toBe(0);
  });

  test("A-10, J-05, M-02: showing only the wording back keeps the order Update drew, with nothing waiting", () => {
    const { undone } = afterUpdateAndUndo();

    const after = showMoved(undone, "a1");

    expect(after.shown.arguments.yes).toEqual(["c", "a"]);
    expect(after.shown.versions.a).toEqual(["a1", "a2"]);
    expect(after.shown.versions.c).toEqual(["c1"]);
    expect(pillCount(after)).toBe(0);
  });

  test("A-10, J-05, M-02: the screen kept from before the combine would bring back the old order and the deleted row, which is why it's dropped at Update", () => {
    const { undone, beforeCombine } = afterUpdateAndUndo();

    const after = putBack(undone, beforeCombine);

    expect(after.shown.arguments.yes).toEqual(["a", "b", "c"]);
    expect(pillCount(after)).toBeGreaterThan(0);
  });
});
