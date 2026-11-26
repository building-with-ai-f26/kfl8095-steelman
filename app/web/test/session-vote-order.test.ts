import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Access, ArgumentRow, BoardSnapshot, Standing } from "@steelman/shared";
import { readBoard, readChanges, send } from "../src/api.ts";
import type { Answer } from "../src/api.ts";
import { importanceShown } from "../src/board/display.ts";
import { BoardSession } from "../src/board/session.ts";

// A second press on the same arrow (B-01, M-15): the reader votes an argument
// more important and presses the arrow again to take the vote back. The first
// vote can come back from the service, and wait for the next read to show it,
// while the second is still queued or on its way. What the board shows is the
// reader's newest choice, so the second press must win over the first until
// the rows carry both, whichever answer comes first.

vi.mock("../src/api.ts", async (importOriginal) => ({ ...(await importOriginal<typeof import("../src/api.ts")>()), readBoard: vi.fn(), readChanges: vi.fn(), send: vi.fn() }));

const access: Access = { general: "link", linkRole: "contributor" };
const argument: ArgumentRow = { id: "a1", optionId: "yes", createdSeq: 2, importance: 1, importanceVoters: 1, deleted: false, mergedInto: null, changedSeq: 2, myVote: null };
const snapshot: BoardSnapshot & Standing = {
  board: { id: "board", question: "Q?", closed: false, seq: 5 },
  options: [{ id: "yes", name: "Yes", position: 1, deleted: false, changedSeq: 1 }],
  arguments: [argument],
  versions: [],
  sources: [],
  order: { arguments: { yes: ["a1"] }, versions: { a1: [] } },
  access,
  role: "contributor",
};

/** A promise and the function that settles it. */
function later<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => (resolve = settle));
  return { promise, resolve };
}

/** What the board shows for the argument: the reader's vote and the count. */
function shown(session: BoardSession) {
  const state = session.snapshot();
  return importanceShown(state.view!.rows.arguments.a1!, state.mine);
}

beforeEach(() => {
  vi.useFakeTimers();
  // The session runs in a browser; outside one it needs only timers and listeners.
  const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };
  vi.stubGlobal("window", { ...listeners, setTimeout: (run: () => void, ms: number) => setTimeout(run, ms), clearTimeout: (id: number) => clearTimeout(id) });
  vi.stubGlobal("document", { ...listeners, visibilityState: "visible" });
  vi.mocked(readBoard).mockResolvedValue(snapshot);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(readBoard).mockReset();
  vi.mocked(readChanges).mockReset();
  vi.mocked(send).mockReset();
});

test("B-01 M-15: a second press made while the first vote is on its way still shows when the first one's answer comes back", async () => {
  const first = later<Answer>();
  const second = later<Answer>();
  vi.mocked(send).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  vi.mocked(readChanges).mockReturnValue(new Promise(() => undefined));
  const session = new BoardSession("board");
  await session.start();

  session.act({ kind: "importance", argumentId: "a1", value: 1 });
  expect(shown(session)).toEqual({ vote: 1, score: 2 });
  session.act({ kind: "importance", argumentId: "a1", value: null });
  expect(shown(session)).toEqual({ vote: null, score: 1 });

  // The first vote's answer comes back while the second is still waiting to be sent.
  first.resolve({ status: "done", seq: 6 });
  await vi.advanceTimersByTimeAsync(0);
  expect(shown(session)).toEqual({ vote: null, score: 1 });
  session.stop();
});

test("B-01 M-15: a second press made after the first vote's answer, before the next read shows it, shows at once", async () => {
  const second = later<Answer>();
  vi.mocked(send).mockResolvedValueOnce({ status: "done", seq: 6 }).mockReturnValueOnce(second.promise);
  // The read after the first vote doesn't come back during the test.
  vi.mocked(readChanges).mockReturnValue(new Promise(() => undefined));
  const session = new BoardSession("board");
  await session.start();

  session.act({ kind: "importance", argumentId: "a1", value: 1 });
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.mocked(readChanges)).toHaveBeenCalled();
  expect(shown(session)).toEqual({ vote: 1, score: 2 });

  session.act({ kind: "importance", argumentId: "a1", value: null });
  expect(shown(session)).toEqual({ vote: null, score: 1 });
  session.stop();
});
