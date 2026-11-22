// M2-8a, Sign out (L-04), from Your account, as the prototype's account card
// has it: the session ends on the service, so neither this tab nor a reload
// is signed in, and the next sign-in starts afresh. Against the real service
// with sign-in turned on (support/sign-in.ts).

import { QUESTION, expect, signInByCode, test } from "./support/sign-in.ts";

test("M2-8a, L-04: Sign out on Your account ends the session: Sign in shows, a reload stays signed out, and the service refuses the old session", async ({ site }) => {
  const page = await site.browse();
  await signInByCode(site, page, "ana.lu@school.example.edu", "ana_lu");
  await page.getByRole("link", { name: "Your account" }).click();
  await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();

  const before = await page.context().cookies();

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  await expect(page).toHaveURL("/");
  // The session itself is ended, not only the cookie cleared: the old cookie, sent again from another browser, is refused.
  const replay = await page.context().browser()!.newContext({ baseURL: site.origin });
  await replay.addCookies(before);
  expect((await replay.request.get("/api/account")).status()).toBe(401);
  await replay.close();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  expect((await page.request.get("/api/account")).status()).toBe(401);
  await page.goto(site.boardPath);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  await expect(page.getByText(QUESTION)).toHaveCount(0);
});

test("M2-8a, L-04: after signing out, signing in again reaches the same account", async ({ site }) => {
  const page = await site.browse();
  await signInByCode(site, page, "ana.lu@school.example.edu", "ana_lu");
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");

  await signInByCode(site, page, "ana.lu@school.example.edu");
  await page.goto("/account");
  await expect(page.getByRole("region", { name: "Your account" }).locator(".sm-rrow", { hasText: "Username" })).toContainText("ana_lu");
});
