import { buildApp } from "./app.ts";
import type { AppDependencies } from "./app.ts";
import { createDatabase } from "./db/database.ts";
import { terminalEmail } from "./email.ts";
import { systemClock, systemIds, throwawaySecret } from "./system.ts";

// PORT is set by `npm run dev` locally and by the host when deployed.
const port = Number(process.env.PORT || 3000);

// Only `npm run dev` says "development", which turns on the test-user switch.
// Anything else, including nothing, runs as production.
const mode = process.env.NODE_ENV === "development" ? "development" : "production";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) console.warn("DATABASE_URL isn't set, so only /api/health is available (see app/.env.example).");

// Sign-in. Locally, codes are printed to the terminal. A deployed service
// has no way to send email until Resend is added (M1-14), so until then it
// runs without sign-in rather than print codes into its logs.
function signInFor(): AppDependencies["signIn"] {
  if (mode === "development") {
    return {
      origin: process.env.APP_ORIGIN || "http://localhost:5173",
      secret: process.env.BETTER_AUTH_SECRET || throwawaySecret(),
      email: terminalEmail,
    };
  }
  console.warn("Sign-in is off: no way to send email yet (M1-14).");
  return undefined;
}
const signIn = databaseUrl ? signInFor() : undefined;

const app = buildApp({
  clock: systemClock,
  ids: systemIds,
  mode,
  ...(databaseUrl ? { database: createDatabase(databaseUrl) } : {}),
  ...(signIn ? { signIn } : {}),
});
await app.listen({ port, host: "127.0.0.1" });
console.log(`Steelman service listening on http://127.0.0.1:${port} (${mode})`);
