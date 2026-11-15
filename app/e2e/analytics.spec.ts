// Analytics on the app (M-08), in the browser: the first-visit notice, OK
// and Turn off, and the privacy signals. PostHog is a recorder here: its
// script comes from a made-up address that this file answers, so no test
// reaches PostHog, and each test reads what the app told it.

import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import { TEST_POSTHOG } from "./support/board.ts";

/** Stands in for PostHog's script: notes how it was started and every call made to it. */
const RECORDER = `(() => {
  const queued = window.posthog;
  const calls = (window.__posthogCalls = []);
  for (const [key, options] of queued._i) calls.push(["init", key, options]);
  for (const call of queued) calls.push(call);
  window.posthog = new Proxy({ __loaded: true }, { get: (target, name) => (name in target ? target[name] : (...args) => void calls.push([name, ...args])) });
})();`;

/** Answers PostHog's address in this browser session, and lists every request made to it. */
function recordPostHog(requests: string[]) {
  return (context: BrowserContext) =>
    context.route(`${TEST_POSTHOG.host}/**`, (route) => {
      requests.push(route.request().url());
      return route.fulfill({ contentType: "text/javascript", body: RECORDER });
    });
}

const notice = (page: Page) => page.getByRole("region", { name: "Analytics" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const calls = (page: Page): Promise<any[][]> => page.evaluate(() => (window as any).__posthogCalls ?? []);
const named = async (page: Page, name: string) => (await calls(page)).filter((call) => call[0] === name);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loaded = (page: Page) => page.waitForFunction(() => Array.isArray((window as any).__posthogCalls));

/** Loads the page again and waits until the app has asked the service about analytics. */
async function reload(page: Page): Promise<void> {
  const asked = page.waitForResponse((response) => response.url().endsWith("/api/config"));
  await page.reload();
  await asked;
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test.describe("with a PostHog key", () => {
  test.use({ analytics: true });

  test("M-08: on a first visit PostHog starts, with typed text hidden and no one identified, and the notice asks", async ({ board }) => {
    const requests: string[] = [];
    const page = await board.open("maya.chen", { prepare: recordPostHog(requests) });

    await expect(notice(page)).toBeVisible();
    await expect(notice(page)).toContainText("Steelman records anonymous usage and screen replays to improve it. Typed text is hidden.");
    await loaded(page);
    expect(requests).toEqual([`${TEST_POSTHOG.host}/static/array.js`]);

    const [init] = await named(page, "init");
    expect(init?.[1]).toBe(TEST_POSTHOG.key);
    expect(init?.[2]).toMatchObject({
      api_host: TEST_POSTHOG.host,
      person_profiles: "identified_only",
      respect_dnt: true,
      session_recording: { maskAllInputs: true },
    });
    expect(await named(page, "register")).toEqual([["register", { environment: "local", page: "app" }]]);
    expect(await named(page, "identify")).toEqual([]);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });

  test("M-08: OK closes the notice for good, and analytics carry on", async ({ board }) => {
    const requests: string[] = [];
    const page = await board.open("maya.chen", { prepare: recordPostHog(requests) });

    await notice(page).getByRole("button", { name: "OK" }).click();
    await expect(notice(page)).toHaveCount(0);
    expect(await named(page, "opt_out_capturing")).toEqual([]);

    await reload(page);
    await expect.poll(() => requests.length).toBe(2);
    await expect(notice(page)).toHaveCount(0);
  });

  test("M-08: Turn off tells PostHog to stop at once, and from then on PostHog is never loaded", async ({ board }) => {
    const requests: string[] = [];
    const page = await board.open("maya.chen", { prepare: recordPostHog(requests) });

    await loaded(page);
    await notice(page).getByRole("button", { name: "Turn off" }).click();
    await expect(notice(page)).toHaveCount(0);
    expect(await named(page, "opt_out_capturing")).toHaveLength(1);
    expect(await named(page, "stopSessionRecording")).toHaveLength(1);

    await reload(page);
    await expect(notice(page)).toHaveCount(0);
    expect(requests).toHaveLength(1);
    expect(await calls(page)).toEqual([]);
  });

  for (const signal of ["globalPrivacyControl", "doNotTrack"] as const) {
    test(`M-08: with ${signal} set in the browser, PostHog is never loaded and nothing asks`, async ({ board }) => {
      const requests: string[] = [];
      const page = await board.open("maya.chen", {
        prepare: async (context) => {
          await recordPostHog(requests)(context);
          await context.addInitScript((name) => Object.defineProperty(Navigator.prototype, name, { get: () => (name === "doNotTrack" ? "1" : true) }), signal);
        },
      });

      await reload(page);
      await expect(notice(page)).toHaveCount(0);
      expect(requests).toEqual([]);
      expect(await calls(page)).toEqual([]);
    });
  }
});

test("M-08: a service with no PostHog key loads nothing from anywhere else and shows no notice", async ({ board }) => {
  const elsewhere: string[] = [];
  const page = await board.open("maya.chen", {
    prepare: async (context) => {
      context.on("request", (request) => {
        if (!request.url().startsWith("http://127.0.0.1:")) elsewhere.push(request.url());
      });
    },
  });

  await reload(page);
  await expect(notice(page)).toHaveCount(0);
  expect(elsewhere).toEqual([]);
});
