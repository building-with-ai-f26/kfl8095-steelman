// A message when something can't be done (M-14). What the service refuses,
// and "Couldn’t reach Steelman", used to be said only in the status line,
// which a screen reader hears and no one sees: a refused Undo or rename looked
// like a click that did nothing (the M3a audit, Nov 22). Now it also shows in
// a bar at the foot of the window, in front of the board, as Material's
// snackbar sits (read live, Nov 22): one message at a time, in a sentence, no
// icon. It stays until it's dismissed or the reader does something else,
// since Material's guidance for the web is that one that goes by itself is
// missed by people who need longer. What worked still shows only by the board
// changing, as GitHub's Primer asks ("use success messaging sparingly").

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import { find, status } from "./support/screen.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const STUDY = "Students need a quiet place to study before Monday exams.";
const FAMILY = "Families could visit together on the one day nobody has school or work.";

const problem = (page: Page) => page.locator(".sm-problem");
const menuButton = (page: Page, option: string) => page.getByRole("button", { name: `Options for ${option}` });
const menu = (page: Page) => page.getByRole("menu", { name: "Option settings" });
const nameField = (page: Page) => page.getByRole("textbox", { name: "Option name" });

async function rename(page: Page, option: string, name: string): Promise<void> {
  await menuButton(page, option).click();
  await menu(page).getByRole("menuitem", { name: "Rename" }).click();
  await nameField(page).fill(name);
  await nameField(page).press("Enter");
}

test("M-14, J-04: an Undo the service refuses says why on screen, until it's dismissed", async ({ board }) => {
  const study = await find(board, STUDY);
  const family = await find(board, FAMILY);
  const lead = await find(board, LEAD);
  await board.api("maya.chen").post(`versions/${study.version}/combine`, { into: family.argument });
  await board.api("maya.chen").post(`versions/${study.version}/combine`, { into: lead.argument });
  const page = await board.open("maya.chen");
  await expect(problem(page)).toHaveCount(0);
  await page.getByRole("button", { name: "History" }).click();

  await page.getByRole("dialog", { name: "History" }).getByRole("listitem").nth(1).getByRole("button", { name: "Undo" }).click();

  await expect(problem(page)).toBeVisible();
  await expect(problem(page)).toContainText("Something was combined or separated since, so this can’t be undone yet.");
  // The status line still says it, once, for a screen reader; the bar itself isn't announced a second time.
  await expect(status(page)).toHaveText("Something was combined or separated since, so this can’t be undone yet.");
  await expect(problem(page)).not.toHaveAttribute("role", /.+/);
  // It doesn't go by itself.
  await page.waitForTimeout(6_000);
  await expect(problem(page)).toBeVisible();

  await problem(page).getByRole("button", { name: "Dismiss" }).click();
  await expect(problem(page)).toHaveCount(0);
  // The browser logs the service's refusal; it's the answer this test expects.
  expect(board.errors.splice(0)).toEqual(["maya.chen: Failed to load resource: the server responded with a status of 409 (Conflict)"]);
});

test("M-14, A-07: a name another option has says so on screen, and the next thing that works takes the message away", async ({ board }) => {
  const page = await board.open("maya.chen");

  await rename(page, "No", "yes");
  await expect(problem(page)).toContainText("Another option already has that name.");
  await expect(page.locator(".sm-column-head h2").nth(1)).toHaveText("No");

  await rename(page, "No", "Not on Sundays");
  await expect(page.locator(".sm-column-head h2").nth(1)).toHaveText("Not on Sundays");
  await expect(problem(page)).toHaveCount(0);
  expect(board.errors.splice(0)).toEqual(["maya.chen: Failed to load resource: the server responded with a status of 409 (Conflict)"]);
});

test("M-14, A-07: when Steelman can't be reached, the message says so, and a second failure replaces the first", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.route("**/options/**", (route) => route.abort("internetdisconnected"));

  await rename(page, "No", "Not on Sundays");
  await expect(problem(page)).toContainText("Couldn’t reach Steelman. Try again.");

  await page.unroute("**/options/**");
  await rename(page, "No", "Yes");
  await expect(problem(page)).toHaveCount(1);
  await expect(problem(page)).toContainText("Another option already has that name.");
  await expect(problem(page)).not.toContainText("Couldn’t reach Steelman");
  // The service's refusal; the request that never left isn't logged as an error.
  expect(board.errors.splice(0)).toEqual(["maya.chen: Failed to load resource: the server responded with a status of 409 (Conflict)"]);
});

test("M-14, M-03, M-04: on a phone the message fits the screen, above the Update pill, and the page passes an accessibility scan with it showing", async ({ board }) => {
  const page = await board.open("maya.chen", { width: 375 });

  await rename(page, "Yes", "no");
  await expect(problem(page)).toBeVisible();
  const box = (await problem(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);

  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.html).join(" ")}`)).toEqual([]);
  expect(board.errors.splice(0)).toEqual(["maya.chen: Failed to load resource: the server responded with a status of 409 (Conflict)"]);
});
