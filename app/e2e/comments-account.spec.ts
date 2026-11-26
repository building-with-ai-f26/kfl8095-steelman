// Comments in what the account pages say (M3b-8, D-01, M-07): the privacy
// page names comments among what is kept and what deletion removes, and says
// a change is shown by the page's date (the builder's choice, Nov 24); the
// delete form and the deleted-account page each add a sentence about comments
// after the ones they have.

import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";

async function openAccount(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Your account" }).click();
  await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();
}

test("D-01, M-07: the privacy page names comments among what is kept and what deletion removes, and says the date shows each change", async ({ board }) => {
  const page = await board.open("omar_h");
  await page.goto("/privacy");

  await expect(page.getByText("Updated November 25, 2026")).toBeVisible();
  await expect(page.locator("main")).toContainText("We keep the comments you write on boards, until you delete them.");
  await expect(page.locator("main")).toContainText("Deleting your account removes your email, your ways of signing in, your votes, your assessments, and the text of your comments.");
  await expect(page.locator("main")).toContainText("We date each change at the top of this page, so the date shows when what we keep about you last changed.");
  await expect(page.locator("main")).not.toContainText("we tell people who are signed in");
});

test("D-01, M-07: the delete form says comments are deleted, after its two sentences", async ({ board }) => {
  const page = await board.open("omar_h");
  await openAccount(page);

  await page.getByRole("button", { name: "Delete account" }).click();
  const form = page.getByRole("group", { name: "Delete your account?" });

  await expect(form.locator("p").nth(2)).toHaveText("Your comments are deleted.");
});

test("D-01, M-07: the deleted-account page says their comments are gone too, after its two sentences", async ({ board }) => {
  const page = await board.open("omar_h");
  await openAccount(page);

  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("textbox", { name: "Type omar_h to confirm" }).fill("omar_h");
  await page.getByRole("group", { name: "Delete your account?" }).getByRole("button", { name: "Delete account" }).click();

  await expect(page.getByRole("heading", { name: "Your account is deleted" })).toBeFocused();
  await expect(page.getByText("Your comments are gone too.")).toBeVisible();
});
