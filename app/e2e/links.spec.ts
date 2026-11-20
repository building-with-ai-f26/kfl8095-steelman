// Links (M-06), in the browser: an address for every board and version, the
// address following what's open, Back, Forward, and reload, Copy link on a
// version, and the states of a link to something that isn't there. The
// scenarios are the "Links" rows of tests/build-1-manual.md (Nov 11), less
// comments, which the app doesn't have yet.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { find, row } from "./support/screen.ts";
import { QUESTION, test as siteTest } from "./support/sign-in.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const SECOND = "Shift workers can only come on Sundays.";

const SIZES = [
  { name: "desktop", width: 1280 },
  { name: "375", width: 375 },
] as const;

/** A wording's card, wherever it is on the board. */
const card = (page: Page, wording: string): Locator => page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
/** The button that opens a card, which is its wording. */
const claim = (page: Page, wording: string): Locator => card(page, wording).getByRole("button", { name: wording });
const path = (page: Page) => new URL(page.url()).pathname;

/**
 * Records each card that rings, as it rings: the ring lasts 1.4 s, which a
 * slow run could miss if a test only looked for it afterwards.
 */
async function watchRings(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const rung: string[] = ((window as unknown as { rung: string[] }).rung = []);
    const note = (element: Element) => {
      for (const ringed of [element, ...element.querySelectorAll(".sm-arrived")]) {
        if (ringed instanceof HTMLElement && ringed.classList.contains("sm-arrived") && ringed.dataset.card) rung.push(ringed.dataset.card);
      }
    };
    // A card can be drawn already ringed (added), or be ringed later (its class changes).
    new MutationObserver((changes) => {
      for (const change of changes) {
        if (change.type === "attributes" && change.target instanceof Element) note(change.target);
        for (const added of change.addedNodes) if (added instanceof Element) note(added);
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
  });
}

/** Whether the card rang, by its version ID: when it first drew with its ring, or since. */
async function rang(page: Page, wording: string): Promise<boolean> {
  const id = await card(page, wording).getAttribute("data-card");
  return page.evaluate((id) => (window as unknown as { rung: string[] }).rung.includes(id!) || document.querySelector(`[data-card="${id}"]`)!.classList.contains("sm-arrived"), id);
}

async function versionLink(board: TestBoard, wording: string): Promise<string> {
  return `/b/${board.demo.board}/v/${(await find(board, wording)).version}`;
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("M-06: a board's link opens the board, at the board's address", async ({ board }) => {
  const page = await board.open("jordan_w");

  expect(path(page)).toBe(`/b/${board.demo.board}`);
  await expect(page.locator(".sm-card.sm-expanded")).toHaveCount(0);
});

test("M-06: the address follows the open version, and goes back to the board's when it closes", async ({ board }) => {
  const page = await board.open("jordan_w");

  await claim(page, LEAD).click();
  await expect(claim(page, LEAD)).toHaveAttribute("aria-expanded", "true");
  expect(path(page)).toBe(await versionLink(board, LEAD));

  // A wording further along its row: unfold the row, then open it. One version is open at a time.
  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await claim(page, SECOND).click();
  await expect(page).toHaveURL(new RegExp(`${await versionLink(board, SECOND)}$`));
  await expect(page.locator(".sm-card.sm-expanded")).toHaveCount(1);

  await claim(page, SECOND).click();
  await expect(page).toHaveURL(new RegExp(`/b/${board.demo.board}$`));
});

test("M-06: folding the row a version is open in gives the address back to the board", async ({ board }) => {
  const page = await board.open("jordan_w");

  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await claim(page, SECOND).click();
  await page.getByRole("button", { name: "Fold versions back into the stack" }).click();

  await expect(page).toHaveURL(new RegExp(`/b/${board.demo.board}$`));
  // Unfolding it again doesn't bring the version, or its address, back.
  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await expect(claim(page, SECOND)).toHaveAttribute("aria-expanded", "false");
  expect(path(page)).toBe(`/b/${board.demo.board}`);
});

test("M-06: on a phone, switching to the other side closes the version open on this one", async ({ board }) => {
  const page = await board.open("jordan_w", { width: 375 });

  await claim(page, LEAD).click();
  await expect(page).toHaveURL(new RegExp(`${await versionLink(board, LEAD)}$`));
  await page.getByRole("tab", { name: /^No/ }).click();

  await expect(page).toHaveURL(new RegExp(`/b/${board.demo.board}$`));
});

test("M-06, M-08: a card's wording is kept out of PostHog's autocapture, since it is what someone wrote", async ({ board }) => {
  const page = await board.open("jordan_w");

  await expect(claim(page, LEAD)).toHaveClass(/ph-no-capture/);
});

test("M-06: a version's link unfolds its row, opens the version, and rings it", async ({ board }) => {
  const page = await board.open("jordan_w");
  await watchRings(page);

  await page.goto(await versionLink(board, SECOND));

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  await expect(row(page, LEAD).getByRole("region", { name: "Versions, best articulated first" })).toBeVisible();
  await expect(claim(page, SECOND)).toHaveAttribute("aria-expanded", "true");
  expect(await rang(page, SECOND)).toBe(true);
  await expect(card(page, SECOND)).toBeInViewport();
  await expect(page.locator("#sm-status")).toHaveText(`Opened “${QUESTION}”.`);
  expect(path(page)).toBe(await versionLink(board, SECOND));
});

test("M-06: a link to a row's leading wording opens it in place, without unfolding the row", async ({ board }) => {
  const page = await board.open("jordan_w");
  await watchRings(page);

  await page.goto(await versionLink(board, LEAD));

  await expect(claim(page, LEAD)).toHaveAttribute("aria-expanded", "true");
  expect(await rang(page, LEAD)).toBe(true);
  await expect(page.getByRole("region", { name: "Versions, best articulated first" })).toHaveCount(0);
});

test("M-06: on a phone, a version's link shows its option's column", async ({ board }) => {
  const page = await board.open("jordan_w", { width: 375 });
  const staff = "Staff need a guaranteed day off.";

  await page.goto(await versionLink(board, staff));

  await expect(page.getByRole("tab", { name: /^No/ })).toHaveAttribute("aria-selected", "true");
  await expect(card(page, staff)).toBeInViewport();
});

test("M-06: reload keeps the open version, and Back and Forward move between pages", async ({ board }) => {
  const page = await board.open("jordan_w");
  await page.goto("/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New steelman");
  await page.goto(`/b/${board.demo.board}`);
  await claim(page, LEAD).click();
  await expect(page).toHaveURL(new RegExp(`${await versionLink(board, LEAD)}$`));

  await page.reload();
  await expect(claim(page, LEAD)).toHaveAttribute("aria-expanded", "true");

  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New steelman");
  expect(path(page)).toBe("/new");

  await page.goForward();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  expect(path(page)).toBe(await versionLink(board, LEAD));
  await expect(claim(page, LEAD)).toHaveAttribute("aria-expanded", "true");
});

test("M-06: Copy link in a version's menu copies the version's address", async ({ board }) => {
  const page = await board.open("jordan_w");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const options = card(page, LEAD).getByRole("button", { name: "Options for this version" });

  await options.click();
  await expect(page.getByRole("menu", { name: "Version options" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Copy link" })).toBeFocused();
  await page.getByRole("menuitem", { name: "Copy link" }).click();

  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator("#sm-status")).toHaveText("Link copied.");
  await expect(options).toBeFocused();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(await versionLink(board, LEAD), page.url()).href);
  // Copying doesn't open the version, so the address stays the board's.
  expect(path(page)).toBe(`/b/${board.demo.board}`);
});

test("M-06, M-04: Escape closes a version's menu and puts the cursor back on ⋯, and so does a click elsewhere", async ({ board }) => {
  const page = await board.open("jordan_w");
  const options = card(page, LEAD).getByRole("button", { name: "Options for this version" });

  await options.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(options).toBeFocused();

  await options.click();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);

  // Tab leaves the menu and closes it, going on from ⋯ to the card's wording.
  await options.click();
  await expect(page.getByRole("menuitem", { name: "Copy link" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(claim(page, LEAD)).toBeFocused();
});

test("M-06: a link to a deleted version opens the board, says so, and gives the address back to the board", async ({ board }) => {
  const page = await board.open("jordan_w");
  const link = await versionLink(board, SECOND);
  await board.api("omar_h").delete(`versions/${(await find(board, SECOND)).version}`);

  await page.goto(link);

  const note = page.locator(".sm-link-note");
  await expect(note).toHaveText(/That version was deleted\./);
  await expect(note).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  await expect(note.getByRole("button", { name: "Dismiss" })).toBeFocused();
  expect(path(page)).toBe(`/b/${board.demo.board}`);

  await expect(page.locator("#sm-status")).toHaveText(`That version was deleted. Opened “${QUESTION}”.`);

  await note.getByRole("button", { name: "Dismiss" }).click();
  await expect(note).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
});

test("M-06: a link to a version that was never on the board says the same", async ({ board }) => {
  const page = await board.open("jordan_w");

  await page.goto(`/b/${board.demo.board}/v/nosuchversion0000000`);

  await expect(page.locator(".sm-link-note")).toHaveText(/That version was deleted\./);
  expect(path(page)).toBe(`/b/${board.demo.board}`);
});

test("M-06: a link to a board that doesn't exist says so, and leads to New steelman", async ({ board }) => {
  const page = await board.open("jordan_w", { missingBoards: true });

  for (const address of ["/b/nosuchboard1", "/b/nosuchboard1/v/x", "/b/x/y/z"]) {
    await page.goto(address);
    await expect(page.getByRole("heading", { level: 1 }), address).toHaveText("This steelman doesn’t exist");
  }
  await page.getByRole("link", { name: "New steelman" }).last().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New steelman");
});

for (const size of SIZES) {
  test(`M-04, M-06: a version's open menu, the deleted-version note, and the missing board pass an accessibility scan at ${size.name} width`, async ({ board }) => {
    const page = await board.open("jordan_w", { width: size.width, missingBoards: true });
    await card(page, LEAD).getByRole("button", { name: "Options for this version" }).click();
    await expectNoAxeViolations(page);

    await page.goto(`/b/${board.demo.board}/v/nosuchversion0000000`);
    await expect(page.locator(".sm-link-note")).toBeVisible();
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);

    await page.goto("/b/nosuchboard1");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This steelman doesn’t exist");
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
  });
}

siteTest("M-06, L-01: signed out, a version's link to a board only invited people can open signs in first, shows nothing, then opens the version", async ({ site }) => {
  // Sam signs in once, so they have an account and a username; then the owner makes the board invited only, with Sam invited.
  const first = await site.browse();
  await first.goto(site.boardPath);
  await signInWithCode(site, first, "sam.member@example.test");
  await first.getByLabel("Username").fill("sam_member");
  await first.getByRole("button", { name: "Continue" }).click();
  await expect(first.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  await row(first, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  const version = await card(first, SECOND).getAttribute("data-card");
  await site.sql("update board_member set joined_via = 'invite' where board_id = $1 and account_id = (select id from account where username = 'sam_member')", [site.demo.board]);
  await site.sql("update board set general_access = 'invited' where id = $1", [site.demo.board]);
  const link = `${site.boardPath}/v/${version}`;

  const page = await site.browse();
  await watchRings(page);
  const asked: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/boards")) asked.push(request.url());
  });
  await page.goto(link);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  await expect(page.getByText(QUESTION)).toHaveCount(0);
  await expect(page.getByText(SECOND)).toHaveCount(0);
  expect(asked).toEqual([]);

  await signInWithCode(site, page, "sam.member@example.test");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  expect(path(page)).toBe(link);
  await expect(claim(page, SECOND)).toHaveAttribute("aria-expanded", "true");
  expect(await rang(page, SECOND)).toBe(true);
});

/** Signs in by email code on the page as it is, without going anywhere first. */
async function signInWithCode(site: { codeFor(email: string): string }, page: Page, email: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your email");
  await page.getByLabel("Code").fill(site.codeFor(email));
  await page.getByRole("button", { name: "Sign in" }).click();
}
