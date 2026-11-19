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

// Hide and restore in the simulation (M2-4; M2's Done when, Q28): one fixed
// sequence that always plays them, with all ten checks after each step.
// Ben goes offline and votes on every wording; Ana, the owner, hides one;
// back online, Ben's vote on it is dropped; Ana restores it; Ben's own hide
// is refused. Check 10 says no hidden text reaches Ben or Cy.

const db = useTestDatabase({ migrated: true });
let kysely: Db;
beforeAll(() => {
  kysely = createDatabase(db.url);
});
afterAll(async () => {
  await kysely.destroy();
});

const SEQUENCE: Step[] = [
  { kind: "offline", reader: 1 },
  ...[0, 1, 2, 3].map((target): Step => ({ kind: "articulation", reader: 1, target, value: 1 })),
  { kind: "hide", reader: 0, target: 0 },
  { kind: "poll", reader: 2 },
  { kind: "online", reader: 1 },
  { kind: "update", reader: 2 },
  { kind: "restore", reader: 0, target: 0 },
  { kind: "hide", reader: 1, target: 0 },
  { kind: "poll", reader: 1 },
];

test("M2-4, J-02, M-02: hide and restore by the owner, with the ten checks after each step: a vote on the hidden wording is dropped, and a Contributor's hide refused", async () => {
  const tally = emptyTally();

  await playSequence({ order, read, votes, writing }, { db: kysely, client: db.client }, SEQUENCE, tally);

  expect(tally.hidden).toBe(1);
  expect(tally.restored).toBe(1);
  expect(tally.refused.version_deleted).toBeGreaterThan(0);
});

test("M2-4, M-02: check 10 catches hidden text sent to someone who isn't a moderator", async () => {
  // A planted bug: every reader is answered as a moderator.
  const leaky = {
    ...read,
    readChanges: (db: Db, board: string, person: string | null, after: number) => read.readChanges(db, board, person, after, true),
  };

  await expect(playSequence({ order, read: leaky, votes, writing }, { db: kysely, client: db.client }, SEQUENCE)).rejects.toThrow(/10\. No hidden text reaches anyone but an Editor or the Owner/);
});
