// Your statistics on Your account (L-09, M3d-14): counts of what you wrote,
// worked out by the service each time you open the page, after Username and
// kept out of analytics and screen replays (ph-no-capture). Each line is a
// full sentence, as Wikipedia's Special:Contributions says "A user with
// 15,156 edits." (checked Nov 25). A new account sees one sentence instead of
// a list of zeros.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import { signInByCode, test as signedIn } from "./support/sign-in.ts";

const JORDANS = [
  "You wrote 1 argument, and it is in its option’s top three.",
  "You wrote 2 wordings, and 1 of them leads its row.",
  "You haven’t added a source yet.",
  "You haven’t written a comment yet.",
  "You took part in 1 board.",
];

const statistics = (page: Page): Locator => page.getByRole("region", { name: "Your account" }).locator(".sm-rgroup", { has: page.getByRole("heading", { name: "Your statistics", level: 2 }) });

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

for (const width of [1280, 375]) {
  test(`L-09: at ${width} px, Your statistics follows Username, says only you can see it, and counts what you wrote in full sentences`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, at: "/account" });
    await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();

    const group = statistics(page);
    await expect(group).toBeVisible();
    await expect(group).toHaveClass(/(^| )ph-no-capture( |$)/);
    await expect(group.locator("p").first()).toHaveText("Only you can see these numbers.");
    await expect(group.getByRole("listitem")).toHaveText(JORDANS);
    for (const line of await group.getByRole("listitem").allTextContents()) expect(line).toMatch(/^You [^.]+\.$/);

    // After the group with Username, and before the Privacy group.
    const headings = await page.getByRole("region", { name: "Your account" }).locator(".sm-rgroup").evaluateAll((groups) => groups.map((each) => (each.querySelector("h2")?.textContent ?? each.querySelector(".sm-rrow-label")?.firstChild?.textContent ?? "").trim()));
    expect(headings.indexOf("Your statistics")).toBe(headings.indexOf("Username") + 1);
    expect(headings.indexOf("Your statistics")).toBeLessThan(headings.indexOf("Privacy"));

    // Every line fits the card, with no sideways scroll.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const card = await group.boundingBox();
    for (const line of await group.getByRole("listitem").all()) {
      const box = (await line.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(card!.x + card!.width);
    }
    await expectNoAxeViolations(page);
  });
}

test("L-09: what you write on a board shows on Your statistics the next time you open it, and someone else's statistics don't change", async ({ board }) => {
  const id = board.ids.itemId();
  await board.api("jordan_w").post("comments", { id, body: "Which budget figures is this from?" });

  const page = await board.open("jordan_w", { at: "/account" });
  await expect(statistics(page).getByRole("listitem")).toHaveText([JORDANS[0]!, JORDANS[1]!, JORDANS[2]!, "You wrote 1 comment.", JORDANS[4]!]);

  const other = await board.open("lin.zhao", { at: "/account" });
  await expect(statistics(other).getByRole("listitem")).toHaveText([
    "You wrote 1 argument, and it is in its option’s top three.",
    "You wrote 1 wording, and it leads its row.",
    "You haven’t added a source yet.",
    "You haven’t written a comment yet.",
    "You took part in 1 board.",
  ]);
});

for (const width of [1280, 375]) {
  signedIn(`L-09: at ${width} px, a new account's statistics say it hasn't written anything yet`, async ({ site }) => {
    const page = await site.browse({ width });
    await signInByCode(site, page, "new.reader@school.example.edu", "new_reader");
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();

    const group = statistics(page);
    await expect(group).toHaveClass(/(^| )ph-no-capture( |$)/);
    await expect(group.locator("p").first()).toHaveText("Only you can see these numbers.");
    await expect(group.getByRole("listitem")).toHaveText(["You haven’t written anything yet."]);
    // The group fits the page. (An account with an email has a wider Email row at 375 px, which is no part of this.)
    const box = (await group.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await expectNoAxeViolations(page);
  });
}

test("L-09: when the statistics can't be read, the group says so, and the rest of Your account still shows", async ({ board }) => {
  const page = await board.open("jordan_w", {
    at: "/account",
    prepare: (context) => context.route("**/api/account/statistics", (route) => route.fulfill({ status: 500, body: "" })),
  });
  await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();

  const group = statistics(page);
  await expect(group.locator("p").first()).toHaveText("Only you can see these numbers.");
  await expect(group.getByText("Steelman couldn’t count what you wrote. Reload the page to try again.")).toBeVisible();
  await expect(group.getByRole("listitem")).toHaveCount(0);
  await expect(page.locator(".sm-rrow", { hasText: "Username" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Privacy", level: 2 })).toBeVisible();
  await expectNoAxeViolations(page);
  // The browser logs the 500 itself; this test expects it, and only it.
  const expected = board.errors.filter((error) => error.includes("status of 500"));
  expect(expected.length).toBeGreaterThan(0);
  board.errors.splice(0, board.errors.length, ...board.errors.filter((error) => !error.includes("status of 500")));
});

test("L-09, M-07: the privacy page says only you see your statistics", async ({ board, browser }) => {
  const origin = new URL((await board.open("jordan_w")).url()).origin;
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  await page.goto("/privacy");

  await expect(page.getByText("Steelman shows you counts of what you wrote, worked out from what it already keeps, and no one else sees them.")).toBeVisible();
  await expect(page.getByText("Updated November 25, 2026")).toBeVisible();
});
