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

// "Can't open it?" in the simulation (M3a-3, C-02): one fixed sequence that
// always reports and clears the board's source, with all ten checks after
// each step. Ben goes offline and assesses every wording he sees as
// supported; Cy reports the source; back online, Ben's Yes on the wording
// that cited it is refused, as check 9 expects from the database. Ben can't
// clear Cy's report; Cy withdraws it; Ana, the owner, clears a second one.

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
  ...[0, 1, 2, 3].map((target): Step => ({ kind: "assess", reader: 1, target, supported: true })),
  { kind: "reportSource", reader: 2 },
  { kind: "poll", reader: 0 },
  { kind: "online", reader: 1 },
  { kind: "clearSource", reader: 1 },
  { kind: "clearSource", reader: 2 },
  { kind: "reportSource", reader: 1 },
  { kind: "clearSource", reader: 0 },
  { kind: "update", reader: 2 },
];

test("M3a-3, C-02, M-02: reporting and clearing a source, with the ten checks after each step", async () => {
  const tally = emptyTally();

  await playSequence({ order, read, votes, writing }, { db: kysely, client: db.client }, SEQUENCE, tally);

  expect(tally.sourceReports).toBe(2);
  expect(tally.sourceClears).toBe(2);
  expect(tally.refused.not_author).toBe(1);
  expect(tally.refused.needs_evidence).toBeGreaterThan(0);
});
