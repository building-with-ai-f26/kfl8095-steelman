import { beforeEach, expect, test } from "vitest";
import { openCount, openView } from "@steelman/shared";
import type { BoardSnapshot, CommentTarget } from "@steelman/shared";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// The list's comment counts and creation times (E-03, M3d-13). Each listing
// carries the board's open comment count, by the rule the board's speech
// bubbles use (shared/src/comments.ts openCount): replies count, deleted
// comments and resolved threads don't, and nor do comments whose wording is
// deleted or hidden or whose option is deleted. A comment a moderator hid
// still counts, as it does on the board. Each listing also carries the time
// the board was made, which Newest sorts by and no later write changes.
//
// The row names list-comments.test.ts for these tests. That file holds an
// M3b-10 test already, and rule 9 leaves existing test files as they are, so
// these tests sit in a file of their own.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(4131);
const MINUTE = 60_000;

interface Listed {
  id: string;
  question: string;
  options: { name: string; arguments: number }[];
  role: string;
  owner: string;
  changedAt: string;
  createdAt: string;
  comments: number;
}

let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const listed = async (as: string, board = b.board): Promise<Listed | undefined> =>
  ((await api.get("/api/boards", { as })).body.boards as Listed[]).find((listing) => listing.id === board);
const done = (answer: { status: number; body: { status: string } }, what: string) => {
  expect(answer.status, what).toBe(200);
  expect(answer.body.status, what).toBe("done");
};
const comment = async (board: string, as: string, on: { versionId?: string; optionId?: string; parentId?: string }, body = "Which survey is this from?") => {
  const id = ids.itemId();
  done(await api.post(`/api/boards/${board}/comments`, { as, body: { id, ...on, body } }), `comment ${body}`);
  return id;
};
/** The board's own count for `as`: openCount summed over the question, every option and every wording the reader holds. */
const boardsOwnCount = async (as: string, board = b.board) => {
  const snapshot = (await api.get(`/api/boards/${board}`, { as })).body as BoardSnapshot;
  const { rows } = openView(snapshot);
  const targets: CommentTarget[] = ["question", ...Object.keys(rows.options).map((optionId) => ({ optionId })), ...Object.keys(rows.versions).map((versionId) => ({ versionId }))];
  return targets.reduce((sum, target) => sum + openCount(rows, target), 0);
};

test("E-03: a board with no comments lists a count of 0, and the rest of its listing holds", async () => {
  expect(await listed(b.ben)).toEqual({
    id: b.board,
    question: "Should our library open on Sundays?",
    options: [
      { name: "Yes", arguments: 1 },
      { name: "No", arguments: 1 },
    ],
    role: "contributor",
    owner: expect.stringMatching(/^ana_/),
    changedAt: expect.any(String),
    createdAt: new Date(NOON).toISOString(),
    comments: 0,
  });
});

test("E-03: the count takes replies and leaves out deleted comments, resolved threads, and other boards' comments", async () => {
  const other = await seedBoard(db.client, ids);
  await comment(other.board, other.ben, { versionId: other.version }, "On another board.");
  await comment(other.board, other.ben, {}, "Also on another board.");

  // An open thread on the question with one reply: 2.
  const question = await comment(b.board, b.ben, {}, "Is this about the main branch?");
  await comment(b.board, b.ana, { parentId: question }, "Yes, the main one.");
  // A thread on a wording whose reply was deleted: 1.
  const onWording = await comment(b.board, b.ben, { versionId: b.version });
  const deletedReply = await comment(b.board, b.ben, { versionId: b.version, parentId: onWording }, "Never mind.");
  done(await api.delete(`/api/boards/${b.board}/comments/${deletedReply}`, { as: b.ben }), "delete the reply");
  // A deleted first comment adds nothing, and its live reply still counts: 1.
  const deletedFirst = await comment(b.board, b.ben, { optionId: b.yes }, "A first comment that goes.");
  await comment(b.board, b.ana, { optionId: b.yes, parentId: deletedFirst }, "A reply that stays.");
  done(await api.delete(`/api/boards/${b.board}/comments/${deletedFirst}`, { as: b.ben }), "delete the first comment");
  // A resolved thread, replies included, adds nothing: 0.
  const resolved = await comment(b.board, b.ben, { optionId: b.no }, "Is this settled?");
  await comment(b.board, b.ana, { optionId: b.no, parentId: resolved }, "It is.");
  done(await api.put(`/api/boards/${b.board}/comments/${resolved}/resolved`, { as: b.ana }), "resolve");

  expect((await listed(b.ben))?.comments).toBe(4);
  expect((await listed(b.ana))?.comments).toBe(4);
  expect((await listed(other.ben, other.board))?.comments).toBe(2);
  for (const who of [b.ben, b.ana]) expect((await listed(who))?.comments, who).toBe(await boardsOwnCount(who));
});

test("E-03: a comment a moderator hid still counts, as on the board, and comments on a hidden wording or a deleted option don't", async () => {
  const hidden = await comment(b.board, b.ben, {}, "Buy cheap watches here.");
  done(await api.put(`/api/boards/${b.board}/comments/${hidden}/hidden`, { as: b.ana, body: { reason: "spam" } }), "hide the comment");
  await comment(b.board, b.ben, { versionId: b.otherVersion }, "On the wording that gets hidden.");
  await comment(b.board, b.ben, { versionId: b.otherVersion }, "Also on the wording that gets hidden.");
  // Only an empty option can be deleted, so the option that goes is a third one.
  const maybe = ids.itemId();
  done(await api.post(`/api/boards/${b.board}/options`, { as: b.ana, body: { id: maybe, name: "Maybe" } }), "add an option");
  await comment(b.board, b.ben, { optionId: maybe }, "On the option that gets deleted.");
  await comment(b.board, b.ben, { versionId: b.version }, "On a wording that stays.");

  expect((await listed(b.ben))?.comments).toBe(5);

  done(await api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: b.ana, body: { reason: "spam" } }), "hide the wording");
  expect((await listed(b.ben))?.comments).toBe(3);

  done(await api.delete(`/api/boards/${b.board}/options/${maybe}`, { as: b.ana }), "delete the option");
  expect((await listed(b.ben))?.comments).toBe(2);

  for (const who of [b.ben, b.ana]) expect((await listed(who))?.comments, who).toBe(await boardsOwnCount(who));
});

test("E-03: each listing carries when the board was made, and a later comment moves its last change but not that", async () => {
  expect((await listed(b.ben))?.createdAt).toBe(new Date(NOON).toISOString());

  api.clock.advance(MINUTE);
  const made = api.clock.now().toISOString();
  const board = (await api.post("/api/boards", { as: b.ana, body: { question: "Should the café stay open late?", options: ["Yes", "No"] } })).body.board as string;
  expect(await listed(b.ana, board)).toMatchObject({ createdAt: made, changedAt: made });

  api.clock.advance(MINUTE);
  await comment(board, b.ana, {}, "Who asked for this?");
  const afterComment = await listed(b.ana, board);
  expect(afterComment?.changedAt).toBe(api.clock.now().toISOString());
  expect(afterComment?.createdAt).toBe(made);

  api.clock.advance(MINUTE);
  done(await api.post(`/api/boards/${b.board}/comments`, { as: b.ben, body: { id: ids.itemId(), body: "A comment on the library board." } }), "comment on the seeded board");
  const seeded = await listed(b.ben);
  expect(seeded?.changedAt).toBe(api.clock.now().toISOString());
  expect(seeded?.createdAt).toBe(new Date(NOON).toISOString());
});
