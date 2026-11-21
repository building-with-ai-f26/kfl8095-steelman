// M1-12, Your account (M-07): Download your data and Delete account, in the
// prototype's Account card (profileMarkup, deleteForm, and deletedMarkup in
// docs/prototype/source/steelman-refined.html). The deletion table itself is
// tested in server/test/api/account.test.ts.

import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import { find, poll } from "./support/screen.ts";

const OMARS = "Staff need a guaranteed day off.";

async function openAccount(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Your account" }).click();
  await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("M-07 The header's account button opens Your account: username, how you sign in, Download, and Delete account", async ({ board }) => {
  const page = await board.open("omar_h");
  await openAccount(page);

  await expect(page).toHaveURL("/account");
  const card = page.getByRole("region", { name: "Your account" });
  await expect(card.locator(".sm-rrow", { hasText: "Username" })).toContainText("omar_h");
  await expect(card.locator(".sm-rrow", { hasText: "Your data" })).toContainText("Download a copy of everything you wrote, voted on, and assessed.");
  await expect(card.getByRole("button", { name: "Download" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Delete account" })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("M-07 Download your data saves steelman-data.json with what they wrote and their votes", async ({ board }) => {
  const page = await board.open("omar_h");
  await openAccount(page);

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloading;

  expect(download.suggestedFilename()).toBe("steelman-data.json");
  const data = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(data.account.username).toBe("omar_h");
  expect(data.boards[0].wrote.map((w: { wording: string }) => w.wording)).toContain(OMARS);
  expect(data.votes.importance.length).toBeGreaterThan(0);
  await expect(page.locator("#sm-status")).toHaveText("Downloaded steelman-data.json.");
});

test("M-07 Delete account asks them to type their username; Cancel closes it, and a wrong name says so", async ({ board }) => {
  const page = await board.open("omar_h");
  await openAccount(page);

  await page.getByRole("button", { name: "Delete account" }).click();
  const form = page.getByRole("group", { name: "Delete your account?" });
  await expect(form).toContainText("Your email, votes, and assessments are removed. Arguments, wordings, and sources you wrote stay on their boards, credited to deleted_account.");
  const typed = form.getByRole("textbox", { name: "Type omar_h to confirm" });
  await expect(typed).toBeFocused();
  await expectNoAxeViolations(page);

  await typed.fill("omar");
  await form.getByRole("button", { name: "Delete account" }).click();
  await expect(form.getByText("Type omar_h exactly.")).toBeVisible();
  await expect(typed).toHaveAttribute("aria-invalid", "true");
  await expect(typed).toBeFocused();

  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete account" })).toBeFocused();
  expect((await board.api("maya.chen").snapshot()).versions.find((v: { wording: string }) => v.wording === OMARS).authorName).toBe("omar_h");
});

test("M-07 Typing the username deletes the account: the page says so, and others see their wording credited to deleted_account", async ({ board }) => {
  const other = await board.open("maya.chen");
  const page = await board.open("omar_h");
  await openAccount(page);

  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("textbox", { name: "Type omar_h to confirm" }).fill("omar_h");
  await page.getByRole("group", { name: "Delete your account?" }).getByRole("button", { name: "Delete account" }).click();

  await expect(page.getByRole("heading", { name: "Your account is deleted" })).toBeFocused();
  await expect(page.getByText("Your email, votes, and assessments are gone. What you wrote stays on its boards, credited to deleted_account.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Steelman" })).toHaveAttribute("href", "/");

  await poll(other);
  const shift = await find(board, OMARS);
  await expect(other.locator(`[data-card="${shift.version}"] .sm-byline`)).toContainText("deleted_account");
});

test("M-07 Your account fits a phone", async ({ board }) => {
  const page = await board.open("omar_h", { width: 375 });
  // On a phone the account button steps aside on a board, as in the prototype; it's there on other pages.
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Your account" })).toBeVisible();
  await page.getByRole("button", { name: "Delete account" }).click();

  const card = await page.getByRole("region", { name: "Your account" }).boundingBox();
  expect(card!.x).toBeGreaterThanOrEqual(0);
  expect(card!.x + card!.width).toBeLessThanOrEqual(375);
  await expectNoAxeViolations(page);
});
