import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { buildApp } from "../../src/app.ts";
import type { AppDependencies } from "../../src/app.ts";
import { createDatabase } from "../../src/db/database.ts";
import { smokeTest } from "../../src/smoke.ts";
import { useTestDatabase } from "../support/database.ts";

// The smoke test after each deploy (M1-14c; plans/architecture.md §6). The
// builder's decision, Nov 17: signed out for now, so it needs no way in that
// production doesn't have. It checks what a visitor gets before signing in:
// the page and its built files, the security headers, the health and config
// answers, sign-in switched on, and a signed-out request refused.

const db = useTestDatabase({ migrated: true });
const clock = createFakeClock(new Date("2026-11-17T12:00:00Z"));

const web = mkdtempSync(join(tmpdir(), "steelman-smoke-"));
writeFileSync(join(web, "index.html"), '<!doctype html><title>Steelman</title><div id="root"></div><script type="module" crossorigin src="/assets/index-abc123.js"></script>');
mkdirSync(join(web, "assets"));
writeFileSync(join(web, "assets", "index-abc123.js"), "console.log(1)");

let running: FastifyInstance | undefined;
afterEach(async () => {
  await running?.close();
  running = undefined;
});

/** The service as deployed, on a port of its own; its address. */
async function serve(options: Partial<AppDependencies> = {}): Promise<string> {
  const port = 0;
  running = buildApp({ clock, ids: createSeededIds(1404), mode: "production", database: createDatabase(db.url), webDirectory: web, ...options });
  await running.listen({ port, host: "127.0.0.1" });
  const address = running.server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return `http://127.0.0.1:${address.port}`;
}

const signIn = (origin: string): AppDependencies["signIn"] => ({ origin, secret: "a-test-secret-that-is-long-enough-0123456789", email: { sendSignInCode: async () => {} } });

describe("the smoke test", () => {
  test("M-06: passes against the service as deployed, signed out", async () => {
    // Sign-in needs the service's own address, which is known only once it listens: listen, then rebuild on that port.
    const first = await serve();
    const port = Number(new URL(first).port);
    await running!.close();
    running = buildApp({ clock, ids: createSeededIds(1405), mode: "production", database: createDatabase(db.url), webDirectory: web, signIn: signIn(first) });
    await running.listen({ port, host: "127.0.0.1" });

    expect(await smokeTest(first)).toEqual([]);
  });

  test("M-06: says what's wrong when sign-in is off", async () => {
    const address = await serve();

    expect(await smokeTest(address)).toEqual(["Sign-in is off: GET /api/auth/get-session answered 404"]);
  });

  test("M-06: says what's wrong when the address doesn't answer at all", async () => {
    const failures = await smokeTest("http://127.0.0.1:9");

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^The page didn't load:/);
  });
});
