import { afterAll, beforeAll, test } from "vitest";
import * as profiles from "../../src/profiles.ts";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { useTestDatabase } from "../support/database.ts";
import { runProfiles } from "./profile-world.ts";

// The simulation's profile reads (L-03, M3d-16): random sequences of joining
// by a link, inviting, removing, turning a link off, writing, and hiding, over
// three boards, with every profile read by every person after each step
// (profile-world.ts). Each sequence reads sixteen profiles after every step,
// so it runs one sequence for every 15 of the main simulation's: 20 by
// default, and more when SIMULATION_RUNS asks for more (the nightly run).

const db = useTestDatabase({ migrated: true });
let kysely: Db;
beforeAll(() => {
  kysely = createDatabase(db.url);
});
afterAll(async () => {
  await kysely.destroy();
});

const RUNS = Math.max(1, Math.round(Number(process.env.SIMULATION_RUNS ?? 300) / 15));

test(`L-03, M0-5: no profile shows an item from a board where the viewer has no role, over ${RUNS} random sequences`, async () => {
  await runProfiles(profiles, { db: kysely, client: db.client }, { numRuns: RUNS });
}, 600_000);
