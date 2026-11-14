// The `site` fixture: like the board fixture (board.ts), a fresh copy of the
// migrated database with the demo board, and the real service serving the
// API and the built web app, but with sign-in turned on. Sign-in emails are
// kept in memory instead of sent, and Google is the stand-in that runs inside
// the tests (server/test/support/fake-google.ts), so nothing leaves the machine.
//
// Better Auth reads the system clock (plans/architecture.md §8, Q26), which
// here is the real one, so codes and sessions follow real time. The service's
// own clock is fake, as in the board fixture.

import { createServer } from "node:net";
import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { buildApp } from "../../server/src/app.ts";
import { createDatabase } from "../../server/src/db/database.ts";
import { seedDemoBoard } from "../../server/src/demo-board.ts";
import type { DemoBoard } from "../../server/src/demo-board.ts";
import { startFakeGoogle } from "../../server/test/support/fake-google.ts";
import type { FakeGoogle } from "../../server/test/support/fake-google.ts";
import { copyTemplate, dropDatabase, serveWebApp } from "./board.ts";

const NOON = new Date("2026-11-16T12:00:00Z");
/** The demo board's question (server/src/demo-board.ts). */
export const QUESTION = "Should our library open on Sundays?";

export interface SignInSite {
  /** Where the site is, such as http://127.0.0.1:51234. */
  origin: string;
  demo: DemoBoard;
  /** The demo board's address on the site. */
  boardPath: string;
  google: FakeGoogle;
  /** The latest code emailed to an address. */
  codeFor(email: string): string;
  /** How many sign-in emails an address has been sent. */
  sentTo(email: string): number;
  /** A new browser session, signed out, at this width. */
  browse(options?: { width?: number }): Promise<Page>;
  /** Every unexpected console error and uncaught exception so far. */
  errors: string[];
}

export const test = base.extend<{ site: SignInSite }>({
  site: async ({ browser }, use) => {
    const databaseUrl = await copyTemplate();
    const clock = createFakeClock(NOON);
    const ids = createSeededIds(11);
    const db = createDatabase(databaseUrl.href);
    const demo = await seedDemoBoard(db, clock, ids);
    await db.destroy();

    // Writes must come from the site's own origin, so the port is chosen before the service is built.
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    const google = await startFakeGoogle({ now: () => clock.now() });
    const outbox: { to: string; code: string }[] = [];
    const app = buildApp({
      clock,
      ids,
      database: createDatabase(databaseUrl.href),
      mode: "test",
      signIn: {
        origin,
        // Not a secret: it signs cookies in a throwaway test database only.
        secret: "e2e-only-signing-key-not-a-secret-000000000000",
        email: { sendSignInCode: async (to, code) => void outbox.push({ to, code }) },
        google: { clientId: google.clientId, clientSecret: google.clientSecret, discoveryUrl: google.discoveryUrl },
      },
    });
    serveWebApp(app);
    await app.listen({ port, host: "127.0.0.1" });

    const errors: string[] = [];
    const site: SignInSite = {
      origin,
      demo,
      boardPath: `/b/${demo.board}`,
      google,
      errors,
      codeFor(email) {
        const sent = outbox.filter((message) => message.to === email.toLowerCase()).at(-1);
        if (!sent) throw new Error(`No code was emailed to ${email}`);
        return sent.code;
      },
      sentTo: (email) => outbox.filter((message) => message.to === email.toLowerCase()).length,
      async browse({ width = 1280 } = {}) {
        const context = await browser.newContext({ baseURL: origin, viewport: { width, height: 900 } });
        const page = await context.newPage();
        page.on("console", (message) => {
          if (message.type() === "error" && !isRefusedSignIn(message.text(), message.location().url)) errors.push(message.text());
        });
        page.on("pageerror", (error) => errors.push(error.message));
        return page;
      },
    };

    await use(site);

    for (const context of browser.contexts()) await context.close();
    await app.close();
    await google.close();
    await dropDatabase(databaseUrl);
    expect(errors, "Console errors").toEqual([]);
  },
});

export { expect };

/**
 * The browser logs every refused request, such as a wrong code (400) or one
 * email too many (429). Those are answers the sign-in screens expect, not
 * faults, so they aren't counted as errors.
 */
function isRefusedSignIn(text: string, url: string): boolean {
  return /Failed to load resource: the server responded with a status of 4\d\d/.test(text) && url.includes("/api/auth/");
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/** Signs in by email code in the browser, choosing a username if asked. Ends on the board. */
export async function signInByCode(site: SignInSite, page: Page, email: string, username?: string): Promise<void> {
  await page.goto(site.boardPath);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  // The code is read once it has been sent, not before (an earlier sign-in's would still be in the outbox).
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your email");
  await page.getByLabel("Code").fill(site.codeFor(email));
  await page.getByRole("button", { name: "Sign in" }).click();
  if (username !== undefined) {
    await page.getByLabel("Username").fill(username);
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
}
