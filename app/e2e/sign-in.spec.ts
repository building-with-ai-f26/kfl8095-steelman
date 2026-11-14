// The sign-in screens (L-01), as designed in the prototype on Nov 14: Sign in,
// Check your email, and Choose a username. Each path through them, in a real
// browser, against the real service with sign-in turned on. Codes are read
// from the service's outbox, and Google is the stand-in (support/sign-in.ts).
// Plus an accessibility scan and saved screenshots of each screen (M-04).

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { QUESTION, expect, signInByCode, test } from "./support/sign-in.ts";
import { importance } from "./support/screen.ts";

const WORDING = "Students need a quiet place to study before Monday exams.";

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const error = (page: Page) => page.locator(".sm-landing-auth .sm-field-error");

async function askForCode(page: Page, email: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(heading(page)).toHaveText("Check your email");
}

async function typeCode(page: Page, code: string): Promise<void> {
  await page.getByLabel("Code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
}

const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

test("L-01 Signed out, opening a board asks you to sign in first, and shows nothing of the board", async ({ site }) => {
  const page = await site.browse();
  const asked: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/boards")) asked.push(request.url());
  });
  await page.goto(site.boardPath);

  await expect(heading(page)).toHaveText("Sign in");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByText(QUESTION)).toHaveCount(0);
  await expect(page.getByText(WORDING)).toHaveCount(0);
  // Nor did the page ask for it. (The API's own rule on who may read a board comes with roles, M1-5.)
  expect(asked).toEqual([]);
});

test("L-01 By email: a code, then a username suggested from the email, then the board, where a vote counts", async ({ site }) => {
  const page = await site.browse();
  await page.goto(site.boardPath);
  await askForCode(page, "Sam.Reyes@school.example.edu");
  await expect(page.getByText("We sent a code to sam.reyes@school.example.edu.")).toBeVisible();

  await typeCode(page, site.codeFor("sam.reyes@school.example.edu"));
  await expect(heading(page)).toHaveText("Choose a username");
  await expect(page.getByLabel("Username")).toHaveValue("sam_reyes");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(heading(page)).toHaveText(QUESTION);
  const more = importance(page, WORDING).getByRole("button", { name: "More important if true" });
  await more.click();
  await expect(more).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(importance(page, WORDING).getByRole("button", { name: "More important if true" })).toHaveAttribute("aria-pressed", "true");
});

test("L-01 Someone who already has a username goes straight to the board", async ({ site }) => {
  await signInByCode(site, await site.browse(), "dana@school.example.edu", "dana_k");

  const again = await site.browse();
  await signInByCode(site, again, "DANA@school.example.edu");
  await expect(again.getByText("Choose a username")).toHaveCount(0);
});

test("L-01 A wrong code says so, the fifth wrong try cancels it, and a new code works", async ({ site }) => {
  const page = await site.browse();
  await page.goto(site.boardPath);
  await askForCode(page, "lee@school.example.edu");
  const first = site.codeFor("lee@school.example.edu");

  await typeCode(page, "12");
  await expect(error(page)).toHaveText("Enter the 6-digit code.");
  for (let i = 1; i <= 4; i++) {
    await typeCode(page, wrong(first));
    await expect(error(page)).toHaveText("That code isn’t right.");
  }
  await typeCode(page, wrong(first));
  await expect(error(page)).toHaveText("Too many wrong tries. Send a new code.");
  await typeCode(page, first);
  await expect(error(page)).toHaveText("Too many wrong tries. Send a new code.");

  await page.getByRole("button", { name: "Send a new code" }).click();
  await expect(page.getByText("We sent a new code to lee@school.example.edu.")).toBeVisible();
  await expect(page.getByLabel("Code")).toHaveValue("");
  await typeCode(page, site.codeFor("lee@school.example.edu"));
  await expect(heading(page)).toHaveText("Choose a username");
});

test("L-01 Asking for a new code cancels the old one, and the cursor stays in the code", async ({ site }) => {
  const page = await site.browse();
  await page.goto(site.boardPath);
  await askForCode(page, "kai@school.example.edu");
  await expect(page.getByLabel("Code")).toBeFocused();
  await expect(page.getByLabel("Code")).toHaveAccessibleDescription("We sent a code to kai@school.example.edu.");
  const old = site.codeFor("kai@school.example.edu");
  await page.getByRole("button", { name: "Send a new code" }).click();
  await expect(page.getByText("We sent a new code to kai@school.example.edu.")).toBeVisible();
  await expect(page.getByLabel("Code")).toBeFocused();

  await typeCode(page, old);
  await expect(error(page)).toHaveText("That code isn’t right.");
});

test("L-01 An expired code says so, and keeps saying so until a new code is sent", async ({ site }) => {
  const page = await site.browse();
  await page.goto(site.boardPath);
  await askForCode(page, "ava@school.example.edu");
  const code = site.codeFor("ava@school.example.edu");
  await site.expireCodes();

  await typeCode(page, code);
  await expect(error(page)).toHaveText("That code has expired. Send a new code.");
  // The service has now deleted it, so it would only say the code isn't right; the screen keeps saying why.
  await typeCode(page, code);
  await expect(error(page)).toHaveText("That code has expired. Send a new code.");

  await page.getByRole("button", { name: "Send a new code" }).click();
  await expect(page.getByText("We sent a new code to ava@school.example.edu.")).toBeVisible();
  await typeCode(page, site.codeFor("ava@school.example.edu"));
  await expect(heading(page)).toHaveText("Choose a username");
});

test("L-01 A code pasted with a space in it still signs in", async ({ site }) => {
  const page = await site.browse();
  await page.goto(site.boardPath);
  await askForCode(page, "paste@school.example.edu");
  const code = site.codeFor("paste@school.example.edu");

  // Inserted in one go, as a paste is, so the field's own limits apply as they do to a paste.
  await page.getByLabel("Code").focus();
  await page.keyboard.insertText(`${code.slice(0, 3)} ${code.slice(3)}`);
  await expect(page.getByLabel("Code")).toHaveValue(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(heading(page)).toHaveText("Choose a username");
});

test("L-01 If Steelman can't say who is signed in, the page says so instead of asking to sign in again", async ({ site }) => {
  const page = await site.browse();
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ status: 503, body: "" }));
  await page.goto(site.boardPath);
  await expect(heading(page)).toHaveText("Couldn’t reach Steelman");

  await page.unroute("**/api/auth/get-session");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(heading(page)).toHaveText("Sign in");
});

test("L-01 Use a different email goes back, keeping what was typed", async ({ site }) => {
  const page = await site.browse();
  await page.goto(site.boardPath);
  await askForCode(page, "typo@school.example.edu");

  await page.getByRole("button", { name: "Use a different email" }).click();
  await expect(heading(page)).toHaveText("Sign in");
  await expect(page.getByLabel("Email")).toHaveValue("typo@school.example.edu");
});

test("L-01 The sixth code to one address in an hour is refused, and nothing is sent", async ({ site }) => {
  const page = await site.browse();
  await page.goto(site.boardPath);
  await askForCode(page, "busy@school.example.edu");
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "Send a new code" }).click();
    await expect.poll(() => site.sentTo("busy@school.example.edu")).toBe(i + 2);
  }

  await page.getByRole("button", { name: "Send a new code" }).click();
  await expect(error(page)).toHaveText("Too many codes sent to this address. Try again in an hour.");
  expect(site.sentTo("busy@school.example.edu")).toBe(5);
});

test("L-01 An email that isn't an address is refused before anything is sent", async ({ site }) => {
  const page = await site.browse();
  await page.goto(site.boardPath);

  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(error(page)).toHaveText("Enter your email.");
  await page.getByLabel("Email").fill("not-an-address");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(error(page)).toHaveText("That doesn’t look like an email address.");
});

test("L-01 With Google: through Google's page and back to the board, choosing a username on the way", async ({ site }) => {
  site.google.signedInAs({ sub: "109300000000000000042", email: "Robin.Ng@school.example.edu", emailVerified: true, name: "Robin Ng" });
  const page = await site.browse();
  await page.goto(site.boardPath);

  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(heading(page)).toHaveText("Choose a username");
  expect(new URL(page.url()).pathname).toBe(site.boardPath);
  await expect(page.getByLabel("Username")).toHaveValue("robin_ng");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page)).toHaveText(QUESTION);
});

test("L-01 When Google refuses (an email it hasn't verified), you're back at Sign in with a way forward", async ({ site }) => {
  site.google.signedInAs({ sub: "109300000000000000043", email: "unverified@school.example.edu", emailVerified: false });
  const page = await site.browse();
  await page.goto(site.boardPath);

  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(heading(page)).toHaveText("Sign in");
  await expect(page.getByText("Google couldn’t confirm your email. Use a code instead.")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeFocused();
  expect(new URL(page.url()).search).toBe("");
});

test("L-01 Cancelling at Google comes back to Sign in with no message", async ({ site }) => {
  site.google.cancelNextSignIn();
  const page = await site.browse();
  await page.goto(site.boardPath);

  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(`${site.origin}${site.boardPath}`);
  await expect(heading(page)).toHaveText("Sign in");
  await expect(page.locator(".sm-field-error")).toHaveCount(0);
});

test("L-01 When Google sign-in isn't available, it says so and points to the code", async ({ site }) => {
  const page = await site.browse();
  await page.goto(site.boardPath);
  // As the service answers when it has no Google client (server/src/main.ts without GOOGLE_CLIENT_ID).
  await page.route("**/api/auth/sign-in/social", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "PROVIDER_NOT_FOUND" }) }));

  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByText("Google sign-in isn’t available. Use a code instead.")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeFocused();
});

test("L-01 A username that's the wrong shape, reserved, or taken is refused; capitals become lower case", async ({ site }) => {
  await signInByCode(site, await site.browse(), "first@school.example.edu", "pat_lee");
  const page = await site.browse();
  await page.goto(site.boardPath);
  await askForCode(page, "second@school.example.edu");
  await typeCode(page, site.codeFor("second@school.example.edu"));
  const name = page.getByLabel("Username");
  const go = page.getByRole("button", { name: "Continue" });

  for (const [typed, message] of [
    ["ab", "Use 3 to 20 letters, numbers, or underscores."],
    ["pat.lee", "Use 3 to 20 letters, numbers, or underscores."],
    ["admin", "admin is reserved."],
    ["pat_lee", "pat_lee is taken."],
  ] as const) {
    await name.fill(typed);
    await go.click();
    await expect(error(page)).toHaveText(message);
  }
  await name.fill("");
  await name.pressSequentially("Pat_Lee2");
  await expect(error(page)).toHaveCount(0);
  await expect(name).toHaveValue("pat_lee2");
  await go.click();
  await expect(heading(page)).toHaveText(QUESTION);
});

// The three screens, scanned and compared with saved screenshots at desktop width and at 375 px.
const SIZES = [
  { name: "desktop", width: 1280 },
  { name: "375", width: 375 },
] as const;

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

for (const size of SIZES) {
  test(`M-04 L-01 The sign-in screens pass an accessibility scan and look as saved at ${size.name} width`, async ({ site }) => {
    const page = await site.browse({ width: size.width });
    await page.goto(site.boardPath);
    await expect(heading(page)).toHaveText("Sign in");
    await expectNoAxeViolations(page);
    await expect(page).toHaveScreenshot(`sign-in-${size.name}.png`, { fullPage: true });

    await askForCode(page, "look@school.example.edu");
    await page.getByLabel("Code").fill("482");
    await expectNoAxeViolations(page);
    await expect(page).toHaveScreenshot(`sign-in-code-${size.name}.png`, { fullPage: true });

    await page.getByLabel("Code").fill(site.codeFor("look@school.example.edu"));
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(heading(page)).toHaveText("Choose a username");
    await expectNoAxeViolations(page);
    await expect(page).toHaveScreenshot(`sign-in-username-${size.name}.png`, { fullPage: true });
  });
}
