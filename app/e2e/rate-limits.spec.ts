// Rate limits on screen (M-12; architecture §7): what a person sees when the
// service refuses for "too many in a row". Each test gives the service limits
// small enough to reach. A board action refused this way stays queued, shown
// in the board's pill, and is sent once the wait has passed; New steelman and
// Sign in say how long to wait.

import type { Page } from "@playwright/test";
import { LIMITS } from "../server/src/limits.ts";
import { expect, test } from "./support/board.ts";
import { expect as expectSite, test as siteTest } from "./support/sign-in.ts";
import { importance } from "./support/screen.ts";

const MINUTE = 60_000;
const FIRST = "Sunday is the only free day for many people who work weekdays.";
const SECOND = "Students need a quiet place to study before Monday exams.";
const THIRD = "Opening a seventh day costs more than the budget allows.";

const pill = (page: Page) => page.locator(".sm-fresh");
const more = (page: Page, wording: string) => importance(page, wording).getByRole("button", { name: "More important if true" });

test.describe("one vote a minute", () => {
  test.use({ limits: { ...LIMITS, voting: { most: 1, windowMs: MINUTE } } });

  test("M-12: a vote past the limit waits, says why and for how long, and is sent once the wait has passed", async ({ board }) => {
    const page = await board.open("jordan_w");
    await more(page, FIRST).click();
    await expect(pill(page)).toBeHidden();

    await more(page, SECOND).click();

    await expect(pill(page)).toHaveText("Too many in a row. Try again in a minute. · 1 waiting to send");
    await expect(page.locator("#sm-status")).toHaveText("Too many in a row. Try again in a minute.");
    await expect(more(page, SECOND)).toHaveAttribute("aria-pressed", "true");
    // The refusal is the service's answer, and the browser logs it; nothing else may be.
    expect(board.errors.splice(0)).toEqual(["jordan_w: Failed to load resource: the server responded with a status of 429 (Too Many Requests)"]);

    board.clock.advance(MINUTE);
    await page.clock.runFor(MINUTE);

    await expect(pill(page)).toBeHidden();
    const mine = (await board.api("jordan_w").snapshot()).arguments.filter((row: { myVote: number | null }) => row.myVote === 1).length;
    expect(mine).toBe(4);
  });
});

test.describe("two votes a minute", () => {
  test.use({ limits: { ...LIMITS, voting: { most: 2, windowMs: MINUTE } } });

  test("M-12 M-02: votes made offline, sent together on coming back, stop at the limit; the rest show as waiting, and go once the wait has passed", async ({ board }) => {
    const page = await board.open("jordan_w");
    await page.context().setOffline(true);
    for (const wording of [FIRST, SECOND, THIRD]) await more(page, wording).click();
    await expect(pill(page)).toHaveText("Offline · 3 waiting to send");

    await page.context().setOffline(false);

    await expect(pill(page)).toHaveText("Too many in a row. Try again in a minute. · 1 waiting to send");
    expect(board.errors.splice(0)).toEqual(["jordan_w: Failed to load resource: the server responded with a status of 429 (Too Many Requests)"]);
    board.clock.advance(MINUTE);
    await page.clock.runFor(MINUTE);
    await expect(pill(page)).toBeHidden();
    const mine = (await board.api("jordan_w").snapshot()).arguments.filter((row: { myVote: number | null }) => row.myVote === 1).length;
    expect(mine).toBe(5);
  });
});

test.describe("no new boards", () => {
  test.use({ limits: { ...LIMITS, board: { most: 0, windowMs: 60 * MINUTE } } });

  test("M-12: New steelman past the limit says how long to wait, and makes nothing", async ({ board }) => {
    const page = await board.open("lin.zhao");
    await page.goto("/");
    await page.getByRole("textbox", { name: "Question" }).fill("Should our school start an hour later?");
    await page.getByRole("textbox", { name: "Option 1" }).fill("Start later");
    await page.getByRole("textbox", { name: "Option 2" }).fill("Keep the time");

    await page.getByRole("button", { name: "Create steelman" }).click();

    await expect(page.getByText("Too many in a row. Try again in 60 minutes.")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    expect(board.errors.splice(0)).toEqual(["lin.zhao: Failed to load resource: the server responded with a status of 429 (Too Many Requests)"]);
  });
});

siteTest.describe("no sign-in codes from this network", () => {
  siteTest.use({ limits: { ...LIMITS, signInCode: { most: 0, windowMs: 60 * MINUTE } } });

  siteTest("M-12 L-01: asking for a code past the network's limit says how long to wait, and sends nothing", async ({ site }) => {
    const page = await site.browse();
    await page.goto(site.boardPath);
    await page.getByLabel("Email").fill("sam.reyes@school.example.edu");

    await page.getByRole("button", { name: "Email me a code" }).click();

    await expectSite(page.locator(".sm-landing-auth .sm-field-error")).toHaveText("Too many in a row. Try again in 60 minutes.");
    expectSite(() => site.codeFor("sam.reyes@school.example.edu")).toThrow();
  });
});
