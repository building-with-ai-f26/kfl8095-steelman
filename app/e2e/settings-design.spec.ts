// The builder, Nov 22, after testing (M3a-1, M-13, M-07): "The settings menu
// for the account needs a once over for design. Feels too cramped / too many
// lines, and the 'back' option feels untraditional in how it looks. Follow
// behavior of like Google screens", and "That back option should also exist
// from the 'New steelman' screen."
//
// The way back is Material 3's top app bar navigation icon, as Google Account's
// subpages show it: an arrow-left icon button at the left of the screen's title,
// named for where it goes (developer.android.com, Compose app bars, checked
// Nov 22: "navigationIcon … Appears on the left of the app bar", an IconButton
// with a contentDescription). It stays a real link in a Back landmark, with
// GOV.UK's "Back to …" as its name and its tooltip. Your account's groups are
// Google Account's cards: a short title, rows of label and value, dividers
// only between rows.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import { signInByCode, test as signedIn } from "./support/sign-in.ts";

const QUESTION = "Should our library open on Sundays?";
const back = (page: Page) => page.getByRole("navigation", { name: "Back" }).getByRole("link");
const title = (page: Page) => page.getByRole("heading", { level: 1 });

/** The back control is an icon button: square, with an arrow and no words drawn, at the left of the title and level with it. */
async function expectArrowBesideTitle(page: Page, name: string): Promise<void> {
  const link = back(page);
  await expect(link).toHaveAccessibleName(name);
  await expect(link).toHaveAttribute("data-tooltip", name);
  await expect(link.locator("svg.lucide-arrow-left")).toBeVisible();
  // No words drawn: the name is there for screen readers only, in a box clipped to nothing.
  const drawn = await link.evaluate((element) =>
    [element as HTMLElement, ...element.querySelectorAll<HTMLElement>("*")]
      .filter((child) => [...child.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
      .filter((child) => child.getBoundingClientRect().width > 1 || getComputedStyle(child).clipPath === "none")
      .map((child) => child.textContent),
  );
  expect(drawn, "no words drawn").toEqual([]);
  const arrow = (await link.boundingBox())!;
  const heading = (await title(page).boundingBox())!;
  expect(Math.abs(arrow.width - arrow.height), "square").toBeLessThanOrEqual(1);
  expect(arrow.width, "a 40 px target").toBeGreaterThanOrEqual(40);
  expect(arrow.x + arrow.width, "left of the title").toBeLessThanOrEqual(heading.x + 1);
  expect(heading.x - (arrow.x + arrow.width), "right beside it").toBeLessThanOrEqual(16);
  const middle = (box: { y: number; height: number }) => box.y + box.height / 2;
  expect(Math.abs(middle(arrow) - middle(heading)), "level with the title").toBeLessThanOrEqual(4);
}

async function expectCleanScan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll").toBe(true);
}

test("M3a-1, M-13: New steelman has a back arrow beside its title, back to the board it was opened from", async ({ board }) => {
  const page = await board.open("maya.chen");
  await expect(title(page)).toHaveText(QUESTION);
  const at = new URL(page.url()).pathname;
  await page.getByRole("link", { name: "New steelman" }).click();
  await expect(title(page)).toHaveText("New steelman");

  await expectArrowBesideTitle(page, `Back to ${QUESTION}`);
  await back(page).click();
  await expect(page).toHaveURL(at);
});

test("M3a-1, M-13: New steelman from the list goes back to Your steelmen, and Cancel still does too", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.goto("/");
  await page.getByRole("link", { name: "New steelman" }).click();
  await expect(title(page)).toHaveText("New steelman");
  await expectArrowBesideTitle(page, "Back to Your steelmen");
  await expect(back(page)).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/");
});

test("M3a-1, M-13: Your account's back arrow sits beside its title, and its tooltip says where it goes", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.getByRole("link", { name: "Your account" }).click();
  await expect(title(page)).toHaveText("Your account");
  await expectArrowBesideTitle(page, `Back to ${QUESTION}`);

  await back(page).focus();
  await expect(page.locator(".sm-hint")).toHaveText(`Back to ${QUESTION}`);
});

/** Each group's rows are divided from each other only: no rule above the first or below the last, and no card border. */
async function expectFewLines(groups: Locator): Promise<void> {
  expect(await groups.count()).toBeGreaterThan(1);
  for (const group of await groups.all()) {
    const rules = await group.evaluate((element) => {
      const rows = [...element.querySelectorAll<HTMLElement>(":scope > .sm-rrow")];
      const style = (row: HTMLElement) => getComputedStyle(row);
      return {
        card: getComputedStyle(element).borderTopWidth,
        first: rows.length ? style(rows[0]!).borderTopWidth : "0px",
        last: rows.length ? style(rows.at(-1)!).borderBottomWidth : "0px",
      };
    });
    expect(rules).toEqual({ card: "0px", first: "0px", last: "0px" });
  }
}

test("M-07: Your account's groups are cards with rules only between their rows", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.goto("/account");
  await expect(title(page)).toHaveText("Your account");
  await expectFewLines(page.getByRole("region", { name: "Your account" }).locator(".sm-rgroup"));
});

signedIn("M-07, L-04: signed in, every group of Your account is a card with rules only between its rows", async ({ site }) => {
  const page = await site.browse();
  await signInByCode(site, page, "ana.lu@school.example.edu", "ana_lu");
  await page.goto("/account");
  await expect(title(page)).toHaveText("Your account");
  await expectFewLines(page.getByRole("region", { name: "Your account" }).locator(".sm-rgroup"));
});

for (const width of [1280, 375]) {
  test(`M3a-1, M-04: Your account and New steelman pass an accessibility scan with no sideways scroll, at ${width} px`, async ({ board }) => {
    const page = await board.open("maya.chen", { width });
    await page.goto("/account");
    await expect(title(page)).toHaveText("Your account");
    await expect(back(page)).toBeVisible();
    await expectCleanScan(page);
    await page.getByRole("button", { name: "Delete account" }).click();
    await expectCleanScan(page);

    await page.goto("/new");
    await expect(title(page)).toHaveText("New steelman");
    await expect(back(page)).toBeVisible();
    await expectCleanScan(page);
  });

  signedIn(`M-04, L-04: signed in, Your account passes an accessibility scan with no sideways scroll, at ${width} px`, async ({ site }) => {
    const page = await site.browse();
    await page.setViewportSize({ width, height: 900 });
    await signInByCode(site, page, "ana.lu@school.example.edu", "ana_lu");
    await page.goto("/account");
    await expect(title(page)).toHaveText("Your account");
    await expectCleanScan(page);
    await page.getByRole("button", { name: "Change" }).click();
    await expectCleanScan(page);
  });
}
