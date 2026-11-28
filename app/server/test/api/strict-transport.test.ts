import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { buildApp } from "../../src/app.ts";
import { createDatabase } from "../../src/db/database.ts";
import { useTestDatabase } from "../support/database.ts";
import { outboxEmail } from "../support/outbox.ts";

// Strict-Transport-Security (M-07, M3d-29 in plans/build-plan.md; F20 in
// plans/reviews/public-spaces-security-review.md).
// When the service's address (APP_ORIGIN) is https, every answer tells the
// browser to come back over https for a year: the page, its files, API
// answers, 404s, and refusals. The value is exactly max-age=31536000, with
// no includeSubDomains and no preload, because both are hard to undo. When
// the address is http, as on a local run, no answer carries it.

const db = useTestDatabase({ migrated: true });
const clock = createFakeClock(new Date("2026-11-28T12:00:00Z"));

const web = mkdtempSync(join(tmpdir(), "steelman-strict-transport-"));
writeFileSync(join(web, "index.html"), '<!doctype html><title>Steelman</title><div id="root"></div><script type="module" crossorigin src="/assets/index-abc123.js"></script>');
mkdirSync(join(web, "assets"));
writeFileSync(join(web, "assets", "index-abc123.js"), "console.log(1)");

/** The service as deployed, at `origin`, with its own pool (closing the app ends the pool). */
const serviceAt = (origin: string, seed: number) =>
  buildApp({
    clock,
    ids: createSeededIds(seed),
    mode: "production",
    database: createDatabase(db.url),
    webDirectory: web,
    signIn: { origin, secret: "test-only-signing-key-not-a-secret-0000000000", email: outboxEmail([]) },
  });

// The database exists only once the file's tests start, so the services are built then.
let secure: FastifyInstance;
let local: FastifyInstance;
beforeAll(() => {
  secure = serviceAt("https://steelman.test", 3501);
  local = serviceAt("http://localhost:5173", 3502);
});
afterAll(async () => {
  await secure.close();
  await local.close();
});

/** Each kind of answer, with the status it should have, so a wrong route can't pass by accident. */
const answers: { what: string; method: "GET" | "POST"; url: string; headers?: Record<string, string>; status: number }[] = [
  { what: "the page", method: "GET", url: "/", status: 200 },
  { what: "an asset", method: "GET", url: "/assets/index-abc123.js", status: 200 },
  { what: "an API answer", method: "GET", url: "/api/health", status: 200 },
  { what: "the config answer", method: "GET", url: "/api/config", status: 200 },
  { what: "sign-in's own answer", method: "GET", url: "/api/auth/get-session", status: 200 },
  { what: "a 404 under /api", method: "GET", url: "/api/no-such-thing", status: 404 },
  { what: "a 404 for a missing asset", method: "GET", url: "/assets/missing.js", status: 404 },
  { what: "a signed-out refusal", method: "GET", url: "/api/account", status: 401 },
  { what: "a refused test user", method: "GET", url: "/api/account", headers: { "x-steelman-test-user": "anyone" }, status: 403 },
  { what: "a refused zero byte", method: "GET", url: "/api/health%00", status: 400 },
];

describe("Strict-Transport-Security", () => {
  test("M-07: with an https APP_ORIGIN, every answer carries exactly max-age=31536000", async () => {
    for (const { what, method, url, headers, status } of answers) {
      const response = await secure.inject({ method, url, headers });
      expect(response.statusCode, what).toBe(status);
      expect(response.headers["strict-transport-security"], what).toBe("max-age=31536000");
    }
  });

  test("M-07: with an http APP_ORIGIN, no answer carries it", async () => {
    for (const { what, method, url, headers, status } of answers) {
      const response = await local.inject({ method, url, headers });
      expect(response.statusCode, what).toBe(status);
      expect(response.headers["strict-transport-security"], what).toBeUndefined();
    }
  });
});
