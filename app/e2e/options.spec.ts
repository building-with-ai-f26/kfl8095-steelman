// Options on the board (M3a-2; A-07), as the prototype has them: the option
// header's ⋯ (Options for …) with Rename option and Delete option, renaming in
// place in the header, and a dashed "Add an option" after the last column, as
// GitHub Projects puts its "+" (read live, Nov 22). Only an Editor or the
// Owner sees them. Deleting is held for ten seconds with Undo, like deleting a
// wording.

import AxeBuilder from "@axe-core/playwright";
import type { Page, Request } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import { column, poll, status } from "./support/screen.ts";

const UNDO_MS = 10_000;
const menuButton = (page: Page, option: string) => page.getByRole("button", { name: `Options for ${option}` });
const menu = (page: Page) => page.getByRole("menu", { name: "Option settings" });
const addButton = (page: Page) => page.getByRole("button", { name: "Add an option" });
const nameField = (page: Page) => page.getByRole("textbox", { name: "Option name" });
const heads = (page: Page) => page.locator(".sm-column-head h2").allTextContents();

/** Every option request the page sends, by method. */
function optionWrites(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/options") && request.method() !== "GET") sent.push(request);
  });
  return sent;
}

async function addOption(page: Page, name: string): Promise<void> {
  await addButton(page).click();
  await expect(nameField(page)).toBeFocused();
  await nameField(page).fill(name);
  await nameField(page).press("Enter");
  await expect(column(page, name)).toBeVisible();
}

test("M3a-2, A-07: the Owner renames an option in its header; another reader sees the new name", async ({ board }) => {
  const page = await board.open("maya.chen");
  const other = await board.open("tess.b");

  await menuButton(page, "Yes").click();
  // With two options, the prototype gives that reason first; with three, the arguments are the reason.
  expect(await menu(page).getByRole("menuitem").allTextContents()).toEqual(["Rename option", "Delete optionA question needs at least two options."]);
  await menu(page).getByRole("menuitem", { name: "Rename option" }).click();
  await expect(nameField(page)).toHaveValue("Yes");
  await expect(nameField(page)).toBeFocused();
  await nameField(page).fill("Yes, every Sunday");
  await nameField(page).press("Enter");

  await expect(page.locator(".sm-column-head h2").first()).toHaveText("Yes, every Sunday");
  await expect(status(page)).toHaveText("You renamed the option.");
  await expect(menuButton(page, "Yes, every Sunday")).toBeFocused();
  await poll(other);
  await expect(other.locator(".sm-column-head h2").first()).toHaveText("Yes, every Sunday");
});

test("M3a-2, A-07: Escape keeps the old name, and so does an empty one", async ({ board }) => {
  const page = await board.open("maya.chen");
  const sent = optionWrites(page);

  await menuButton(page, "No").click();
  await menu(page).getByRole("menuitem", { name: "Rename option" }).click();
  await nameField(page).fill("Something else");
  await nameField(page).press("Escape");
  await expect(page.locator(".sm-column-head h2").nth(1)).toHaveText("No");
  await expect(menuButton(page, "No")).toBeFocused();

  await menuButton(page, "No").click();
  await menu(page).getByRole("menuitem", { name: "Rename option" }).click();
  await nameField(page).fill("   ");
  await nameField(page).press("Enter");
  await expect(page.locator(".sm-column-head h2").nth(1)).toHaveText("No");
  await expect(status(page)).toHaveText("An option needs a name, so the old name stays.");
  expect(sent).toHaveLength(0);
});

test("M3a-2, A-07: Add an option opens a new column to name; another reader sees it; Escape on an empty name adds nothing", async ({ board }) => {
  const page = await board.open("maya.chen");
  const other = await board.open("tess.b");
  const sent = optionWrites(page);

  await addButton(page).click();
  await expect(nameField(page)).toHaveAttribute("placeholder", "Name this option");
  await nameField(page).press("Escape");
  await expect(nameField(page)).toHaveCount(0);
  await expect(addButton(page)).toBeFocused();
  expect(sent).toHaveLength(0);

  await addOption(page, "Only in winter");
  expect(await heads(page)).toEqual(["Yes", "No", "Only in winter"]);
  await expect(status(page)).toHaveText("You added the option “Only in winter”.");
  await expect(page.getByRole("button", { name: "Add an argument for Only in winter" })).toBeFocused();
  await poll(other);
  expect(await heads(other)).toEqual(["Yes", "No", "Only in winter"]);
});

test("M3a-2, A-07: a board has at most four options, so Add an option goes at four; an option with arguments says why it can't be deleted", async ({ board }) => {
  const page = await board.open("maya.chen");
  await addOption(page, "Third");
  await menuButton(page, "Yes").click();
  await expect(menu(page).getByRole("menuitem", { name: /Delete option/ })).toHaveText("Delete optionMove or delete its arguments first.");
  await expect(menu(page).getByRole("menuitem", { name: /Delete option/ })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await addOption(page, "Fourth");
  await expect(addButton(page)).toHaveCount(0);
});

test("M3a-2, A-07, J-05: Delete option takes an empty option off at once with Undo, and sends it after ten seconds", async ({ board }) => {
  const page = await board.open("maya.chen");
  const other = await board.open("tess.b");
  await addOption(page, "Only in winter");
  const sent = optionWrites(page);

  await menuButton(page, "Only in winter").click();
  await menu(page).getByRole("menuitem", { name: "Delete option" }).click();
  await expect(column(page, "Only in winter")).toHaveCount(0);
  await expect(status(page)).toHaveText("You deleted the option. Undo is available for ten seconds.");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(column(page, "Only in winter")).toBeVisible();
  expect(sent).toHaveLength(0);

  await menuButton(page, "Only in winter").click();
  await menu(page).getByRole("menuitem", { name: "Delete option" }).click();
  await page.clock.runFor(UNDO_MS - 1_000);
  expect(sent).toHaveLength(0);
  const answered = page.waitForResponse((response) => response.request().method() === "DELETE" && response.url().includes("/options/"));
  await page.clock.runFor(2_000);
  expect((await answered).status()).toBe(200);
  await poll(other);
  expect(await heads(other)).toEqual(["Yes", "No"]);
});

test("M3a-2, A-07: a Contributor sees neither the option menu nor Add an option", async ({ board }) => {
  const page = await board.open("tess.b");
  await expect(page.locator(".sm-column-head h2").first()).toHaveText("Yes");
  await expect(menuButton(page, "Yes")).toHaveCount(0);
  await expect(addButton(page)).toHaveCount(0);
});

for (const width of [1280, 375]) {
  test(`M3a-2, M-04: the board with the option menu open, and while naming a new option, passes an accessibility scan, at ${width} px`, async ({ board }) => {
    const page = await board.open("maya.chen", { width });
    await menuButton(page, "Yes").click();
    await expect(menu(page)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");
    await addButton(page).click();
    await expect(nameField(page)).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
