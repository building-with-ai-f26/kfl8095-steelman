// The `board` fixture: for each test, a fresh copy of the migrated database
// with the demo board in it, and the real service on its own port, serving
// both the API and the built web app. The service's clock is fake, so a test
// moves it to bring the next shared order due; the browser's clock is
// Playwright's, so a test moves it to bring the next poll due.

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { test as base, expect } from "@playwright/test";
import type { APIRequestContext, Browser, Page } from "@playwright/test";
import pg from "pg";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import type { FakeClock } from "@steelman/shared/testing";
import type { IdSource } from "@steelman/shared";
import { buildApp } from "../../server/src/app.ts";
import { createDatabase } from "../../server/src/db/database.ts";
import { seedDemoBoard } from "../../server/src/demo-board.ts";
import type { DemoBoard, DemoPerson } from "../../server/src/demo-board.ts";
import { TEMPLATE_DATABASE } from "./global-setup.ts";

const NOON = new Date("2026-11-16T12:00:00Z");
/** How often the board asks for changes (web/src/board/polling.ts). */
export const POLL_MS = 3_000;
/** How long a shared order stands (the board's tick_seconds). */
export const TICK_MS = 60_000;

export interface TestBoard {
  demo: DemoBoard;
  /** The service's clock. */
  clock: FakeClock;
  /** IDs for things a test writes through the API. */
  ids: IdSource;
  /** A new browser session acting as this person, with the board open. */
  open(person: DemoPerson, options?: { width?: number }): Promise<Page>;
  /** Calls the API as this person, the way the second person's browser would. */
  api(person: DemoPerson): Caller;
  /** Every console error and uncaught exception in any page so far. */
  errors: string[];
}

export interface Caller {
  /** The board as this person reads it. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  snapshot(): Promise<any>;
  put(path: string, body: unknown): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
  delete(path: string): Promise<unknown>;
}

export const test = base.extend<{ board: TestBoard }>({
  board: async ({ browser, playwright }, use) => {
    const databaseUrl = await copyTemplate();
    const clock = createFakeClock(NOON);
    const ids = createSeededIds(7);
    const db = createDatabase(databaseUrl.href);
    const demo = await seedDemoBoard(db, clock, ids);
    await db.destroy();

    const app = buildApp({ clock, ids, database: createDatabase(databaseUrl.href), mode: "test" });
    serveWebApp(app);
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (address === null || typeof address === "string") throw new Error("The service has no port");
    const origin = `http://127.0.0.1:${address.port}`;

    const errors: string[] = [];
    const requests: APIRequestContext[] = [];
    const board: TestBoard = {
      demo,
      clock,
      ids,
      errors,
      open: (person, options) => openAs(browser, origin, demo, person, errors, options),
      api(person) {
        const header = { "x-steelman-test-user": demo.people[person] };
        const ready = playwright.request.newContext({ baseURL: `${origin}/api/boards/${demo.board}/`, extraHTTPHeaders: header }).then((context) => {
          requests.push(context);
          return context;
        });
        const send = async (method: "get" | "put" | "post" | "delete", path: string, data?: unknown) => {
          const response = await (await ready)[method](path, data === undefined ? {} : { data });
          expect(response.ok(), `${method.toUpperCase()} ${path}: ${await response.text()}`).toBe(true);
          return response.json();
        };
        return {
          snapshot: () => send("get", `../${demo.board}`),
          put: (path, body) => send("put", path, body),
          post: (path, body) => send("post", path, body),
          delete: (path) => send("delete", path),
        };
      },
    };

    await use(board);

    for (const context of browser.contexts()) await context.close();
    for (const request of requests) await request.dispose();
    await app.close();
    await dropDatabase(databaseUrl);
    expect(errors, "Console errors").toEqual([]);
  },
});

export { expect };

/** Opens the board in a new browser session, as the given test user. */
async function openAs(browser: Browser, origin: string, demo: DemoBoard, person: DemoPerson, errors: string[], options: { width?: number } = {}): Promise<Page> {
  const context = await browser.newContext({ baseURL: origin, viewport: { width: options.width ?? 1280, height: 900 } });
  // The switch keeps the choice per tab, in sessionStorage (web/src/testUser.ts).
  await context.addInitScript((id) => sessionStorage.setItem("steelman.testUser", id), demo.people[person]);
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error" && !isExpectedOfflineError(message.text())) errors.push(`${person}: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`${person}: ${error.message}`));
  // Time runs as usual, but a test can move it on to the next poll.
  await page.clock.install();
  await page.goto(`/b/${demo.board}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should our library open on Sundays?");
  return page;
}

/** While a session is offline, the browser itself logs each request that fails. */
function isExpectedOfflineError(text: string): boolean {
  return text.includes("net::ERR_INTERNET_DISCONNECTED");
}

/** The built web app, from the same port as the API, as in production: any path that isn't a file gets the page. */
function serveWebApp(app: ReturnType<typeof buildApp>): void {
  const directory = process.env.E2E_WEB_DIRECTORY;
  if (!directory) throw new Error("The browser tests' global setup didn't run");
  const types: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png" };
  app.get("/*", async (request, reply) => {
    const path = normalize(decodeURIComponent(request.url.split("?")[0]!)).replace(/^(\.\.[/\\])+/, "");
    const file = extname(path) ? join(directory, path) : join(directory, "index.html");
    try {
      const body = await readFile(file);
      return reply.type(types[extname(file)] ?? "application/octet-stream").send(body);
    } catch {
      return reply.code(404).send("Not found");
    }
  });
}

async function copyTemplate(): Promise<URL> {
  const name = `e2e_${randomBytes(6).toString("hex")}`;
  await asAdmin((admin) => admin.query(`create database ${name} template ${TEMPLATE_DATABASE}`));
  const url = new URL(adminUrl());
  url.pathname = `/${name}`;
  return url;
}

async function dropDatabase(url: URL): Promise<void> {
  await asAdmin((admin) => admin.query(`drop database ${url.pathname.slice(1)} with (force)`));
}

function adminUrl(): string {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("The browser tests' global setup didn't run");
  return url;
}

async function asAdmin(work: (admin: pg.Client) => Promise<unknown>): Promise<void> {
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  try {
    await work(admin);
  } finally {
    await admin.end();
  }
}
