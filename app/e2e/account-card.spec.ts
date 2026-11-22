// M2-8a, the account card (L-04, M-08): the usage-analytics switch on Your
// account, as the prototype's privacyGroup has it, changing the same choice as
// the first-visit notice and the privacy page. Sign out is in sign-out.spec.ts,
// since it needs a real sign-in.

import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Page } from "@playwright/test";
import { TEST_POSTHOG, expect, test } from "./support/board.ts";

const analyticsRow = (page: Page) => page.getByRole("region", { name: "Your account" }).locator(".sm-rrow", { hasText: "Usage analytics" });
const status = (page: Page) => page.locator("#sm-status");

/** Stands in for PostHog's script, so nothing reaches PostHog. */
const quietPostHog = (context: BrowserContext) => context.route(`${TEST_POSTHOG.host}/**`, (route) => route.fulfill({ contentType: "text/javascript", body: "" }));

test.describe("with a PostHog key", () => {
  test.use({ analytics: true });

  test("M2-8a, L-04, M-08: Your account turns usage analytics off and on in this browser, and the notice goes", async ({ board }) => {
    const page = await board.open("maya.chen", { prepare: quietPostHog });
    await page.goto("/account");

    await expect(analyticsRow(page)).toContainText("Steelman sends PostHog the pages you visit, what you click, and replays of your screen. Anything you type is hidden.");
    await expect(analyticsRow(page)).toContainText("On");
    await analyticsRow(page).getByRole("button", { name: "Turn off" }).click();

    await expect(analyticsRow(page)).toContainText("Off");
    await expect(status(page)).toHaveText("Usage analytics are off. Nothing more is sent from this browser.");
    expect(await page.evaluate(() => localStorage.getItem("steelman-analytics"))).toBe("off");
    // PostHog's own stub keeps the calls until its script runs; the quiet stand-in never runs them.
    expect(await page.evaluate(() => ((window as unknown as { posthog: unknown[][] }).posthog).map((call) => call[0]))).toContain("opt_out_capturing");
    await expect(page.getByRole("region", { name: "Analytics" })).toHaveCount(0);
    await expect(analyticsRow(page).getByRole("button", { name: "Turn on" })).toBeFocused();

    await analyticsRow(page).getByRole("button", { name: "Turn on" }).click();
    await expect(analyticsRow(page)).toContainText("On");
    await expect(status(page)).toHaveText("Usage analytics are on.");
    expect(await page.evaluate(() => localStorage.getItem("steelman-analytics"))).toBe("on");
  });

  for (const width of [1280, 375]) {
    test(`M2-8a, M-04: Your account with the analytics row and Sign out passes an accessibility scan, at ${width} px`, async ({ board }) => {
      const page = await board.open("maya.chen", { width, prepare: quietPostHog });
      await page.goto("/account");
      await expect(analyticsRow(page).getByRole("button", { name: "Turn off" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }

  test("M2-8a, L-04, M-08: Turn off on the first-visit notice changes the row too", async ({ board }) => {
    const page = await board.open("maya.chen", { prepare: quietPostHog });
    await page.goto("/account");
    await expect(analyticsRow(page)).toContainText("On");

    await page.getByRole("region", { name: "Analytics" }).getByRole("button", { name: "Turn off" }).click();

    await expect(analyticsRow(page).getByRole("button", { name: "Turn on usage analytics" })).toBeVisible();
    await expect(analyticsRow(page)).toContainText("Off");
  });

  test("M2-8a, L-04, M-08: the privacy page shows the choice made on Your account", async ({ board }) => {
    const page = await board.open("maya.chen", { prepare: quietPostHog });
    await page.goto("/account");
    await analyticsRow(page).getByRole("button", { name: "Turn off" }).click();
    await expect(analyticsRow(page)).toContainText("Off");

    await page.goto("/privacy");
    await expect(page.locator("#sm-analytics-state")).toHaveText("Usage analytics are off in this browser.");
  });

  test("M2-8a, L-04, M-08: with Global Privacy Control, the row says analytics are off because the browser asked, and offers no switch", async ({ board }) => {
    const page = await board.open("maya.chen", {
      prepare: async (context) => {
        await quietPostHog(context);
        await context.addInitScript(() => Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true }));
      },
    });
    await page.goto("/account");

    await expect(analyticsRow(page)).toContainText("Off");
    await expect(analyticsRow(page)).toContainText("Your browser asks sites not to track you.");
    await expect(analyticsRow(page).getByRole("button")).toHaveCount(0);
  });
});

test("M2-8a, L-04, M-08: with no PostHog key, Your account has no analytics row", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.goto("/account");

  await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
  await expect(analyticsRow(page)).toHaveCount(0);
});

test("M2-8b, L-04: the demo's test people, who have no email and can't sign in, see no ways in on Your account", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in with" })).toHaveCount(0);
});
