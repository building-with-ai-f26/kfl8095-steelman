// A suspended account at Sign in (J-06, M3d-36; finding F8 of the
// public-spaces security review). After the code, or after Google, the page
// says "This account is suspended." and points to the privacy page's
// Questions section, in its own card as Google's "Your account is disabled"
// page is. Asking for a code looks as it does for anyone. The account is
// suspended here as the operator job does it: suspended_at set, and its
// sessions deleted.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, signInByCode, test } from "./support/sign-in.ts";
import type { SignInSite } from "./support/sign-in.ts";

const heading = (page: Page) => page.getByRole("heading", { level: 1 });

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Someone who signed up by code, then was suspended. The page they signed in on is closed first, so nothing is left polling. */
async function suspendedPerson(site: SignInSite, email: string, username: string): Promise<void> {
  const page = await site.browse();
  await signInByCode(site, page, email, username);
  await page.context().close();
  await site.sql("update account set suspended_at = now() where email = $1", [email]);
  await site.sql("delete from sign_in.session where account_id = (select id from account where email = $1)", [email]);
}

async function expectSuspendedCard(page: Page): Promise<void> {
  await expect(heading(page)).toHaveText("Account suspended");
  await expect(heading(page)).toBeFocused();
  await expect(page.getByText("This account is suspended.", { exact: true })).toBeVisible();
  await expect(page.getByText("To ask about it, see Questions on the privacy page.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Questions on the privacy page" })).toHaveAttribute("href", "/privacy#questions");
}

const SIZES = [
  { name: "desktop", width: 1280 },
  { name: "375", width: 375 },
] as const;

for (const size of SIZES) {
  test(`J-06 A suspended account's code sign-in shows the full sentence, and the scan passes at ${size.name} width`, async ({ site }) => {
    const email = `suspended-${size.name}@school.example.edu`;
    await suspendedPerson(site, email, `suspended_${size.name}`);

    const page = await site.browse({ width: size.width });
    await page.goto(site.boardPath);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Email me a code" }).click();
    // Asking for the code looks as it does for anyone.
    await expect(heading(page)).toHaveText("Check your email");
    await page.getByLabel("Code").fill(site.codeFor(email));
    await page.getByRole("button", { name: "Sign in" }).click();

    await expectSuspendedCard(page);
    await expectNoAxeViolations(page);

    // Use a different email goes back to Sign in.
    await page.getByRole("button", { name: "Use a different email" }).click();
    await expect(heading(page)).toHaveText("Sign in");
    await expect(page.getByLabel("Email")).toBeFocused();
  });
}

test("J-06 A suspended account's Google sign-in shows the same sentence, and the link opens the privacy page's Questions", async ({ site }) => {
  const email = "suspended-google@school.example.edu";
  await suspendedPerson(site, email, "suspended_google");
  site.google.signedInAs({ sub: "109300000000000003612", email, emailVerified: true, name: "Pat Example" });

  const page = await site.browse();
  await page.goto(site.boardPath);
  await page.getByRole("button", { name: "Continue with Google" }).click();

  await expectSuspendedCard(page);
  expect(new URL(page.url()).search).toBe("");

  await page.getByRole("link", { name: "Questions on the privacy page" }).click();
  await expect(page).toHaveURL(`${site.origin}/privacy#questions`);
  await expect(page.getByRole("heading", { name: "Questions", exact: true })).toBeInViewport();
});
