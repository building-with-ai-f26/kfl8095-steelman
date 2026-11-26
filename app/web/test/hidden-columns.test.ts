import { afterEach, expect, test, vi } from "vitest";
import type { ArgumentRow, OptionRow, ReaderView, VersionRow } from "@steelman/shared";
import { argumentCount, argumentsLabel, firstVisible, hiddenOf, readHidden, saveHidden } from "../src/board/hidden-columns.ts";
import { tourSteps } from "../src/board/tour-steps.ts";

// Which columns a reader has hidden (M3d-6, A-08), as the prototype's
// isHidden and firstVisible decide it (docs/prototype/source/steelman-refined.html):
// an option counts as hidden only while another option is showing, so at
// least one column always shows, and only options on the board count. It is
// kept for each board in this browser's storage, inside try and catch, and
// the tour skips hidden columns, as the prototype's tourSteps does.

const option = (id: string, position: number): OptionRow => ({ id, name: id, position, deleted: false, changedSeq: 1 });
const OPTIONS = [option("yes", 1), option("no", 2), option("maybe", 3)];

/** A stand-in for the browser's localStorage, which the web tests' Node doesn't have. */
function storage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

afterEach(() => vi.unstubAllGlobals());

test("M3d-6, A-08: an option counts as hidden only while another one shows, and only options on the board count", () => {
  expect([...hiddenOf(OPTIONS, ["yes"], false)]).toEqual(["yes"]);
  expect([...hiddenOf(OPTIONS, ["yes", "no"], false)]).toEqual(["yes", "no"]);
  // Every column saved as hidden: none is, as the prototype's isHidden asks for another visible one.
  expect([...hiddenOf(OPTIONS, ["yes", "no", "maybe"], false)]).toEqual([]);
  // An option that's gone from the board (deleted elsewhere) is ignored.
  expect([...hiddenOf(OPTIONS, ["gone", "yes"], false)]).toEqual(["yes"]);
  expect([...hiddenOf(OPTIONS.slice(0, 2), ["yes", "maybe"], false)]).toEqual(["yes"]);
});

test("M3d-6, A-08: at 640 px and narrower, hidden columns are ignored", () => {
  expect([...hiddenOf(OPTIONS, ["yes"], true)]).toEqual([]);
});

test("M3d-6, A-08: the first visible column is the first option, by position, that isn't hidden", () => {
  expect(firstVisible(OPTIONS, new Set())).toBe("yes");
  expect(firstVisible(OPTIONS, new Set(["yes"]))).toBe("no");
  expect(firstVisible(OPTIONS, new Set(["yes", "no"]))).toBe("maybe");
  expect(firstVisible([option("b", 2), option("a", 1)], new Set())).toBe("a");
});

test("M3d-6, A-08: the strip counts the option's arguments that are neither deleted nor combined, as the list does", () => {
  const argument = (id: string, extra: Partial<ArgumentRow> = {}) => ({ id, optionId: "yes", deleted: false, mergedInto: null, ...extra }) as ArgumentRow;
  const view = {
    rows: { arguments: { a1: argument("a1"), a2: argument("a2", { mergedInto: "a1" }), a3: argument("a3", { deleted: true }), a4: argument("a4") } },
    shown: { arguments: { yes: ["a1", "a2", "a3", "a4"], no: [] } },
  } as unknown as ReaderView;
  expect(argumentCount(view, "yes")).toBe(2);
  expect(argumentCount(view, "no")).toBe(0);
  expect(argumentsLabel(1)).toBe("1 argument");
  expect(argumentsLabel(12)).toBe("12 arguments");
  expect(argumentsLabel(0)).toBe("0 arguments");
});

test("M3d-6, A-08: hidden columns are kept for each board in this browser, and nothing is kept once none is hidden", () => {
  const store = storage();
  vi.stubGlobal("localStorage", store);
  expect(readHidden("b1")).toEqual([]);
  saveHidden("b1", ["yes"]);
  expect(store.getItem("steelman-hidden-columns:b1")).toBe('["yes"]');
  expect(readHidden("b1")).toEqual(["yes"]);
  expect(readHidden("b2")).toEqual([]);
  saveHidden("b1", []);
  expect(store.length).toBe(0);
  // Something else written under the key reads as nothing hidden.
  store.setItem("steelman-hidden-columns:b1", '{"yes":true}');
  expect(readHidden("b1")).toEqual([]);
  store.setItem("steelman-hidden-columns:b1", "not json");
  expect(readHidden("b1")).toEqual([]);
  store.setItem("steelman-hidden-columns:b1", '["yes", 3]');
  expect(readHidden("b1")).toEqual(["yes"]);
});

test("M3d-6, A-08: when storage is blocked, nothing is hidden and nothing throws", () => {
  const blocked = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  vi.stubGlobal("localStorage", blocked);
  expect(readHidden("b1")).toEqual([]);
  expect(() => saveHidden("b1", ["yes"])).not.toThrow();
  expect(() => saveHidden("b1", [])).not.toThrow();
  vi.stubGlobal("localStorage", undefined);
  expect(readHidden("b1")).toEqual([]);
});

test("M3d-6, A-08, L-02: the tour skips hidden columns, as the prototype's tourSteps does", () => {
  const argument = (id: string, optionId: string): ArgumentRow => ({ id, optionId, createdSeq: 1, importance: 0, importanceVoters: 0, deleted: false, mergedInto: null, changedSeq: 1, myVote: null });
  const version = (id: string, argumentId: string): VersionRow =>
    ({ id, argumentId, authorId: "ana", authorName: "ana", createdSeq: 1, rev: 1, wording: `Wording ${id}.`, context: "", previousWording: null, votesBefore: null, sourceIds: [], articulation: 0, articulationVoters: 0, yes: 0, no: 0, deleted: false, hidden: false, hiddenReason: null, changedSeq: 1, myVote: null, myAssessment: null, myReport: null, reports: null }) as unknown as VersionRow;
  const shown = { arguments: { yes: ["a1"], no: ["a2"] }, versions: { a1: ["v1", "v2"], a2: ["v3"] } };
  const view = {
    seq: 1,
    rows: {
      options: { yes: option("yes", 1), no: option("no", 2) },
      arguments: { a1: argument("a1", "yes"), a2: argument("a2", "no") },
      versions: { v1: version("v1", "a1"), v2: version("v2", "a1"), v3: version("v3", "a2") },
    },
    published: shown,
    shown,
  } as unknown as ReaderView;

  expect(tourSteps(view).map((step) => step.optionId)).toEqual(["yes", "yes", "yes"]);
  expect(tourSteps(view, new Set(["yes"])).map((step) => `${step.kind}:${step.argumentId}`)).toEqual(["importance:a2", "evidence:a2"]);
  expect(tourSteps(view, new Set())).toEqual(tourSteps(view));
});
