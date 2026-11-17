// The hint box (M-04, H-03): a control's `data-tooltip` shows in a small box
// above it, as in the prototype. It opens after a moment on hover and at once
// on keyboard focus, closes on leaving, Escape, or scrolling, and stays inside
// the window. GitHub's Primer and the W3C's tooltip pattern do the same.
// The browser's clock is the test's, so a test moves it past the hover delay.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const HOVER_MS = 700;

const hint = (page: Page): Locator => page.locator(".sm-hint");
const row = (page: Page, wording: string): Locator => page.locator(".sm-idea").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
const moreImportant = (page: Page) => row(page, LEAD).getByRole("button", { name: "More important if true" });

test("M-04: hovering a control shows its hint after a moment, above it, and moving away hides it", async ({ board }) => {
  const page = await board.open("jordan_w");
  const control = moreImportant(page);

  await control.hover();
  await expect(hint(page)).toHaveCount(0);
  await page.clock.runFor(HOVER_MS);

  await expect(hint(page)).toHaveText("More important if true");
  const [box, near] = [(await hint(page).boundingBox())!, (await control.boundingBox())!];
  expect(box.y + box.height).toBeLessThanOrEqual(near.y);

  await page.mouse.move(5, 5);
  await expect(hint(page)).toHaveCount(0);
});

test("H-03: a Viewer hovering a faded control sees why it's faded", async ({ board }) => {
  await board.setRole("jordan_w", "viewer");
  const page = await board.open("jordan_w");

  await page.getByRole("button", { name: "Add an argument for Yes" }).hover();
  await page.clock.runFor(HOVER_MS);

  await expect(hint(page)).toHaveText("Writing and editing need “can contribute” access.");
});

test("M-04: reaching a control with the keyboard shows its hint at once; Escape hides it and leaves the focus where it was", async ({ board }) => {
  const page = await board.open("jordan_w");
  const control = moreImportant(page);
  await control.focus();
  await page.keyboard.press("Shift+Tab");

  await page.keyboard.press("Tab");

  await expect(control).toBeFocused();
  await expect(hint(page)).toHaveText("More important if true");
  await page.keyboard.press("Escape");
  await expect(hint(page)).toHaveCount(0);
  await expect(control).toBeFocused();
});

test("M-04: after one hint closes, the next opens straight away", async ({ board }) => {
  const page = await board.open("jordan_w");
  await moreImportant(page).hover();
  await page.clock.runFor(HOVER_MS);
  await expect(hint(page)).toHaveText("More important if true");

  await row(page, LEAD).getByRole("button", { name: "Less important if true" }).hover();

  // Well under the hover delay: the browser's clock still moves with real time, so a longer wait would let it open anyway.
  await expect(hint(page)).toHaveText("Less important if true", { timeout: 300 });
});

test("M-04: a hint follows its control while the page scrolls, and goes once the control has left the window", async ({ board }) => {
  const page = await board.open("jordan_w");
  // A short window, so the board scrolls well past the control.
  await page.setViewportSize({ width: 1280, height: 500 });
  const control = moreImportant(page);
  await control.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(hint(page)).toBeVisible();

  await page.evaluate(() => window.scrollBy(0, 60));
  await expect.poll(async () => (await hint(page).boundingBox())!.y + (await hint(page).boundingBox())!.height).toBeLessThanOrEqual((await control.boundingBox())!.y);
  await expect(hint(page)).toHaveText("More important if true");

  await page.evaluate(() => window.scrollBy(0, 3000));
  await expect(hint(page)).toHaveCount(0);
});

test("M-03 M-04: Tab to a control below the fold scrolls it into view with its hint showing", async ({ board }) => {
  const page = await board.open("jordan_w", { width: 375 });
  await page.setViewportSize({ width: 375, height: 400 });
  const target = row(page, "Families could visit together on the one day nobody has school or work.").getByRole("button", { name: "More important if true" });
  expect(await target.evaluate((element) => element.getBoundingClientRect().top > window.innerHeight)).toBe(true);

  for (let presses = 0; presses < 120 && !(await target.evaluate((element) => element === document.activeElement)); presses++) await page.keyboard.press("Tab");

  await expect(target).toBeFocused();
  await expect(target).toBeInViewport();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await expect(hint(page)).toHaveText("More important if true");
});

test("M-04: a hint goes when its control does", async ({ board }) => {
  const page = await board.open("jordan_w");
  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  const suggest = row(page, LEAD).getByRole("button", { name: "Suggest a better version" });
  await suggest.hover();
  await page.clock.runFor(HOVER_MS);
  await expect(hint(page)).toHaveText("Suggest a version");

  await suggest.click();

  await expect(row(page, LEAD).getByRole("textbox").first()).toBeVisible();
  await expect(hint(page)).toHaveCount(0);
});

test("M-03 M-04: at 375 px, a hint by the window's edge stays inside it", async ({ board }) => {
  await board.setRole("jordan_w", "viewer");
  const page = await board.open("jordan_w", { width: 375 });
  const control = moreImportant(page);
  await control.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");

  await expect(hint(page)).toHaveText("Voting and assessing evidence need “can vote” access.");
  const box = (await hint(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
});

test("M-04: a page with a hint open passes an accessibility scan, and the hint never takes the pointer", async ({ board }) => {
  const page = await board.open("jordan_w");
  await moreImportant(page).hover();
  await page.clock.runFor(HOVER_MS);
  await expect(hint(page)).toBeVisible();

  expect(await hint(page).evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});
