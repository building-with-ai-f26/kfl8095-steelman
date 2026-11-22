// M2-8b, the ways in on Your account (L-04), as Notion: Google signs in to the
// account with the same email, so there's nothing to connect or disconnect.
// Both ways in are listed, with no buttons, whichever one the person used.
// Against the real service with sign-in turned on (support/sign-in.ts).

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { QUESTION, expect, signInByCode, test } from "./support/sign-in.ts";

async function expectWaysIn(page: Page): Promise<void> {
  await page.goto("/account");
  const group = page.getByRole("region", { name: "Your account" }).locator(".sm-rgroup", { has: page.getByRole("heading", { name: "Sign in with" }) });
  await expect(group.locator(".sm-rrow-label small")).toHaveText([
    "We email you a code each time you sign in.",
    "You can sign in with Google if your Google account uses this email.",
  ]);
  expect(await group.locator(".sm-rrow-label").evaluateAll((labels) => labels.map((label) => label.firstChild?.textContent))).toEqual(["Email code", "Google"]);
  await expect(group.getByRole("button")).toHaveCount(0);
  await expect(group.getByRole("link")).toHaveCount(0);
}

test("M2-8b, L-04: someone who signs in by code sees both ways in on Your account, with no buttons", async ({ site }) => {
  const page = await site.browse();
  await signInByCode(site, page, "ana.lu@school.example.edu", "ana_lu");
  await expectWaysIn(page);
  // Only someone really signed in has an email, so this is where the group gets its accessibility scan (M-04).
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("M2-8b, L-04: someone who signs in with Google sees the same two ways in", async ({ site }) => {
  site.google.signedInAs({ sub: "109300000000000000042", email: "robin.ng@school.example.edu", emailVerified: true, name: "Robin Ng" });
  const page = await site.browse();
  await page.goto(site.boardPath);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  await expectWaysIn(page);
});
