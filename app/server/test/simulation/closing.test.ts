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

// Closing in the simulation (M3b-4, I-05): two fixed sequences, one closing
// the board by hand and one by its time, with every check after each step.
// While it is closed, each of the seven kinds of action is refused
// board_closed; after the paired reopen, each is accepted again. Closing
// twice changes nothing the second time.

const db = useTestDatabase({ migrated: true });
let kysely: Db;
beforeAll(() => {
  kysely = createDatabase(db.url);
});
afterAll(async () => {
  await kysely.destroy();
});

/** Ben (reader 1) and Cy (reader 2) try each kind of action. Ben edits and deletes his own wording. */
const EVERY_KIND: Step[] = [
  { kind: "importance", reader: 1, target: 0, value: 1 },
  { kind: "articulation", reader: 1, target: 0, value: 1 },
  { kind: "assess", reader: 1, target: 0, supported: false },
  { kind: "addArgument", reader: 1, option: 0 },
  { kind: "addWording", reader: 2, target: 0 },
  { kind: "edit", reader: 1, target: 1 },
  { kind: "delete", reader: 2, target: 2 },
];

const KINDS = ["importance", "articulation", "assess", "addArgument", "addWording", "edit", "delete"];

/** Closed by hand, for the seven steps after it; then the paired reopen, and each kind again. */
const BY_HAND: Step[] = [{ kind: "close", for: EVERY_KIND.length }, ...EVERY_KIND, ...EVERY_KIND];

/** Closed by its time, a minute ahead; the minute passes; the reopen comes after the seven steps; then each kind again. */
const BY_TIME: Step[] = [{ kind: "closeAt", minutes: 1, for: EVERY_KIND.length + 1 }, { kind: "minutePasses" }, ...EVERY_KIND, { kind: "poll", reader: 1 }, ...EVERY_KIND];

// Each sequence plays on a board of its own, so the actions after its reopen are new there and come back done.
// Every step finds something to act on (the seed board's two arguments, and the wordings Ben and Cy add), so each
// kind is refused exactly once while the board is closed.

test("I-05, M-02: a board closed by hand refuses every kind of action, and each is accepted again after the reopen; closing twice changes nothing", async () => {
  const tally = emptyTally();

  await playSequence({ order, read, votes, writing }, { db: kysely, client: db.client }, BY_HAND, tally);

  expect(tally.closedByHand).toBe(1);
  expect(tally.closedByTime).toBe(0);
  for (const kind of KINDS) {
    expect(tally.closedRefusals[kind], kind).toBe(1);
    expect(tally.acceptedAfterReopen[kind], kind).toBeGreaterThan(0);
  }
  expect(tally.closeSentTwice).toBe(1);
});

test("I-05, M-02: a board closed by its time refuses every kind of action once the minute passes, and each is accepted again after the reopen", async () => {
  const tally = emptyTally();

  await playSequence({ order, read, votes, writing }, { db: kysely, client: db.client }, BY_TIME, tally);

  expect(tally.closedByHand).toBe(0);
  expect(tally.closedByTime).toBe(1);
  for (const kind of KINDS) {
    expect(tally.closedRefusals[kind], kind).toBe(1);
    expect(tally.acceptedAfterReopen[kind], kind).toBeGreaterThan(0);
  }
});
