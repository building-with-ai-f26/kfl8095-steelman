import { afterAll, beforeAll, expect, test } from "vitest";
import * as order from "../../src/order.ts";
import * as read from "../../src/read.ts";
import * as votes from "../../src/votes.ts";
import * as writing from "../../src/writing.ts";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { useTestDatabase } from "../support/database.ts";
import { EVERY_STALE_REFUSAL, emptyTally, playSequence } from "./world.ts";

// The sequence every simulation run plays before its random ones (world.ts):
// on its own, with all nine checks after each step, it must produce each way
// an action goes stale. Without it, a run of 300 random sequences now and then
// produced no action on a deleted argument, and the simulation's own test
// failed by chance (PR 71's check, Nov 18).

const db = useTestDatabase({ migrated: true });
let kysely: Db;
beforeAll(() => {
  kysely = createDatabase(db.url);
});
afterAll(async () => {
  await kysely.destroy();
});

test("M-02, M0-5: the sequence each simulation run starts with refuses an action on a deleted argument, a deleted wording, a changed revision, and an assessment without evidence", async () => {
  const tally = emptyTally();

  await playSequence({ order, read, votes, writing }, { db: kysely, client: db.client }, EVERY_STALE_REFUSAL, tally);

  expect(tally.refused.argument_deleted, "argument_deleted").toBeGreaterThan(0);
  expect(tally.refused.version_deleted, "version_deleted").toBeGreaterThan(0);
  expect(tally.refused.revision_changed, "revision_changed").toBeGreaterThan(0);
  // Ben marks his own wording, which cites nothing, as supported.
  expect(tally.refused.needs_evidence, "needs_evidence").toBeGreaterThan(0);
});
