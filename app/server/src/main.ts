import { buildApp } from "./app.ts";
import type { AppDependencies } from "./app.ts";
import { createDatabase } from "./db/database.ts";
import { resendEmail, terminalEmail } from "./email.ts";
import { systemClock, systemIds, throwawaySecret } from "./system.ts";

// PORT is set by `npm run dev` locally and by the host when deployed.
const port = Number(process.env.PORT || 3000);

// Only `npm run dev` says "development", which turns on the test-user switch.
// Anything else, including nothing, runs as production.
const mode = process.env.NODE_ENV === "development" ? "development" : "production";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) console.warn("DATABASE_URL isn't set, so only /api/health is available (see app/.env.example).");

// In the container (it sets WEB_DIRECTORY), a missing setting is a bad deploy: stop at once, so the release
// fails, rather than start without a database or sign-in and pass the health check.
const deployed = mode === "production" && Boolean(process.env.WEB_DIRECTORY);
const needed = ["DATABASE_URL", "APP_ORIGIN", "BETTER_AUTH_SECRET", "RESEND_API_KEY", "EMAIL_FROM"].filter((name) => !process.env[name]);
if (deployed && needed.length > 0) {
  console.error(`Not starting: ${needed.join(", ")} not set (see app/.env.example).`);
  process.exit(1);
}

// Sign-in. Locally, codes are printed to the terminal. Deployed, they're
// emailed through Resend (M1-14a), and the service needs its address and a
// signing secret; without all of them it runs without sign-in rather than
// print codes into its logs.
function signInFor(): AppDependencies["signIn"] {
  if (mode === "development") {
    return {
      origin: process.env.APP_ORIGIN || "http://localhost:5173",
      secret: process.env.BETTER_AUTH_SECRET || throwawaySecret(),
      email: terminalEmail,
      ...googleFor(),
    };
  }
  const { APP_ORIGIN: origin, BETTER_AUTH_SECRET: secret, RESEND_API_KEY: apiKey, EMAIL_FROM: from } = process.env;
  const missing = Object.entries({ APP_ORIGIN: origin, BETTER_AUTH_SECRET: secret, RESEND_API_KEY: apiKey, EMAIL_FROM: from })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    console.warn(`Sign-in is off: ${missing.join(", ")} not set (see app/.env.example).`);
    return undefined;
  }
  // Trimmed: a secret pasted into Secret Manager easily keeps a newline, which breaks an HTTP header.
  return { origin: origin!, secret: secret!, email: resendEmail({ apiKey: apiKey!.trim(), from: from! }), ...googleFor() };
}
const signIn = databaseUrl ? signInFor() : undefined;

// Google sign-in, when both of its settings are there. Locally, the staging
// OAuth client, which lists http://localhost:5173 (plans/build-plan.md, M1).
function googleFor(): { google?: NonNullable<AppDependencies["signIn"]>["google"] } {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (clientId && clientSecret) return { google: { clientId, clientSecret } };
  if (clientId || clientSecret) console.warn("Google sign-in is off: it needs both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  return {};
}

// Analytics in the browser (M-08), when there's a PostHog key. Without one, the web app sends nothing.
const posthogKey = process.env.POSTHOG_KEY;
const analytics = posthogKey ? { key: posthogKey, host: process.env.POSTHOG_HOST || "https://us.i.posthog.com" } : undefined;

const app = buildApp({
  clock: systemClock,
  ids: systemIds,
  mode,
  // In the container, the built web app is served from the same address as the API (M1-14a).
  ...(process.env.WEB_DIRECTORY ? { webDirectory: process.env.WEB_DIRECTORY } : {}),
  // Deployed, one JSON line per request for Cloud Logging. `npm run dev` keeps its terminal quiet.
  ...(mode === "production" ? { logs: process.stdout } : {}),
  ...(analytics ? { analytics } : {}),
  ...(databaseUrl ? { database: createDatabase(databaseUrl) } : {}),
  ...(signIn ? { signIn } : {}),
});
// In a container the service must listen on every address (HOST=0.0.0.0); on a laptop, only this machine.
const host = process.env.HOST || "127.0.0.1";
await app.listen({ port, host });
console.log(`Steelman service listening on http://${host}:${port} (${mode})`);
