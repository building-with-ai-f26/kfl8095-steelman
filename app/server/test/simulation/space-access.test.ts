import { afterAll, beforeAll, test } from "vitest";
import * as access from "../../src/access.ts";
import * as list from "../../src/list.ts";
import * as sharing from "../../src/sharing.ts";
import * as spaces from "../../src/spaces.ts";
import * as writing from "../../src/writing.ts";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { useTestDatabase } from "../support/database.ts";
import { runSpaces } from "./space-world.ts";

// The simulation's spaces (G-04, G-05, H-02, M3d-18): random sequences of
// inviting to and removing from a space, changing each board's general access
// and role, moving boards in and out of the space, opening, and writing, with
// every person asking for every board after each step (space-world.ts). It
// runs one sequence for every 10 of the main simulation's: 30 by default, and
// more when SIMULATION_RUNS asks for more (the nightly run).

const db = useTestDatabase({ migrated: true });
let kysely: Db;
beforeAll(() => {
  kysely = createDatabase(db.url);
});
afterAll(async () => {
  await kysely.destroy();
});

const RUNS = Math.max(1, Math.round(Number(process.env.SIMULATION_RUNS ?? 300) / 10));

test(`G-04, G-05, H-02, M0-5: no one outside a space gets into a board shared with it, or writes without a role, over ${RUNS} random sequences`, async () => {
  await runSpaces({ access, list, sharing, spaces, writing }, { db: kysely, client: db.client }, { numRuns: RUNS });
}, 600_000);
