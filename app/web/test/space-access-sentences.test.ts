import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Access, BoardChanges, BoardSnapshot, HistoryEntry, ReaderView, Standing } from "@steelman/shared";
import { readBoard, readChanges, removeMember, setAccess } from "../src/api.ts";
import { said } from "../src/board/History.tsx";
import { BoardSession } from "../src/board/session.ts";

// The sentences a board in a space adds (G-05, H-02, J-03, M3d-18), each
// produced as the reader meets it: what is read out after the Owner removes
// someone from a board shared with its space, the note when the service
// refuses to share a board with a space, and History's line when a shared
// board leaves its space. Each is a full sentence (AGENTS.md rule 13).

vi.mock("../src/api.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api.ts")>()),
  readBoard: vi.fn(),
  readChanges: vi.fn(),
  removeMember: vi.fn(),
  setAccess: vi.fn(),
}));

const space = { id: "pod6", name: "POD 6" };
const snapshot = (access: Access, inSpace: boolean): BoardSnapshot & Standing => ({
  board: { id: "board", question: "Q?", closed: false, seq: 5 },
  options: [{ id: "yes", name: "Yes", position: 1, deleted: false, changedSeq: 1 }],
  arguments: [],
  versions: [],
  sources: [],
  order: { arguments: { yes: [] }, versions: {} },
  access,
  role: "owner",
  ...(inSpace ? { space } : {}),
});
const changes = (access: Access, inSpace: boolean): BoardChanges & Standing => ({
  seq: 5,
  options: [],
  arguments: [],
  versions: [],
  sources: [],
  order: null,
  log: [],
  access,
  role: "owner",
  ...(inSpace ? { space } : {}),
});

async function opened(access: Access, inSpace: boolean): Promise<BoardSession> {
  vi.mocked(readBoard).mockResolvedValue(snapshot(access, inSpace));
  vi.mocked(readChanges).mockResolvedValue(changes(access, inSpace));
  const session = new BoardSession("board");
  await session.start();
  return session;
}

beforeEach(() => {
  vi.useFakeTimers();
  // The session runs in a browser; outside one it needs only timers and listeners.
  const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };
  vi.stubGlobal("window", { ...listeners, setTimeout: (run: () => void, ms: number) => setTimeout(run, ms), clearTimeout: (id: number) => clearTimeout(id) });
  vi.stubGlobal("document", { ...listeners, visibilityState: "visible" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(readBoard).mockReset();
  vi.mocked(readChanges).mockReset();
  vi.mocked(removeMember).mockReset();
  vi.mocked(setAccess).mockReset();
});

test("G-05, H-02: removing someone from a board shared with its space says they may still get in through the space, named for its members", async () => {
  vi.mocked(removeMember).mockResolvedValue({ status: "done", seq: 6 });
  const member = await opened({ general: "space", linkRole: "voter" }, true);

  expect(await member.removeMember({ id: "lin", name: "lin.zhao", role: "voter" })).toBe(true);
  expect(member.snapshot().status).toBe("lin.zhao no longer has access. lin.zhao can still open this steelman if they’re in POD 6.");
  member.stop();

  // An Owner the service doesn't name the space to reads "its space".
  const outside = await opened({ general: "space", linkRole: "voter" }, false);
  await outside.removeMember({ id: "lin", name: "lin.zhao", role: "voter" });
  expect(outside.snapshot().status).toBe("lin.zhao no longer has access. lin.zhao can still open this steelman if they’re in its space.");
  outside.stop();
});

test("H-02: when the service refuses to share the board with a space, the note says why, and the choice goes back", async () => {
  vi.mocked(setAccess).mockResolvedValue({ status: "refused", reason: "no_space" });
  const session = await opened({ general: "invited", linkRole: "voter" }, false);

  await session.share({ general: "space", linkRole: "voter" });

  expect(session.snapshot().problem).toBe("This steelman isn’t in a space you’re in, so it can’t be shared with everyone in one.");
  expect(session.snapshot().access).toEqual({ general: "invited", linkRole: "voter" });
  session.stop();
});

test("G-05, J-03: History says a shared board taken out of its space is open only to invited people", () => {
  const view = { rows: { options: {}, arguments: {}, versions: {}, sources: {}, comments: {} } } as unknown as ReaderView;
  const entry = (detail: HistoryEntry["detail"]): HistoryEntry => ({ seq: 7, at: "2026-11-26T12:00:00.000Z", actorName: "maya.chen", kind: "space_changed", subjectKind: "board", subjectId: "board", reason: null, detail });
  const none = () => undefined;

  expect(said(entry({ outOfSpace: true, general: "invited" }), view, "board", none, none)).toBe("took the board out of its space, so only invited people can open it.");
  expect(said(entry({ outOfSpace: true }), view, "board", none, none)).toBe("took the board out of its space.");
});
