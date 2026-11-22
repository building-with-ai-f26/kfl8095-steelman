// M2-8c, changing your email (L-04), as the prototype's Account card shows it
// (approved Nov 22, after Notion): Change, New email, Send code; then "Confirm
// your new email" with the code boxes, Send a new code, Cancel, and Change
// email. The email changes only when the code is entered, and the old address
// is told. Against the real service with sign-in turned on (support/sign-in.ts).

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, signInByCode, test } from "./support/sign-in.ts";
import type { SignInSite } from "./support/sign-in.ts";

const OLD = "ana.lu@school.example.edu";
const NEW = "ana.lu@home.example.org";

const card = (page: Page) => page.getByRole("region", { name: "Your account" });
const emailRow = (page: Page) => card(page).locator(".sm-rrow", { hasText: "Email" }).first();
const confirm = (page: Page) => card(page).getByRole("group", { name: "Confirm your new email" });
const status = (page: Page) => page.locator("#sm-status");

/** Signed in as Ana, on Your account, with a code sent to `to`. */
async function codeSent(site: SignInSite, page: Page, to = NEW): Promise<void> {
  await signInByCode(site, page, OLD, "ana_lu");
  await page.goto("/account");
  await emailRow(page).getByRole("button", { name: "Change" }).click();
  await expect(card(page).getByLabel("New email")).toBeFocused();
  await card(page).getByLabel("New email").fill(to);
  await card(page).getByRole("button", { name: "Send code" }).click();
  await expect(confirm(page)).toBeVisible();
}

test("M2-8c, L-04: a code goes to the new email, and the email changes when it's entered; the old address is told", async ({ site }) => {
  const page = await site.browse();
  await codeSent(site, page);

  await expect(confirm(page)).toContainText(`We sent a code to ${NEW}. Your email changes when you enter it.`);
  await expect(confirm(page).getByLabel("Code")).toBeFocused();
  await expect(emailRow(page)).toContainText(OLD);

  await confirm(page).getByLabel("Code").fill(site.codeFor(NEW));
  await confirm(page).getByRole("button", { name: "Change email" }).click();

  await expect(confirm(page)).toHaveCount(0);
  await expect(emailRow(page)).toContainText(NEW);
  await expect(status(page)).toHaveText(`Your email is now ${NEW}. We sent a note to your old email.`);
  await expect(emailRow(page).getByRole("button", { name: "Change" })).toBeFocused();
  expect(site.sentAll(OLD).at(-1)).toMatchObject({ kind: "changed", newEmail: NEW });

  await page.reload();
  await expect(emailRow(page)).toContainText(NEW);
});

test("M2-8c, L-04: the code's errors are sign-in's, a new code cancels the old, and Cancel changes nothing", async ({ site }) => {
  const page = await site.browse();
  await codeSent(site, page);
  const code = confirm(page).getByLabel("Code");
  const error = confirm(page).locator(".sm-field-error");

  await confirm(page).getByRole("button", { name: "Change email" }).click();
  await expect(error).toHaveText("Enter the 6-digit code.");
  await code.fill(site.codeFor(NEW) === "000000" ? "111111" : "000000");
  await code.press("Enter");
  await expect(error).toHaveText("That code isn’t right.");
  await expect(code).toHaveAttribute("aria-invalid", "true");

  await confirm(page).getByRole("button", { name: "Send a new code" }).click();
  await expect(status(page)).toHaveText(`We sent a new code to ${NEW}. The earlier code no longer works.`);
  await expect.poll(() => site.sentAll(NEW).length).toBe(2);
  await expect(error).toHaveCount(0);

  await site.expireCodes();
  await code.fill(site.codeFor(NEW));
  await confirm(page).getByRole("button", { name: "Change email" }).click();
  await expect(error).toHaveText("That code has expired. Send a new code.");

  await confirm(page).getByRole("button", { name: "Cancel" }).click();
  await expect(confirm(page)).toHaveCount(0);
  await expect(status(page)).toHaveText("Your email hasn’t changed.");
  await expect(emailRow(page)).toContainText(OLD);
  await expect(emailRow(page).getByRole("button", { name: "Change" })).toBeFocused();
});

test("M2-8c, L-04: the new email is checked before a code is sent, and Cancel goes back to Change", async ({ site }) => {
  const page = await site.browse();
  await signInByCode(site, page, OLD, "ana_lu");
  await page.goto("/account");
  await emailRow(page).getByRole("button", { name: "Change" }).click();
  const field = card(page).getByLabel("New email");
  const error = card(page).locator(".sm-field-error");

  await field.fill("not-an-address");
  await field.press("Enter");
  await expect(error).toHaveText("That doesn’t look like an email address.");
  await field.fill(OLD.toUpperCase());
  await card(page).getByRole("button", { name: "Send code" }).click();
  await expect(error).toHaveText("That’s already your email.");
  expect(site.sentAll(OLD).length).toBe(1);

  await card(page).getByRole("button", { name: "Cancel" }).click();
  await expect(field).toHaveCount(0);
  await expect(emailRow(page).getByRole("button", { name: "Change" })).toBeFocused();
});

test("M2-8c, L-04: if another account takes the email before the code is entered, it says so and nothing changes", async ({ site }) => {
  const page = await site.browse();
  await codeSent(site, page);
  const code = site.codeFor(NEW);
  const other = await site.browse();
  await signInByCode(site, other, NEW, "someone_else");

  await confirm(page).getByLabel("Code").fill(code);
  await confirm(page).getByRole("button", { name: "Change email" }).click();
  await expect(confirm(page).locator(".sm-field-error")).toHaveText("Another account already uses this email.");
  await expect(emailRow(page)).toContainText(OLD);
});

test("M2-8c, L-04: Escape closes either step and puts the cursor back on Change", async ({ site }) => {
  const page = await site.browse();
  await signInByCode(site, page, OLD, "ana_lu");
  await page.goto("/account");
  const change = emailRow(page).getByRole("button", { name: "Change" });

  await change.click();
  await card(page).getByLabel("New email").press("Escape");
  await expect(card(page).getByLabel("New email")).toHaveCount(0);
  await expect(change).toBeFocused();

  await change.click();
  await card(page).getByLabel("New email").fill(NEW);
  await card(page).getByLabel("New email").press("Enter");
  await expect(confirm(page).getByLabel("Code")).toBeFocused();
  await confirm(page).getByLabel("Code").press("Escape");
  await expect(confirm(page)).toHaveCount(0);
  await expect(status(page)).toHaveText("Your email hasn’t changed.");
  await expect(change).toBeFocused();
});

for (const width of [1280, 375]) {
  test(`M2-8c, M-04: Your account while confirming a new email passes an accessibility scan, at ${width} px`, async ({ site }) => {
    const page = await site.browse({ width });
    await codeSent(site, page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
