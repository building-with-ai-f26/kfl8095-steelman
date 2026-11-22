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
import pg from "pg";
import { sql } from "kysely";
import type { Page } from "@playwright/test";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { buildApp } from "../../server/src/app.ts";
import type { Limits } from "../../server/src/limits.ts";
import { createDatabase } from "../../server/src/db/database.ts";
import { seedDemoBoard } from "../../server/src/demo-board.ts";
import type { DemoBoard } from "../../server/src/demo-board.ts";
import { startFakeGoogle } from "../../server/test/support/fake-google.ts";
import type { FakeGoogle } from "../../server/test/support/fake-google.ts";
import { outboxEmail } from "../../server/test/support/outbox.ts";
import type { Sent } from "../../server/test/support/outbox.ts";
import { copyTemplate, dropDatabase, serveWebApp } from "./board.ts";

const NOON = new Date("2026-11-16T12:00:00Z");
/** The demo board's question (server/src/demo-board.ts). */
export const QUESTION = "Should our library open on Sundays?";

/** A phone, as Chrome on Android reports one: 375 px wide, touch, a phone's user agent (M-03). */
export const PHONE = {
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
};

export interface SignInSite {
  /** Where the site is, such as http://127.0.0.1:51234. */
  origin: string;
  demo: DemoBoard;
  /** The demo board's address on the site. */
  boardPath: string;
  google: FakeGoogle;
  /** The latest code emailed to an address. */
  codeFor(email: string): string;
  /** How many emails an address has been sent: codes and notes. */
  sentTo(email: string): number;
  /** Every email an address has been sent, oldest first. */
  sentAll(email: string): Sent[];
  /** Ages every code waiting to be typed past its ten minutes. (Better Auth checks expiry on the real clock.) */
  expireCodes(): Promise<void>;
  /** Runs SQL on the site's database, as its owner: for setting up what the app can't do yet, such as inviting someone (H-01). */
  sql(text: string, values?: unknown[]): Promise<void>;
  /** A new browser session, signed out, at this width; or, with `phone`, as a phone: 375 px, touch, and a phone's user agent (M-03). */
  browse(options?: { width?: number; phone?: true }): Promise<Page>;
  /** Every unexpected console error and uncaught exception so far. */
  errors: string[];
}

export const test = base.extend<{ site: SignInSite; limits: Limits | undefined; tour: boolean }>({
  // `test.use({ limits })` gives the service its own rate limits, small enough to reach (M-12). Without it, the class trial's.
  limits: [undefined, { option: true }],
  // `test.use({ tour: true })` leaves accounts never shown the tour (L-02), as on the real site. Without it, every
  // account here, the ones signing in for the first time included, has been shown it, so it doesn't cover the board
  // a test is about. Only in this test's own copy of the database.
  tour: [false, { option: true }],
  site: async ({ browser, limits, tour }, use) => {
    const databaseUrl = await copyTemplate();
    const clock = createFakeClock(NOON);
    const ids = createSeededIds(11);
    const db = createDatabase(databaseUrl.href);
    const demo = await seedDemoBoard(db, clock, ids);
    if (!tour) {
      await db.updateTable("account").set({ tour_seen_at: NOON }).execute();
      await sql`alter table account alter column tour_seen_at set default ${sql.lit(NOON.toISOString())}`.execute(db);
    }
    await db.destroy();

    // Writes must come from the site's own origin, so the port is chosen before the service is built.
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    // The fake Google signs its tokens with the real time, not the test clock: Better Auth checks a token's
    // expiry against the real clock, and the service runs in this process, where that clock isn't faked (the API
    // tests fake it with vi.useFakeTimers). With the test clock, every token expired once the real day passed
    // the test clock's hour plus one (13:00 UTC, November 16).
    const google = await startFakeGoogle({ now: () => new Date() });
    const outbox: Sent[] = [];
    const app = buildApp({
      clock,
      ids,
      database: createDatabase(databaseUrl.href),
      mode: "test",
      ...(limits ? { limits } : {}),
      signIn: {
        origin,
        // Not a secret: it signs cookies in a throwaway test database only.
        secret: "e2e-only-signing-key-not-a-secret-000000000000",
        email: outboxEmail(outbox),
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
        const sent = outbox.filter((message) => message.to === email.toLowerCase() && message.code !== "").at(-1);
        if (!sent) throw new Error(`No code was emailed to ${email}`);
        return sent.code;
      },
      sentTo: (email) => outbox.filter((message) => message.to === email.toLowerCase()).length,
      sentAll: (email) => outbox.filter((message) => message.to === email.toLowerCase()),
      async expireCodes() {
        await site.sql("update sign_in.sign_in_code set expires_at = now() - interval '1 minute' where identifier like 'sign-in-otp-%' or identifier like 'change-email-otp-%'");
      },
      async sql(text, values) {
        const client = new pg.Client({ connectionString: databaseUrl.href });
        await client.connect();
        try {
          await client.query(text, values);
        } finally {
          await client.end();
        }
      },
      async browse({ width = 1280, phone } = {}) {
        const context = await browser.newContext(phone ? { baseURL: origin, ...PHONE } : { baseURL: origin, viewport: { width, height: 900 } });
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

/** Reading a board, or its changes: the only board requests a lost access refuses with no fault. */
const BOARD_READ = /^\/api\/boards\/[^/?]+(\/changes\?after=\d+)?$/;

/**
 * The browser logs every refused request, such as a wrong code (400), one
 * email too many (429), or the service being down (503, as a test makes it).
 * Those are answers the sign-in screens expect, not faults, so they aren't
 * counted as errors. So is a board refusing to be read by someone whose
 * access has just ended (403), which the board screen expects too; a
 * refused write still counts.
 */
function isRefusedSignIn(text: string, url: string): boolean {
  const refused = (status: string) => new RegExp(`Failed to load resource: the server responded with a status of ${status}`).test(text);
  return (refused("[45]\\d\\d") && url.includes("/api/auth/")) || (refused("403") && BOARD_READ.test(new URL(url).pathname + new URL(url).search));
}

/**
 * A port nothing is listening on, for the service to listen on next. It's
 * chosen at random below the range the system hands out for outgoing
 * connections (32768 and up on Linux, 49152 and up on macOS): a port from that
 * range, freed here, could be taken by a connection before the service
 * listens on it, which CI saw as EADDRINUSE. Below it, only another worker
 * picking the same number at the same moment could, which is far rarer.
 */
async function freePort(): Promise<number> {
  for (;;) {
    const port = 20_000 + Math.floor(Math.random() * 12_000);
    if (await canListen(port)) return port;
  }
}

/** Whether the port is free. Only "in use" means try another; any other error (no loopback, too many open files) is the real one. */
function canListen(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => (error.code === "EADDRINUSE" ? resolve(false) : reject(error)));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
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
