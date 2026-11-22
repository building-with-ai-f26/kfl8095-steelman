// Server events (M2-12, M-08; plans/architecture.md Q29), the browser's part:
// each write carries the browser's analytics choice, so the service sends an
// event only when this browser's analytics are on. Turned off, with Global
// Privacy Control or Do Not Track, or with no PostHog key, writes carry no
// say-so and the service sends nothing (server/test/api/server-events.test.ts).

import type { BrowserContext, Page, Request } from "@playwright/test";
import { TEST_POSTHOG, expect, test } from "./support/board.ts";
import type { OpenOptions, TestBoard } from "./support/board.ts";
import { importance } from "./support/screen.ts";

const TOP = "Sunday is the only free day for many people who work weekdays.";
const quietPostHog = (context: BrowserContext) => context.route(`${TEST_POSTHOG.host}/**`, (route) => route.fulfill({ contentType: "text/javascript", body: "" }));

/** Opens the board and waits until the browser has asked the service where analytics go, which is when it decides whether they're on. */
async function openDecided(board: TestBoard, options: OpenOptions = {}): Promise<Page> {
  let answered: Promise<unknown> = Promise.resolve();
  const page = await board.open("tess.b", {
    ...options,
    prepare: async (context) => {
      await options.prepare?.(context);
      answered = context.waitForEvent("response", (response) => new URL(response.url()).pathname === "/api/config");
    },
  });
  await answered;
  // The decision follows the answer in the same turn of the page's work; one more turn is enough.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
  return page;
}

/** Votes on the top argument, and answers the analytics header the vote was sent with. */
async function voteSays(page: Page, button: "More important if true" | "Less important if true"): Promise<string | undefined> {
  const sent = page.waitForRequest((request: Request) => request.method() === "PUT" && request.url().endsWith("/importance"));
  await importance(page, TOP).getByRole("button", { name: button }).click();
  return (await sent).headers()["x-steelman-analytics"];
}

test.describe("with a PostHog key", () => {
  test.use({ analytics: true });

  test("M2-12, M-08: with analytics on, a vote says so; after Turn off, the next vote doesn't", async ({ board }) => {
    const page = await board.open("tess.b", { prepare: quietPostHog });
    await expect(page.getByRole("region", { name: "Analytics" })).toBeVisible();

    expect(await voteSays(page, "More important if true")).toBe("on");

    await page.getByRole("region", { name: "Analytics" }).getByRole("button", { name: "Turn off" }).click();
    expect(await voteSays(page, "Less important if true")).toBeUndefined();
  });

  test("M2-12, M-08: with Global Privacy Control, a vote doesn't say analytics are on", async ({ board }) => {
    const page = await openDecided(board, {
      prepare: async (context) => {
        await quietPostHog(context);
        await context.addInitScript(() => Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true }));
      },
    });

    expect(await voteSays(page, "More important if true")).toBeUndefined();
  });

  test("M2-12, M-08: Turn on from the privacy page, after an earlier Turn off, makes the next vote say so again", async ({ board }) => {
    const page = await openDecided(board, {
      prepare: async (context) => {
        await quietPostHog(context);
        await context.addInitScript(() => {
          if (!sessionStorage.getItem("seeded")) {
            localStorage.setItem("steelman-analytics", "off");
            sessionStorage.setItem("seeded", "1");
          }
        });
      },
    });
    expect(await voteSays(page, "More important if true")).toBeUndefined();

    await page.goto("/privacy");
    await page.locator("main").getByRole("button", { name: "Turn on" }).click();
    await expect(page.locator("#sm-analytics-state")).toHaveText("Usage analytics are on in this browser.");
    const asked = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/config");
    await page.goBack();
    await asked;
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(await voteSays(page, "Less important if true")).toBe("on");
  });
});

test("M2-12, M-08: with no PostHog key, a vote doesn't say analytics are on", async ({ board }) => {
  const page = await openDecided(board);

  expect(await voteSays(page, "More important if true")).toBeUndefined();
});
