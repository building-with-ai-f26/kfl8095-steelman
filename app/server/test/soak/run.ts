// `npm run test:soak`: the nightly soak run (plans/architecture.md §8, layer
// 8). 30 voters for five minutes against a running service, in real time,
// then a recount. SOAK_VOTERS, SOAK_SECONDS, and SOAK_SEED change it; the
// seed is printed so a failing run's choices can be replayed (its timing
// can't). Exits 1 if anything was wrong.

import pg from "pg";
import { migrate } from "../../src/db/migrate.ts";
import { startPostgres } from "../support/postgres.ts";
import { soak } from "./soak.ts";

const voters = Number(process.env.SOAK_VOTERS ?? 30);
const seconds = Number(process.env.SOAK_SECONDS ?? 300);
const seed = Number(process.env.SOAK_SEED ?? Math.floor(Math.random() * 2 ** 31));

const postgres = await startPostgres();
let failed: boolean;
try {
  const admin = new pg.Client({ connectionString: postgres.url });
  await admin.connect();
  await admin.query("create database soak");
  await admin.end();
  const url = new URL(postgres.url);
  url.pathname = "/soak";
  await migrate(url.href);

  // People pause between actions about as long as they take to read a card.
  const result = await soak({ databaseUrl: url.href, voters, stop: { seconds }, pauseMs: [300, 2700], seed, log: console.log });
  for (const error of result.errors.slice(0, 20)) console.log(`  error: ${error}`);
  for (const row of result.drifted) console.log(`  drifted: ${row}`);
  for (const who of result.disagreeing) console.log(`  disagrees with a fresh reader: ${who}`);
  failed = result.errors.length > 0 || result.drifted.length > 0 || result.disagreeing.length > 0;
  console.log(failed ? `Soak FAILED (seed ${seed}).` : `Soak passed: stored counts equal a recount, and every reader agrees with a fresh one (seed ${seed}).`);
} finally {
  await postgres.stop();
}
process.exit(failed ? 1 : 0);
