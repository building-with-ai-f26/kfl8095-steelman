// New steelman (F-01), in the browser: the sheet, at /new, and
// making a board opens it, owned by its maker and open to anyone with the link.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";

const SIZES = [
  { name: "desktop", width: 1280 },
  { name: "375", width: 375 },
] as const;

/** A test account's browser on New steelman's sheet. */
async function home(board: TestBoard, width = 1280): Promise<Page> {
  const page = await board.open("lin.zhao", { width });
  await page.goto("/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New steelman");
  return page;
}

const question = (page: Page) => page.getByRole("textbox", { name: "Question" });
const option = (page: Page, n: number) => page.getByRole("textbox", { name: `Option ${n}` });
const create = (page: Page) => page.getByRole("button", { name: "Create steelman" });

test("F-01: New steelman opens with the cursor in the question", async ({ board }) => {
  const page = await home(board);

  await expect(question(page)).toBeFocused();
  await expect(option(page, 1)).toBeVisible();
  await expect(option(page, 2)).toBeVisible();
});

test("F-01, H-02: making a board opens it, owned by its maker and open to anyone with the link", async ({ board }) => {
  const page = await home(board);

  await question(page).fill("Should our school start an hour later?");
  await question(page).press("Enter");
  await expect(option(page, 1)).toBeFocused();
  await option(page, 1).fill("Start later");
  await option(page, 2).fill("Keep the time");
  await create(page).click();

  await expect(page).toHaveURL(/\/b\/[A-Za-z0-9_-]{12}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should our school start an hour later?");
  await expect(page.getByRole("heading", { level: 2, name: "Start later" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Keep the time" })).toBeVisible();
  await page.getByRole("button", { name: "Anyone with the link" }).click();
  await expect(page.getByRole("combobox", { name: "General access" })).toBeEnabled();
});

test("F-01: Enter that accepts a word in an input method (Chinese, Japanese…) stays in the question", async ({ board }) => {
  const page = await home(board);

  await question(page).evaluate((field) => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })));

  await expect(question(page)).toBeFocused();
});

test("F-01: New steelman in the top bar of a board leads to the sheet", async ({ board }) => {
  const page = await board.open("lin.zhao");

  await page.getByRole("link", { name: "New steelman" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New steelman");
});

test("H-02, F-01: the sheet sets the board's permissions from the start", async ({ board }) => {
  const page = await home(board);
  const access = page.getByRole("combobox", { name: "Permissions" });

  await expect(access).toHaveValue("link");
  await expect(page.getByRole("combobox", { name: "Link role" })).toHaveValue("contributor");
  await access.selectOption("invited");
  await expect(page.getByRole("combobox", { name: "Link role" })).toHaveCount(0);
  await question(page).fill("Should our school start an hour later?");
  await option(page, 1).fill("Start later");
  await option(page, 2).fill("Keep the time");
  await create(page).click();

  await expect(page.getByRole("button", { name: "Invited only" })).toBeVisible();
});

test("F-01: Space and Collaboration rules are shown where they'll be, marked Later", async ({ board }) => {
  const page = await home(board);

  for (const name of ["Space", "Collaboration rules"]) await expect(page.locator(".sm-rrow-later", { hasText: name })).toContainText("Later");
});

test("F-01: a third and fourth option can be added, and removed", async ({ board }) => {
  const page = await home(board);
  const add = page.getByRole("button", { name: "Option", exact: true });

  await add.click();
  await expect(option(page, 3)).toBeFocused();
  await add.click();
  await expect(option(page, 4)).toBeFocused();
  await expect(add).toHaveCount(0);

  await page.getByRole("button", { name: "Remove option 4" }).click();
  await expect(option(page, 4)).toHaveCount(0);
  await expect(add).toBeVisible();
});

test("F-01: the sheet says what's missing, and puts the cursor there", async ({ board }) => {
  const page = await home(board);
  const error = page.getByRole("alert");

  await create(page).click();
  await expect(error).toHaveText("Write the question first.");
  await expect(question(page)).toBeFocused();
  await expect(question(page)).toHaveAttribute("aria-invalid", "true");
  await expect(question(page)).toHaveAttribute("aria-describedby", "sm-create-error");

  await question(page).fill("Should our school start an hour later?");
  await option(page, 1).fill("Start later");
  await create(page).click();
  await expect(error).toHaveText("A steelman needs at least two options.");
  await expect(option(page, 2)).toBeFocused();

  await option(page, 2).fill("  start LATER ");
  await create(page).click();
  await expect(error).toHaveText("Each option needs a different name.");
  await expect(option(page, 2)).toBeFocused();
  await expect(option(page, 2)).toHaveAttribute("aria-invalid", "true");
  await expect(option(page, 1)).not.toHaveAttribute("aria-invalid", "true");

  // Typing clears the message; nothing was made.
  await option(page, 2).fill("Keep the time");
  await expect(error).toHaveCount(0);
  await expect(page).toHaveURL(/\/new$/);
});

for (const size of SIZES) {
  test(`F-01, M-04: New steelman passes an accessibility scan, and looks as saved, at ${size.name} width`, async ({ board }) => {
    const page = await home(board, size.width);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    await expect(page).toHaveScreenshot(`new-steelman-${size.name}.png`);
  });
}

async function fillIn(page: Page): Promise<void> {
  await question(page).fill("Should our school start an hour later?");
  await option(page, 1).fill("Start later");
  await option(page, 2).fill("Keep the time");
}

test("F-01: offline, the sheet says so and keeps what was typed; once back, Create works", async ({ board }) => {
  const page = await home(board);
  await fillIn(page);
  await page.route("**/api/boards", (route) => route.abort("internetdisconnected"));

  await create(page).click();

  await expect(page.getByRole("alert")).toHaveText("Your browser couldn’t reach Steelman. Try again.");
  await expect(create(page)).toBeEnabled();
  await expect(question(page)).toHaveValue("Should our school start an hour later?");
  await page.unroute("**/api/boards");
  await create(page).click();
  await expect(page).toHaveURL(/\/b\/[A-Za-z0-9_-]{12}$/);
});

test("F-01: an answer the app can't read doesn't leave Create stuck", async ({ board }) => {
  const page = await home(board);
  await fillIn(page);
  await page.route("**/api/boards", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html>Gateway</html>" }));

  await create(page).click();

  await expect(page.getByRole("alert")).toHaveText("Steelman couldn’t make that board. Try again.");
  await expect(create(page)).toBeEnabled();
});
