// Changing your username (L-04, M3d-15): the Username row on Your account
// gains Change, which opens a field holding the current name with Cancel and
// Save, as Google Account's Name row does (Edit, a field, Save) and as
// GitHub's account settings offer "Change username". The service's own rules
// (the 30-day hold, the race, the daily job) are tested in
// server/test/api/username-change.test.ts.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import { find, status } from "./support/screen.ts";

const OMARS = "Staff need a guaranteed day off.";
const HINT = "Your old username stays reserved for you for 30 days, and links to it lead to your new one.";
const SHAPE = "Use 3 to 20 letters, numbers, or underscores.";
const REFUSED = "omar_h: Failed to load resource: the server responded with a status of 409 (Conflict)";

const card = (page: Page) => page.getByRole("region", { name: "Your account" });
const usernameRow = (page: Page) => card(page).locator(".sm-rrow", { hasText: "Username" });
const changeButton = (page: Page) => card(page).getByRole("button", { name: "Change username" });
const form = (page: Page) => card(page).getByRole("group", { name: "Change username" });
const field = (page: Page) => form(page).getByRole("textbox", { name: "New username" });
const fieldError = (page: Page) => form(page).locator(".sm-field-error");

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

for (const width of [1280, 375]) {
  test(`L-04: at ${width} px, Change opens a field with the current name, and Save changes it, says so, and shows the new name after a reload and on a board's byline`, async ({ board }) => {
    const page = await board.open("omar_h", { width, at: "/account" });
    await expect(usernameRow(page)).toContainText("omar_h");

    await changeButton(page).click();
    await expect(field(page)).toHaveValue("omar_h");
    await expect(field(page)).toBeFocused();
    await expect(form(page).getByText(HINT)).toBeVisible();
    await expect(field(page)).toHaveAccessibleDescription(HINT);
    await expect(field(page)).toHaveClass(/ph-no-capture/);
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    await field(page).fill("Omar_Hassan");
    await expect(field(page)).toHaveValue("omar_hassan");
    await form(page).getByRole("button", { name: "Save" }).click();

    await expect(status(page)).toHaveText("Your username is now omar_hassan.");
    await expect(form(page)).toHaveCount(0);
    await expect(usernameRow(page).locator(".sm-rrow-value")).toHaveText("omar_hassan");
    await expect(changeButton(page)).toBeFocused();
    // Delete account asks for the new name.
    await card(page).getByRole("button", { name: "Delete account" }).click();
    await expect(card(page).getByRole("textbox", { name: "Type omar_hassan to confirm" })).toBeVisible();

    await page.reload();
    await expect(usernameRow(page).locator(".sm-rrow-value")).toHaveText("omar_hassan");
    const { version } = await find(board, OMARS);
    await page.goto(`/b/${board.demo.board}`);
    await expect(page.locator(`[data-card="${version}"] .sm-byline`)).toContainText("omar_hassan");
  });

  test(`L-04: at ${width} px, Cancel and Escape close the field and change nothing, and the keyboard alone changes the name`, async ({ board }) => {
    const page = await board.open("omar_h", { width, at: "/account" });

    await changeButton(page).click();
    await field(page).fill("omar_other");
    await form(page).getByRole("button", { name: "Cancel" }).click();
    await expect(form(page)).toHaveCount(0);
    await expect(usernameRow(page).locator(".sm-rrow-value")).toHaveText("omar_h");
    await expect(changeButton(page)).toBeFocused();

    // Keyboard only: Enter opens it, Escape closes it, and Enter in the field saves.
    await page.keyboard.press("Enter");
    await expect(field(page)).toBeFocused();
    await page.keyboard.type("x");
    await page.keyboard.press("Escape");
    await expect(form(page)).toHaveCount(0);
    await expect(changeButton(page)).toBeFocused();
    await expect(usernameRow(page).locator(".sm-rrow-value")).toHaveText("omar_h");

    await page.keyboard.press("Enter");
    await expect(field(page)).toBeFocused();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("omar_keys");
    await page.keyboard.press("Enter");
    await expect(status(page)).toHaveText("Your username is now omar_keys.");
    await expect(changeButton(page)).toBeFocused();
  });

  test(`L-04: at ${width} px, each refusal shows under the field, marks it invalid, and is read out, and nothing changes`, async ({ board }) => {
    const page = await board.open("omar_h", { width, at: "/account" });
    await changeButton(page).click();
    const save = form(page).getByRole("button", { name: "Save" });

    const refusals: [string, string][] = [
      ["ab", SHAPE],
      ["lin_zhao!", SHAPE],
      ["admin", "admin is reserved."],
      ["omar_h", "That’s already your username."],
      ["jordan_w", "jordan_w is taken."],
    ];
    for (const [typed, sentence] of refusals) {
      await field(page).fill(typed);
      await save.click();
      await expect(fieldError(page)).toHaveText(sentence);
      await expect(fieldError(page)).toHaveAttribute("role", "alert");
      await expect(field(page)).toHaveAttribute("aria-invalid", "true");
      await expect(field(page)).toHaveAccessibleDescription(`${sentence} ${HINT}`);
      await expect(field(page)).toBeFocused();
    }
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    // Typing clears the sentence.
    await field(page).fill("omar_two");
    await expect(fieldError(page)).toHaveCount(0);
    await save.click();
    await expect(status(page)).toHaveText("Your username is now omar_two.");

    // A second change within 30 days says when it's allowed. The test's clock starts on Nov 16 at noon UTC.
    await changeButton(page).click();
    await field(page).fill("omar_three");
    await save.click();
    await expect(fieldError(page)).toHaveText("You can change your username again on Dec 16.");
    await page.reload();
    await expect(usernameRow(page).locator(".sm-rrow-value")).toHaveText("omar_two");
    expect(board.errors.splice(0)).toEqual([REFUSED, REFUSED]);
  });
}

test("L-04: at 1280 px, a second Enter while a save waits sends nothing, and an answer that comes back after Escape leaves the reopened field alone", async ({ board }) => {
  const page = await board.open("omar_h", { width: 1280, at: "/account" });
  // The service's answers are held here, so the test decides when each one comes back.
  const held: { answer(body: object): Promise<void> }[] = [];
  await page.route("**/api/account/username", (route) => {
    held.push({ answer: (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }) });
  });

  await changeButton(page).click();
  await field(page).fill("omar_late");
  await page.keyboard.press("Enter");
  await expect.poll(() => held.length).toBe(1);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(form(page)).toHaveCount(0);
  await changeButton(page).click();
  await field(page).fill("omar_fresh");
  expect(held).toHaveLength(1);

  // The late answer still puts the changed name on the row, but leaves the open field as it is.
  await held[0]!.answer({ status: "done", username: "omar_late" });
  await expect(status(page)).toHaveText("Your username is now omar_late.");
  await expect(form(page)).toBeVisible();
  await expect(field(page)).toHaveValue("omar_fresh");
  await expect(fieldError(page)).toHaveCount(0);
  expect(board.errors).toEqual([]);
});
