// The builder's operator commands (J-06, M3d-36; jobs/operator.ts), run by
// hand as a Cloud Run job: `node server/dist/operator-cli.mjs suspend lin_zhao`
// in the container, or `npx tsx server/src/jobs/operator-cli.ts suspend lin_zhao`
// here. infra/README.md, "Taking something down", has the exact commands.

import { createDatabase } from "../db/database.ts";
import { systemClock } from "../system.ts";
import { parseOperatorArgs, runOperator } from "./operator.ts";

const command = parseOperatorArgs(process.argv.slice(2));
if ("error" in command) {
  console.error(command.error);
  process.exit(1);
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Set DATABASE_URL first (see app/.env.example).");
  process.exit(1);
}
const db = createDatabase(databaseUrl);
try {
  const { ok, sentence } = await runOperator(db, systemClock, command);
  if (ok) console.log(sentence);
  else {
    console.error(sentence);
    process.exitCode = 1;
  }
} finally {
  await db.destroy();
}
