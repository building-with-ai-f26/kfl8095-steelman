import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Access, BoardChanges, BoardSnapshot, CommentRow, Role, Standing } from "@steelman/shared";
import { readBoard, readChanges } from "../src/api.ts";
import { BoardSession, POLL_MS } from "../src/board/session.ts";

// Comments and the re-read on a role change (D-01, M3b-10): when a poll says
// the reader became an Editor or the Owner, or stopped being one, the session
// reads the whole board again and moves its change number to the snapshot's.
// A comment stamped between the poll and that read is in the snapshot only,
// so the session must keep it, or no later "changes after S" sends it.

vi.mock("../src/api.ts", async (importOriginal) => ({ ...(await importOriginal<typeof import("../src/api.ts")>()), readBoard: vi.fn(), readChanges: vi.fn() }));

const access: Access = { general: "link", linkRole: "contributor" };
const comment: CommentRow = {
  id: "c1",
  optionId: "yes",
  versionId: null,
  parentId: null,
  authorId: "ben",
  authorName: "ben",
  body: "Which survey is this from?",
  createdAt: "2026-11-24T12:00:00.000Z",
  resolved: false,
  deleted: false,
  hidden: false,
  changedSeq: 7,
};
const snapshot = (seq: number, role: Role, comments?: CommentRow[]): BoardSnapshot & Standing => ({
  board: { id: "board", question: "Q?", closed: false, seq },
  options: [{ id: "yes", name: "Yes", position: 1, deleted: false, changedSeq: 1 }],
  arguments: [],
  versions: [],
  sources: [],
  order: { arguments: { yes: [] }, versions: {} },
  ...(comments ? { comments } : {}),
  access,
  role,
});
const changes = (seq: number, role: Role): BoardChanges & Standing => ({ seq, options: [], arguments: [], versions: [], sources: [], order: null, log: [], access, role });

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
});

test("D-01, M2-3: a comment added between a role-changing poll and the board's re-read is kept", async () => {
  vi.mocked(readBoard).mockResolvedValueOnce(snapshot(5, "contributor"));
  // The poll makes the reader an Editor; then a comment is added, and the re-read is the first answer to carry it.
  vi.mocked(readChanges).mockResolvedValueOnce(changes(6, "editor"));
  vi.mocked(readBoard).mockResolvedValueOnce(snapshot(7, "editor", [comment]));
  const session = new BoardSession("board");
  await session.start();
  expect(session.snapshot().view?.seq).toBe(5);

  await vi.advanceTimersByTimeAsync(POLL_MS);

  const view = session.snapshot().view;
  expect(view?.seq).toBe(7);
  expect(view?.rows.comments).toEqual({ c1: comment });
  session.stop();
});
