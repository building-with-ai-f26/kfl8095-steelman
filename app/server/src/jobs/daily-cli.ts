// The daily call, run as a Cloud Run job: `node server/dist/daily-cli.mjs`
// in the container, or `npx tsx server/src/jobs/daily-cli.ts` here.

import { createDatabase } from "../db/database.ts";
import { systemClock } from "../system.ts";
import { dailyCleanUp } from "./daily.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Set DATABASE_URL first (see app/.env.example).");
  process.exit(1);
}
const db = createDatabase(databaseUrl);
try {
  console.log(JSON.stringify({ severity: "INFO", message: "daily clean-up", ...(await dailyCleanUp(db, systemClock)) }));
} finally {
  await db.destroy();
}
