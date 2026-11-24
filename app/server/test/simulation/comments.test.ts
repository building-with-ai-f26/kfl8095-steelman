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

// Comments in the simulation (D-01, M3b-10): one fixed sequence that always
// plays adding, replying, resolving, reopening, and deleting a comment, with
// every check after each step. A minute passes after each comment and reply,
// so they're added in this sequence's order and each step lands on the
// thread named here. Cy is offline while Ben comments on a wording and Ana
// hides it, so Cy comes back without its comments; Ben holds them. Both
// catch up and press Update, and each must see what a new reader sees
// (check 8). Ana restores the wording, and Cy's next poll gets its comment
// and reply again, though they're older than the change number Cy holds
// (check 4 knows the re-sent rows); Ana's and Ben's next polls get them too.
// Commenting, reopening the option's thread, which Ana resolved, and deleting
// your own go on while the board is closed.

const db = useTestDatabase({ migrated: true });
let kysely: Db;
beforeAll(() => {
  kysely = createDatabase(db.url);
});
afterAll(async () => {
  await kysely.destroy();
});

const SEQUENCE: Step[] = [
  { kind: "offline", reader: 2 },
  { kind: "comment", reader: 1, on: "wording", target: 0 },
  { kind: "minutePasses" },
  { kind: "comment", reader: 1, on: "option", target: 1 },
  { kind: "minutePasses" },
  { kind: "poll", reader: 0 },
  { kind: "reply", reader: 0, target: 0 },
  { kind: "minutePasses" },
  { kind: "resolve", reader: 0, target: 1, reopen: false },
  { kind: "hide", reader: 0, target: 0 },
  { kind: "online", reader: 2 },
  { kind: "update", reader: 1 },
  { kind: "update", reader: 2 },
  { kind: "restore", reader: 0, target: 0 },
  { kind: "update", reader: 2 },
  { kind: "close", for: 5 },
  { kind: "comment", reader: 2, on: "question", target: 0 },
  { kind: "minutePasses" },
  { kind: "deleteComment", reader: 2, target: 0, mine: false },
  { kind: "resolve", reader: 2, target: 1, reopen: true },
  { kind: "deleteComment", reader: 2, target: 0, mine: true },
  { kind: "update", reader: 0 },
  { kind: "update", reader: 1 },
  { kind: "update", reader: 2 },
];

test("D-01, M-02, M0-5: comments with every check after each step: a caught-up reader sees what a new one sees, and Restore sends a wording's comments again", async () => {
  const tally = emptyTally();

  await playSequence({ order, read, votes, writing }, { db: kysely, client: db.client }, SEQUENCE, tally);

  expect(tally.commentsAdded).toBe(3);
  expect(tally.replies).toBe(1);
  expect(tally.resolves).toBe(1);
  expect(tally.commentsDeleted).toBe(1);
  // Someone else's comment isn't theirs to delete.
  expect(tally.commentRefused.not_author).toBe(1);
  // Cy reopens the option's thread, which Ana resolved, while the board is closed.
  expect(tally.reopens).toBe(1);
  // Each reader's first poll after the Restore gets the wording's comment and its reply again: Ana's, Cy's, and Ben's.
  expect(tally.commentsResent).toBe(6);
  // The question's comment, the reopen, and the delete happened while the board was closed.
  expect(tally.commentsWhileClosed).toBe(3);
  expect(tally.updatesCompared).toBe(6);
  expect(tally.hidden).toBe(1);
  expect(tally.restored).toBe(1);
});
