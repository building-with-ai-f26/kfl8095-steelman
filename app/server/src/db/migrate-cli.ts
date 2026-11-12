// `npm run db:migrate`: brings the database named by DATABASE_URL up to date.

import { migrate } from "./migrate.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Set DATABASE_URL first (see app/.env.example).");
  process.exit(1);
}

const { applied } = await migrate(databaseUrl);
console.log(applied.length > 0 ? `Applied ${applied.length}:\n  ${applied.join("\n  ")}` : "Nothing to apply: the database is up to date.");
