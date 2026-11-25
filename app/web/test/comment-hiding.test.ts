import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Access, BoardChanges, BoardSnapshot, CommentRow, Role, Standing } from "@steelman/shared";
import { readBoard, readChanges, setCommentHidden } from "../src/api.ts";
import { BoardSession, POLL_MS } from "../src/board/session.ts";

// Hiding a comment and the re-read on a role change (M3b-14, D-01, J-02): a
// hidden comment's text reaches only an Editor or the Owner, so a reader who
// stops being one must lose the text they were sent, and one who becomes one
// must get it. The session reads the whole board again when the role crosses
// that line, and takes the comments from that read. Hide and Restore say what
// they did, and only answer once the board has been read again.

vi.mock("../src/api.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api.ts")>()),
  readBoard: vi.fn(),
  readChanges: vi.fn(),
  setCommentHidden: vi.fn(),
}));

const access: Access = { general: "link", linkRole: "contributor" };
const TEXT = "Which survey is this from?";
const hidden = (body: string | null): CommentRow => ({
  id: "c1",
  optionId: "yes",
  versionId: null,
  parentId: null,
  authorId: "ben",
  authorName: "ben",
  body,
  createdAt: "2026-11-24T12:00:00.000Z",
  resolved: false,
  deleted: false,
  hidden: true,
  hiddenReason: "spam",
  changedSeq: 4,
});
const snapshot = (seq: number, role: Role, comments: CommentRow[]): BoardSnapshot & Standing => ({
  board: { id: "board", question: "Q?", closed: false, seq },
  options: [{ id: "yes", name: "Yes", position: 1, deleted: false, changedSeq: 1 }],
  arguments: [],
  versions: [],
  sources: [],
  order: { arguments: { yes: [] }, versions: {} },
  comments,
  access,
  role,
});
const changes = (seq: number, role: Role, comments: CommentRow[] = []): BoardChanges & Standing => ({
  seq,
  options: [],
  arguments: [],
  versions: [],
  sources: [],
  order: null,
  log: [],
  ...(comments.length ? { comments } : {}),
  access,
  role,
});

beforeEach(() => {
  vi.useFakeTimers();
  const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };
  vi.stubGlobal("window", { ...listeners, setTimeout: (run: () => void, ms: number) => setTimeout(run, ms), clearTimeout: (id: number) => clearTimeout(id) });
  vi.stubGlobal("document", { ...listeners, visibilityState: "visible" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(readBoard).mockReset();
  vi.mocked(readChanges).mockReset();
  vi.mocked(setCommentHidden).mockReset();
});

test("D-01, J-02: an Editor made a Contributor loses a hidden comment's text with the board's re-read", async () => {
  vi.mocked(readBoard).mockResolvedValueOnce(snapshot(5, "editor", [hidden(TEXT)]));
  vi.mocked(readChanges).mockResolvedValueOnce(changes(6, "contributor"));
  vi.mocked(readBoard).mockResolvedValueOnce(snapshot(6, "contributor", [hidden(null)]));
  const session = new BoardSession("board");
  await session.start();
  expect(session.snapshot().view?.rows.comments.c1?.body).toBe(TEXT);

  await vi.advanceTimersByTimeAsync(POLL_MS);

  expect(session.snapshot().view?.rows.comments.c1).toEqual(hidden(null));
  session.stop();
});

test("D-01, J-02: a Contributor made an Editor gets a hidden comment's text with the board's re-read", async () => {
  vi.mocked(readBoard).mockResolvedValueOnce(snapshot(5, "contributor", [hidden(null)]));
  vi.mocked(readChanges).mockResolvedValueOnce(changes(6, "editor"));
  vi.mocked(readBoard).mockResolvedValueOnce(snapshot(6, "editor", [hidden(TEXT)]));
  const session = new BoardSession("board");
  await session.start();

  await vi.advanceTimersByTimeAsync(POLL_MS);

  expect(session.snapshot().view?.rows.comments.c1?.body).toBe(TEXT);
  session.stop();
});

test("D-01, J-02: a restored comment loses its reason, since the changes answer replaces the whole row", async () => {
  vi.mocked(readBoard).mockResolvedValueOnce(snapshot(5, "contributor", [hidden(null)]));
  const restored: CommentRow = { ...hidden(TEXT), hidden: false, changedSeq: 6 };
  delete restored.hiddenReason;
  vi.mocked(readChanges).mockResolvedValueOnce(changes(6, "contributor", [restored]));
  const session = new BoardSession("board");
  await session.start();

  await vi.advanceTimersByTimeAsync(POLL_MS);

  expect(session.snapshot().view?.rows.comments.c1).toEqual(restored);
  session.stop();
});

test("D-01, J-02: Hide says the comment is hidden and answers only once the board has been read again; Restore says it's restored", async () => {
  vi.mocked(readBoard).mockResolvedValueOnce(snapshot(5, "editor", []));
  const session = new BoardSession("board");
  await session.start();
  const read = vi.mocked(readChanges);
  read.mockResolvedValue(changes(6, "editor", [hidden(TEXT)]));
  vi.mocked(setCommentHidden).mockResolvedValue({ status: "done", seq: 6 });

  expect(await session.setCommentHidden("c1", "spam")).toBeNull();
  expect(setCommentHidden).toHaveBeenLastCalledWith("board", "c1", "spam");
  expect(session.snapshot().status).toBe("The comment is hidden.");
  expect(session.snapshot().view?.rows.comments.c1?.hidden).toBe(true);

  expect(await session.setCommentHidden("c1", null)).toBeNull();
  expect(setCommentHidden).toHaveBeenLastCalledWith("board", "c1", null);
  expect(session.snapshot().status).toBe("The comment is restored.");
  session.stop();
});

test("D-01, J-02: a refused Hide or Restore answers why, in a sentence", async () => {
  vi.mocked(readBoard).mockResolvedValueOnce(snapshot(5, "editor", []));
  const session = new BoardSession("board");
  await session.start();
  vi.mocked(readChanges).mockResolvedValue(changes(5, "editor"));

  vi.mocked(setCommentHidden).mockResolvedValueOnce({ status: "refused", reason: "own_comment" });
  expect(await session.setCommentHidden("c1", "spam")).toBe("You can’t hide your own comment.");
  vi.mocked(setCommentHidden).mockResolvedValueOnce({ status: "refused", reason: "comment_deleted" });
  expect(await session.setCommentHidden("c1", null)).toBe("This comment was deleted, so it wasn’t restored.");
  vi.mocked(setCommentHidden).mockResolvedValueOnce({ status: "refused", reason: "board_closed" });
  expect(await session.setCommentHidden("c1", "spam")).toBe("This board closed while you were away.");
  vi.mocked(setCommentHidden).mockResolvedValueOnce({ status: "refused", reason: "not_allowed" });
  expect(await session.setCommentHidden("c1", "spam")).toBe("Your role on this board doesn’t allow that.");
  session.stop();
});
