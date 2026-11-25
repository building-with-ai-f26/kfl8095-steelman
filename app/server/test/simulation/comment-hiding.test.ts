import { afterAll, beforeAll, expect, test } from "vitest";
import * as order from "../../src/order.ts";
import * as read from "../../src/read.ts";
import * as votes from "../../src/votes.ts";
import * as writing from "../../src/writing.ts";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { useTestDatabase } from "../support/database.ts";
import { emptyTally, playSequence } from "./world.ts";
import type { Step } from "./world.ts";

// Hiding and restoring a comment in the simulation (M3b-14, D-01, J-02): one
// fixed sequence that always plays each way a hide or restore of a comment
// goes, with every check after each step. A minute passes after each comment,
// so they're added in this sequence's order and each step lands on the
// comment named here: Ben's on a wording, then Cy's and Ana's on the
// question. Ben may not hide; Ana hides Ben's, and Ben's and Cy's next polls
// must not carry its text (check 10, for comments); Ana may not hide her own.
// Cy is offline while Ana restores Ben's, then catches up and presses Update
// (check 8). Ana hides Cy's, closes the board, and her restore is refused;
// Cy deletes his own hidden comment meanwhile, so once the board is open
// again, Ana's restore from her older view is refused for that.

const db = useTestDatabase({ migrated: true });
let kysely: Db;
beforeAll(() => {
  kysely = createDatabase(db.url);
});
afterAll(async () => {
  await kysely.destroy();
});

const SEQUENCE: Step[] = [
  { kind: "comment", reader: 1, on: "wording", target: 0 },
  { kind: "minutePasses" },
  { kind: "comment", reader: 2, on: "question", target: 0 },
  { kind: "minutePasses" },
  { kind: "poll", reader: 0 },
  { kind: "hideComment", reader: 1, target: 0 },
  { kind: "hideComment", reader: 0, target: 0 },
  { kind: "poll", reader: 1 },
  { kind: "poll", reader: 2 },
  { kind: "comment", reader: 0, on: "question", target: 0 },
  { kind: "minutePasses" },
  { kind: "hideComment", reader: 0, target: 1 },
  { kind: "offline", reader: 2 },
  { kind: "restoreComment", reader: 0, target: 0 },
  { kind: "online", reader: 2 },
  { kind: "update", reader: 2 },
  { kind: "hideComment", reader: 0, target: 1 },
  { kind: "close", for: 2 },
  { kind: "restoreComment", reader: 0, target: 0 },
  { kind: "deleteComment", reader: 2, target: 0, mine: true },
  { kind: "restoreComment", reader: 0, target: 0 },
  { kind: "update", reader: 0 },
  { kind: "update", reader: 1 },
  { kind: "update", reader: 2 },
];

test("D-01, J-02, M-02, M0-5: hiding and restoring a comment, with every check after each step, are done or refused for the reason the database gives", async () => {
  const tally = emptyTally();

  await playSequence({ order, read, votes, writing }, { db: kysely, client: db.client }, SEQUENCE, tally);

  // Ana hides Ben's comment and then Cy's, and restores Ben's.
  expect(tally.commentsHidden).toBe(2);
  expect(tally.commentsRestored).toBe(1);
  // Ben isn't a moderator; Ana's own comment isn't hers to hide; the closed board refuses her restore; and Cy's
  // comment was deleted before her restore reached it.
  expect(tally.commentRefused).toEqual({ not_allowed: 1, own_comment: 1, board_closed: 1, comment_deleted: 1 });
  expect(tally.commentsAdded).toBe(3);
  expect(tally.commentsDeleted).toBe(1);
  expect(tally.closedByHand).toBe(1);
  expect(tally.updatesCompared).toBe(4);
  // Wordings' counters are untouched: a comment's hide is counted apart.
  expect(tally.hidden).toBe(0);
  expect(tally.restored).toBe(0);
  expect(tally.refused).toEqual({});
});
