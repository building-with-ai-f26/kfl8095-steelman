// Profiles (L-03, L-04, M3d-16): /u/<username> shows a person's initials and
// username, with "you" on your own, and their arguments, wordings, and
// sources in tabs with counts, each linking to its card with its board and
// its age, as GitHub's profile tabs carry a count after each label and
// Wikipedia's Special:Contributions lists each edit with its page and time.
// Only boards where the viewer already has a role count (the service's rule,
// tested in server/test/api/profiles.test.ts). Bylines, the people list, and
// History's names become links that keep today's look, with an underline only
// on hover. No name reaches PostHog.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { TEST_POSTHOG, expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { find } from "./support/screen.ts";

const LINS = "Students need a quiet place to study before Monday exams.";
const MAYAS = "Sunday is the only free day for many people who work weekdays.";
const LINS_OTHER = "Sunday is the one day shift workers are free.";
const SURVEY = { name: "City library survey, 2025", locator: "https://example.test/survey", finding: "Most weekday visitors can’t come on weekdays.", backsUp: "", limits: "" };
const QUESTION = "Should our library open on Sundays?";
const NOTHING = "There is nothing here that you can open.";

const tab = (page: Page, name: RegExp) => page.getByRole("tab", { name });
const items = (page: Page) => page.getByRole("tabpanel").getByRole("listitem");

async function expectNoAxeViolations(page: Page): Promise<void> {
  // A tab just chosen fades to its new colours; the scan reads them once they have settled.
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Lin also words Maya's argument and cites a source on it, so each of her tabs holds one item. */
async function linWritesMore(board: TestBoard): Promise<string> {
  const { argument } = await find(board, MAYAS);
  const id = board.ids.itemId();
  await board.api("lin.zhao").post(`arguments/${argument}/versions`, { id, wording: LINS_OTHER, context: "" });
  await board.api("lin.zhao").post(`versions/${id}/sources`, { id: board.ids.itemId(), ...SURVEY });
  return id;
}

for (const width of [1280, 375]) {
  test(`L-03, L-04: at ${width} px, a byline opens the profile, the tabs and counts work, an item opens its card, and Back returns`, async ({ board }) => {
    const other = await linWritesMore(board);
    const { version } = await find(board, LINS);
    const page = await board.open("jordan_w", { width });

    // The byline is a link that looks as it did: the byline's own colour, and no underline until hovered.
    const byline = page.locator(`[data-card="${version}"] .sm-byline`).getByRole("link", { name: "lin.zhao" });
    await expect(byline).toHaveAttribute("href", "/u/lin.zhao");
    await expect(byline).toHaveClass(/ph-no-capture/);
    await expect(byline).toHaveCSS("text-decoration-line", "none");
    const bylineColor = await page.locator(`[data-card="${version}"] .sm-byline`).evaluate((element) => getComputedStyle(element).color);
    await expect(byline).toHaveCSS("color", bylineColor);
    if (width === 1280) {
      await byline.hover();
      await expect(byline).toHaveCSS("text-decoration-line", "underline");
    }
    await byline.click();

    await expect(page).toHaveURL("/u/lin.zhao");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("lin.zhao");
    await expect(page.locator(".sm-profile-avatar")).toHaveText("LZ");
    await expect(tab(page, /^Arguments 1$/)).toHaveAttribute("aria-selected", "true");
    await expect(tab(page, /^Wordings 1$/)).toHaveAttribute("aria-selected", "false");
    await expect(tab(page, /^Sources 1$/)).toBeVisible();
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first()).toContainText(LINS);
    await expect(items(page).first()).toContainText(QUESTION);
    await expect(items(page).first().locator("time")).toHaveText(/^Added (just now|\d+[mhd] ago)$/);
    // No vote, assessment, or points count shows.
    await expect(page.locator("main")).not.toContainText(/points|votes/i);
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    await tab(page, /^Wordings/).click();
    await expect(tab(page, /^Wordings/)).toHaveAttribute("aria-selected", "true");
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first()).toContainText(LINS_OTHER);
    // The arrow keys move between tabs, as the ARIA tab pattern has them.
    await page.keyboard.press("ArrowRight");
    await expect(tab(page, /^Sources/)).toBeFocused();
    await expect(tab(page, /^Sources/)).toHaveAttribute("aria-selected", "true");
    await expect(items(page).first()).toContainText(SURVEY.name);
    await expectNoAxeViolations(page);

    // A source opens the wording that cites it, ringed on its board.
    await items(page).first().getByRole("link").click();
    await expect(page).toHaveURL(`/b/${board.demo.board}/v/${other}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);

    await page.goBack();
    await expect(page).toHaveURL("/u/lin.zhao");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("lin.zhao");
    // The profile's own way back leads to the card last opened on the board it was opened from.
    await expect(page.getByRole("navigation", { name: "Back" }).getByRole("link")).toHaveAttribute("href", `/b/${board.demo.board}/v/${other}`);
  });

  test(`L-03: at ${width} px, your own profile says you and links to Your statistics`, async ({ board }) => {
    const page = await board.open("maya.chen", { width, at: "/u/maya.chen" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("maya.chen you");
    await expect(tab(page, /^Arguments 1$/)).toBeVisible();
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    await page.getByRole("link", { name: "Your statistics" }).click();
    await expect(page).toHaveURL("/account#statistics");
    await expect(page.locator("#statistics")).toBeInViewport();
  });

  test(`L-03: at ${width} px, a person who shares no board with the viewer shows the empty sentence`, async ({ board }) => {
    await board.api("maya.chen").delete(`people/${board.demo.people["lin.zhao"]}`);
    const page = await board.open("lin.zhao", { width, at: "/u/maya.chen" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("maya.chen");
    await expect(page.getByRole("tabpanel").getByText(NOTHING)).toBeVisible();
    for (const name of [/^Arguments 0$/, /^Wordings 0$/, /^Sources 0$/]) await expect(tab(page, name)).toBeVisible();
    await expect(page.locator("main")).not.toContainText(QUESTION);
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });

  test(`L-03, L-04: at ${width} px, an old name's link lands on the new profile`, async ({ board }) => {
    await board.api("omar_h").put("../../account/username", { username: "omar_hassan" });
    const page = await board.open("jordan_w", { width, at: "/u/omar_h" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("omar_hassan");
    await expect(page).toHaveURL("/u/omar_hassan");
    await expect(tab(page, /^Arguments 1$/)).toBeVisible();
  });
}

test("L-03: the people list and History's names are links to profiles that keep their look", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.getByRole("button", { name: /^(Anyone with the link|Invited only)$/ }).click();
  const people = page.getByRole("region", { name: "People with access" });
  const lin = people.getByRole("link", { name: "lin.zhao" });
  await expect(lin).toHaveAttribute("href", "/u/lin.zhao");
  await expect(lin).toHaveClass(/ph-no-capture/);
  await expect(lin).toHaveCSS("text-decoration-line", "none");
  await expect(people.getByRole("link", { name: "maya.chen" })).toHaveAttribute("href", "/u/maya.chen");
  await expect(people.getByRole("listitem").first()).toHaveText(/^MCmaya\.chen \(you\)Owner/);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "History" }).click();
  const history = page.getByRole("dialog", { name: "History" });
  const actor = history.getByRole("link", { name: "maya.chen" }).first();
  await expect(actor).toHaveAttribute("href", "/u/maya.chen");
  await expect(actor).toHaveCSS("text-decoration-line", "none");
  await actor.click();
  await expect(page).toHaveURL("/u/maya.chen");
});

test("L-03, M-08: Your account, opened after someone's profile, keeps the profile's address out of screen replays", async ({ board }) => {
  const page = await board.open("jordan_w", { at: "/u/lin.zhao" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("lin.zhao");
  await page.goto("/account");
  const back = page.getByRole("navigation", { name: "Back" });
  await expect(back.getByRole("link", { name: "Back to the profile" })).toHaveAttribute("href", "/u/lin.zhao");
  // PostHog's replays skip whatever sits inside ph-no-capture, so no address of a profile may sit outside it.
  const unblocked = await page.evaluate(() => [...document.querySelectorAll('[href*="/u/"]')].filter((element) => !element.closest(".ph-no-capture")).map((element) => element.outerHTML));
  expect(unblocked).toEqual([]);
  await expect(back).toHaveClass(/ph-no-capture/);
});

/** Stands in for PostHog's script: notes every call made to it, as analytics.spec.ts does. */
const RECORDER = `(() => {
  const queued = window.posthog;
  const calls = (window.__posthogCalls = []);
  for (const [key, options] of queued._i) calls.push(["init", key, options]);
  for (const call of queued) calls.push(call);
  window.posthog = new Proxy({ __loaded: true }, { get: (target, name) => (name in target ? target[name] : (...args) => void calls.push([name, ...args])) });
})();`;

test.describe("with a PostHog key", () => {
  test.use({ analytics: true });

  test("L-03, M-08: no name reaches PostHog from a profile, a byline, or the address", async ({ board }) => {
    const sent: string[] = [];
    const page = await board.open("jordan_w", {
      prepare: (context) =>
        context.route(`${TEST_POSTHOG.host}/**`, (route) => {
          sent.push(route.request().url(), route.request().postData() ?? "");
          return route.fulfill({ contentType: "text/javascript", body: RECORDER });
        }),
    });
    await page.waitForFunction(() => Array.isArray((window as unknown as { __posthogCalls?: unknown }).__posthogCalls));
    const { version } = await find(board, LINS);
    await page.locator(`[data-card="${version}"] .sm-byline`).getByRole("link", { name: "lin.zhao" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("lin.zhao");
    await page.waitForFunction(() => Array.isArray((window as unknown as { __posthogCalls?: unknown }).__posthogCalls));
    await tab(page, /^Wordings/).click();

    const calls = await page.evaluate(() => (window as unknown as { __posthogCalls: unknown[] }).__posthogCalls);
    expect(calls.length).toBeGreaterThan(1);
    expect(JSON.stringify(calls)).not.toContain("lin.zhao");
    for (const each of sent) expect(each).not.toContain("lin.zhao");
    // PostHog's own page view carries the address, the page it came from, and a clicked link's address; the app
    // rewrites each before it's sent.
    const masked = await page.evaluate(() => {
      const [, , options] = (window as unknown as { __posthogCalls: [string, string, { before_send(event: unknown): unknown }][] }).__posthogCalls[0]!;
      return JSON.stringify(
        options.before_send({
          event: "$autocapture",
          properties: { $current_url: location.href, $pathname: location.pathname, $referrer: document.referrer, $elements: [{ attr__href: "/u/lin.zhao" }], $elements_chain: 'a:attr__href="/u/lin.zhao"' },
        }),
      );
    });
    expect(masked).not.toContain("lin.zhao");
    expect(masked).toContain("/u/:username");
  });
});
