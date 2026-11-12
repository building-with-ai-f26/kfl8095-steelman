import { afterAll, beforeAll, expect, test } from "vitest";
import * as order from "../../src/order.ts";
import * as read from "../../src/read.ts";
import * as votes from "../../src/votes.ts";
import * as writing from "../../src/writing.ts";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { useTestDatabase } from "../support/database.ts";
import { runSimulation } from "./world.ts";

// The simulation (plans/architecture.md §8): 300 random sequences per run,
// each on its own board, with the nine "always true" checks after every
// step. SIMULATION_RUNS sets a different number (the nightly run uses more).

const db = useTestDatabase({ migrated: true });
let kysely: Db;
beforeAll(() => {
  kysely = createDatabase(db.url);
});
afterAll(async () => {
  await kysely.destroy();
});

const RUNS = Number(process.env.SIMULATION_RUNS ?? 300);

test(`M-02, B-01, B-02, B-03, B-05, M0-5: all nine checks hold over ${RUNS} random sequences`, async () => {
  const tally = await runSimulation({ order, read, votes, writing }, { db: kysely, client: db.client }, { numRuns: RUNS });

  // A passing run should show it exercised what it claims to: print what happened, and insist on the basics.
  console.log(`Simulation: ${JSON.stringify(tally)}`);
  expect(tally.done).toBeGreaterThan(RUNS);
  expect(tally.updatesCompared).toBeGreaterThan(RUNS / 10);
  expect(tally.ordersPublished).toBeGreaterThan(0);
  expect(tally.queuedOffline).toBeGreaterThan(0);
  for (const reason of ["argument_deleted", "version_deleted", "revision_changed", "needs_evidence"]) expect(tally.refused[reason], reason).toBeGreaterThan(0);
}, 600_000);
