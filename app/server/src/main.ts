import { buildApp } from "./app.ts";
import { createDatabase } from "./db/database.ts";
import { systemClock, systemIds } from "./system.ts";

// PORT is set by `npm run dev` locally and by the host when deployed.
const port = Number(process.env.PORT || 3000);

// Only `npm run dev` says "development", which turns on the test-user switch.
// Anything else, including nothing, runs as production.
const mode = process.env.NODE_ENV === "development" ? "development" : "production";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) console.warn("DATABASE_URL isn't set, so only /api/health is available (see app/.env.example).");

const app = buildApp({
  clock: systemClock,
  ids: systemIds,
  mode,
  ...(databaseUrl ? { database: createDatabase(databaseUrl) } : {}),
});
await app.listen({ port, host: "127.0.0.1" });
console.log(`Steelman service listening on http://127.0.0.1:${port} (${mode})`);
