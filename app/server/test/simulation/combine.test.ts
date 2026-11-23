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

// Combine, separate, and undo in the simulation (M3a-6; M3a's Done when):
// one fixed sequence that always plays them, with the ten checks after each
// step. Ben goes offline and votes on every argument he sees; Ana, the
// owner, combines a wording into another argument, separates one, and undoes both; back online, Ben's votes on the combined argument follow it (or
// stand where he'd voted); Cy, who isn't an Editor, is refused. Readers who
// had the board open keep their rows still until Update, and a caught-up
// reader who presses Update sees what a new one does (checks 7 and 8).

const db = useTestDatabase({ migrated: true });
let kysely: Db;
beforeAll(() => {
  kysely = createDatabase(db.url);
});
afterAll(async () => {
  await kysely.destroy();
});

const SEQUENCE: Step[] = [
  { kind: "addArgument", reader: 2, option: 0 },
  { kind: "poll", reader: 0 },
  { kind: "poll", reader: 1 },
  { kind: "offline", reader: 1 },
  ...[0, 1, 2, 3].map((target): Step => ({ kind: "importance", reader: 1, target, value: 1 })),
  { kind: "combine", reader: 0, target: 0, into: 0 },
  { kind: "poll", reader: 2 },
  { kind: "separate", reader: 0, target: 0 },
  { kind: "online", reader: 1 },
  { kind: "combine", reader: 2, target: 0, into: 0 },
  { kind: "undo", reader: 0, target: 0 },
  { kind: "poll", reader: 2 },
  { kind: "undo", reader: 0, target: 0 },
  { kind: "update", reader: 2 },
  { kind: "update", reader: 1 },
];

test("M3a-6, A-10, J-04, M-02: combine, separate, and undo, with the ten checks after each step", async () => {
  const tally = emptyTally();

  await playSequence({ order, read, votes, writing }, { db: kysely, client: db.client }, SEQUENCE, tally);

  expect(tally.combined).toBe(1);
  expect(tally.separated).toBe(1);
  expect(tally.undone).toBe(2);
  expect(tally.refused.not_allowed).toBeGreaterThan(0);
});
