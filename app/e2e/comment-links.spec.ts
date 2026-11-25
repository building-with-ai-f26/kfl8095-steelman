// Links to a comment (M3b-13, D-01, M-06): /b/<board>/c/<comment>, beside the
// version's address. Each comment's "Link" sits between Resolve and Delete, as
// in the prototype (steelman-refined.html, commentItem), copies the address,
// and says "Link copied." Opening one shows the wording or the option the
// thread is on, opens Comments on its thread, unfolds resolved threads when
// it is resolved, rings the comment, and puts the focus on it, as the
// prototype's openLink does. The address keeps the comment while its panel is
// open and gives it back to the board when the panel closes. A deleted or
// unknown comment, and one whose subject is gone, open the board with a note.
// links.spec.ts, which covers the board's and the version's addresses, is left
// as it was; its local helpers are copied here, not imported.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { find, row, status } from "./support/screen.ts";
import { QUESTION, signInByCode, test as siteTest } from "./support/sign-in.ts";
import type { SignInSite } from "./support/sign-in.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const SECOND = "Shift workers can only come on Sundays.";
// The No column's first row: led by omar_h's wording, with jordan_w's second.
const DAY_OFF = "Staff need a guaranteed day off.";
const SATURDAYS = "Library staff already work Saturdays, so Sunday would leave them no weekend.";
const TEXT = "Which survey is this from?";

const panel = (page: Page) => page.getByRole("dialog", { name: "Comments" });
const comment = (page: Page, by: string, text: string): Locator => panel(page).getByRole("article", { name: `Comment by ${by}` }).filter({ hasText: text });
const action = (item: Locator, name: string): Locator => item.locator(".sm-comment-actions").getByRole("button", { name, exact: true });
const toggle = (page: Page) => panel(page).getByRole("button", { name: /^\d+ resolved$/ });
const questionBubble = (page: Page) => page.locator(".sm-head").getByRole("button", { name: /comments? on this question$/i });
const card = (page: Page, wording: string): Locator => page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
const claim = (page: Page, wording: string): Locator => card(page, wording).getByRole("button", { name: wording });
const note = (page: Page) => page.locator(".sm-link-note");
const path = (page: Page) => new URL(page.url()).pathname;

type Person = Parameters<TestBoard["api"]>[0];

/** A comment through the API, as this person, on the question unless a target is given. Answers its ID. */
async function commentOn(board: TestBoard, as: Person, target: { versionId?: string; optionId?: string; parentId?: string } = {}, body = TEXT): Promise<string> {
  const id = board.ids.itemId();
  await board.api(as).post("comments", { id, body, ...target });
  return id;
}

const linkTo = (board: string, comment: string) => `/b/${board}/c/${comment}`;

/**
 * Records each card and each comment that rings, as it rings: the ring lasts
 * 1.4 s, which a slow run could miss if a test only looked for it afterwards.
 * Copied from links.spec.ts, which can't be changed, and taught comments.
 */
async function watchRings(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const rung: string[] = ((window as unknown as { rung: string[] }).rung = []);
    const note = (element: Element) => {
      for (const ringed of [element, ...element.querySelectorAll(".sm-arrived")]) {
        if (!(ringed instanceof HTMLElement) || !ringed.classList.contains("sm-arrived")) continue;
        if (ringed.dataset.card) rung.push(`card:${ringed.dataset.card}`);
        if (ringed.dataset.comment) rung.push(`comment:${ringed.dataset.comment}`);
      }
    };
    new MutationObserver((changes) => {
      for (const change of changes) {
        if (change.type === "attributes" && change.target instanceof Element) note(change.target);
        for (const added of change.addedNodes) if (added instanceof Element) note(added);
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
  });
}

/** Whether a comment, or a card, rang: when it first drew with its ring, or since. */
async function rang(page: Page, what: `comment:${string}` | `card:${string}`): Promise<boolean> {
  return page.evaluate((what) => (window as unknown as { rung: string[] }).rung.includes(what), what);
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

for (const width of [1280, 375]) {
  test(`D-01, M-06: at ${width} px, a comment's Link copies its address and says "Link copied.", with the cursor kept on Link and the address unchanged`, async ({ board }) => {
    const id = await commentOn(board, "omar_h");
    const page = await board.open("jordan_w", { width });
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await questionBubble(page).click();

    const link = action(comment(page, "omar_h", TEXT), "Link");
    await link.click();

    await expect(status(page)).toHaveText("Link copied.");
    await expect(link).toBeFocused();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(linkTo(board.demo.board, id), page.url()).href);
    // Copying opens nothing new, so the address stays the board's.
    await expect.poll(() => path(page)).toBe(`/b/${board.demo.board}`);
  });

  test(`D-01, M-06: at ${width} px, a link to a comment on a wording unfolds its row without opening it, opens the thread's panel, and rings and focuses the comment`, async ({ board }) => {
    const { version } = await find(board, SECOND);
    const id = await commentOn(board, "omar_h", { versionId: version });
    const page = await board.open("jordan_w", { width });
    await watchRings(page);

    await page.goto(linkTo(board.demo.board, id));

    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator(".sm-comment-target")).toContainText(SECOND);
    await expect(comment(page, "omar_h", TEXT)).toBeFocused();
    expect(await rang(page, `comment:${id}`)).toBe(true);
    await expect(row(page, LEAD).getByRole("region", { name: "Versions, best articulated first" })).toBeAttached();
    await expect(claim(page, SECOND)).toHaveAttribute("aria-expanded", "false");
    expect(await rang(page, `card:${version}`)).toBe(true);
    if (width === 1280) await expect(card(page, SECOND)).toBeInViewport();
    await expect(status(page)).toHaveText(`Opened “${QUESTION}”.`);
    await expect.poll(() => path(page)).toBe(linkTo(board.demo.board, id));
  });

  test(`D-01, M-06: at ${width} px, a link to a comment on a wording in the No column, not its row's lead, shows that column, unfolds the row, and rings the card`, async ({ board }) => {
    const { version } = await find(board, SATURDAYS);
    const id = await commentOn(board, "omar_h", { versionId: version });
    const page = await board.open("jordan_w", { width });
    await watchRings(page);

    await page.goto(linkTo(board.demo.board, id));

    await expect(panel(page).locator(".sm-comment-target")).toContainText(SATURDAYS);
    await expect(comment(page, "omar_h", TEXT)).toBeFocused();
    expect(await rang(page, `comment:${id}`)).toBe(true);
    if (width === 375) await expect(page.getByRole("tab", { name: /^No/ })).toHaveAttribute("aria-selected", "true");
    await expect(row(page, DAY_OFF).getByRole("region", { name: "Versions, best articulated first" })).toBeAttached();
    await expect(claim(page, SATURDAYS)).toHaveAttribute("aria-expanded", "false");
    expect(await rang(page, `card:${version}`)).toBe(true);
    if (width === 1280) await expect(card(page, SATURDAYS)).toBeInViewport();
    await expect.poll(() => path(page)).toBe(linkTo(board.demo.board, id));
  });

  test(`D-01, M-06: at ${width} px, a link to a comment on an option shows that option's column and opens its panel on the comment`, async ({ board }) => {
    const id = await commentOn(board, "omar_h", { optionId: board.demo.options.no });
    const page = await board.open("jordan_w", { width });
    await watchRings(page);

    await page.goto(linkTo(board.demo.board, id));

    await expect(panel(page).locator(".sm-comment-target")).toContainText("Option");
    await expect(comment(page, "omar_h", TEXT)).toBeFocused();
    expect(await rang(page, `comment:${id}`)).toBe(true);
    if (width === 375) await expect(page.getByRole("tab", { name: /^No/ })).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => path(page)).toBe(linkTo(board.demo.board, id));
  });

  test(`D-01, M-06: at ${width} px, a link to a reply on the question opens the question's panel and rings and focuses the reply`, async ({ board }) => {
    const first = await commentOn(board, "omar_h");
    const reply = await commentOn(board, "lin.zhao", { parentId: first }, "The city's survey, from last spring.");
    const page = await board.open("jordan_w", { width });
    await watchRings(page);

    await page.goto(linkTo(board.demo.board, reply));

    await expect(panel(page).locator(".sm-comment-target")).toContainText(QUESTION);
    const item = comment(page, "lin.zhao", "The city's survey");
    await expect(item).toBeFocused();
    await expect(item).toBeInViewport();
    expect(await rang(page, `comment:${reply}`)).toBe(true);
    expect(await rang(page, `comment:${first}`)).toBe(false);
    await expect.poll(() => path(page)).toBe(linkTo(board.demo.board, reply));
  });

  test(`D-01, M-06: at ${width} px, a reload lands on the same comment, closing the panel gives the address back to the board, and Back leaves the board`, async ({ board }) => {
    const id = await commentOn(board, "omar_h");
    const page = await board.open("jordan_w", { width });
    await page.goto("/new");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("New steelman");
    await page.goto(linkTo(board.demo.board, id));
    await expect(comment(page, "omar_h", TEXT)).toBeFocused();

    await page.reload();
    await expect(comment(page, "omar_h", TEXT)).toBeFocused();
    await expect.poll(() => path(page)).toBe(linkTo(board.demo.board, id));

    await panel(page).getByRole("button", { name: "Close comments" }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect.poll(() => path(page)).toBe(`/b/${board.demo.board}`);
    // Opening the same panel again by its bubble doesn't bring the comment's address back.
    await questionBubble(page).click();
    await expect(panel(page)).toBeVisible();
    await expect.poll(() => path(page)).toBe(`/b/${board.demo.board}`);

    await page.goBack();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("New steelman");
    await expect.poll(() => path(page)).toBe("/new");
  });

  test(`D-01, M-06: at ${width} px, a link to a comment in a resolved thread shows the resolved threads with the comment focused`, async ({ board }) => {
    const id = await commentOn(board, "omar_h");
    await board.api("tess.b").put(`comments/${id}/resolved`, {});
    const page = await board.open("jordan_w", { width });

    await page.goto(linkTo(board.demo.board, id));

    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    const item = comment(page, "omar_h", TEXT);
    await expect(item).toBeVisible();
    await expect(item).toBeFocused();
    await expect(action(item, "Reopen")).toBeVisible();
  });

  test(`D-01, M-06: at ${width} px, a deleted comment's link opens the board with "That comment was deleted." and the cursor on Dismiss`, async ({ board }) => {
    const id = await commentOn(board, "jordan_w");
    await board.api("jordan_w").delete(`comments/${id}`);
    const page = await board.open("jordan_w", { width });

    await page.goto(linkTo(board.demo.board, id));

    await expect(note(page)).toHaveText(/That comment was deleted\./);
    await expect(note(page).getByRole("button", { name: "Dismiss" })).toBeFocused();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    await expect(panel(page)).toHaveCount(0);
    await expect(status(page)).toHaveText(`That comment was deleted. Opened “${QUESTION}”.`);
    await expect.poll(() => path(page)).toBe(`/b/${board.demo.board}`);

    await note(page).getByRole("button", { name: "Dismiss" }).click();
    await expect(note(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  });

  test(`D-01, M-06: at ${width} px, a link to a comment whose wording was deleted opens the board with "That comment’s subject was removed." and the cursor on Dismiss`, async ({ board }) => {
    const { version } = await find(board, SECOND);
    const id = await commentOn(board, "lin.zhao", { versionId: version });
    await board.api("omar_h").delete(`versions/${version}`);
    const page = await board.open("jordan_w", { width });

    await page.goto(linkTo(board.demo.board, id));

    await expect(note(page)).toHaveText(/That comment’s subject was removed\./);
    await expect(note(page).getByRole("button", { name: "Dismiss" })).toBeFocused();
    await expect(panel(page)).toHaveCount(0);
    await expect(status(page)).toHaveText(`That comment’s subject was removed. Opened “${QUESTION}”.`);
    await expect.poll(() => path(page)).toBe(`/b/${board.demo.board}`);
  });

  test(`D-01, M-04, M-06: at ${width} px, the board passes an accessibility scan after arriving by a comment's link, and by a deleted one's, with no sideways scroll`, async ({ board }) => {
    const { version } = await find(board, SECOND);
    const id = await commentOn(board, "omar_h", { versionId: version });
    const page = await board.open("jordan_w", { width });

    await page.goto(linkTo(board.demo.board, id));
    await expect(comment(page, "omar_h", TEXT)).toBeFocused();
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll").toBe(true);

    await page.goto(linkTo(board.demo.board, board.ids.itemId()));
    await expect(note(page)).toHaveText(/That comment was deleted\./);
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll").toBe(true);
  });
}

test("D-01, M-06: a link to a comment that was never on the board says it was deleted", async ({ board }) => {
  const page = await board.open("jordan_w");

  await page.goto(linkTo(board.demo.board, board.ids.itemId()));

  await expect(note(page)).toHaveText(/That comment was deleted\./);
  await expect.poll(() => path(page)).toBe(`/b/${board.demo.board}`);
});

test("D-01, M-06: Link is on every standing comment, replies and resolved threads too, and never on a deleted one", async ({ board }) => {
  const first = await commentOn(board, "jordan_w");
  await commentOn(board, "omar_h", { parentId: first }, "The city's survey, from last spring.");
  const resolved = await commentOn(board, "lin.zhao", {}, "Who would staff it?");
  await board.api("tess.b").put(`comments/${resolved}/resolved`, {});
  const page = await board.open("jordan_w");
  await questionBubble(page).click();
  await toggle(page).click();

  const names = (item: Locator) => item.locator(".sm-comment-actions").getByRole("button").allInnerTexts();
  expect(await names(comment(page, "You", TEXT))).toEqual(["Reply", "Resolve", "Link", "Delete"]);
  expect(await names(comment(page, "omar_h", "The city's survey"))).toEqual(["Link"]);
  expect(await names(comment(page, "lin.zhao", "Who would staff it?"))).toEqual(["Reopen", "Link"]);

  await action(comment(page, "You", TEXT), "Delete").click();
  await panel(page).getByRole("group", { name: "Delete this comment?" }).getByRole("button", { name: "Delete" }).click();
  await expect(panel(page).getByRole("article", { name: "Deleted comment" }).getByRole("button")).toHaveCount(0);
});

test("D-01, M-06: closing a linked panel by Escape returns the address to the board, and a version's address still follows the open card", async ({ board }) => {
  const id = await commentOn(board, "omar_h");
  const page = await board.open("jordan_w");
  await page.goto(linkTo(board.demo.board, id));
  await expect(comment(page, "omar_h", TEXT)).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect.poll(() => path(page)).toBe(`/b/${board.demo.board}`);

  await claim(page, LEAD).click();
  await expect.poll(() => path(page)).toBe(`/b/${board.demo.board}/v/${(await find(board, LEAD)).version}`);
});

test("D-01, M-06: opening another subject's comments while a linked panel is open gives the address back to the board", async ({ board }) => {
  const id = await commentOn(board, "omar_h", { optionId: board.demo.options.no });
  const page = await board.open("jordan_w");
  await page.goto(linkTo(board.demo.board, id));
  await expect(comment(page, "omar_h", TEXT)).toBeFocused();

  await questionBubble(page).click();
  await expect(panel(page).locator(".sm-comment-target")).toContainText(QUESTION);
  await expect.poll(() => path(page)).toBe(`/b/${board.demo.board}`);
});

test.describe("in New York's time zone", () => {
  // Comment times show in the reader's zone, so the screenshots pin it, as comments.spec does.
  test.use({ timezoneId: "America/New_York" });

  for (const width of [1280, 375]) {
    test(`D-01, M-06: at ${width} px, the panel draws a Contributor's own comment with Reply, Resolve, Link, and Delete, and another's reply with Link`, async ({ board }) => {
      const first = await commentOn(board, "jordan_w", {}, "Do other libraries open on Sundays?");
      await commentOn(board, "omar_h", { parentId: first }, "Two of the four in the county do.");
      const page = await board.open("jordan_w", { width });
      await questionBubble(page).click();
      await expect(action(comment(page, "You", "Sundays"), "Link")).toBeVisible();

      await expect(panel(page)).toHaveScreenshot(`comment-links-panel-${width}.png`);
    });
  }
});

/** Only invited people can open the demo board from here on, with Sam among them. No screen invites anyone yet, so it's set in the database. */
async function inviteOnly(site: SignInSite, member?: string): Promise<void> {
  if (member) await site.sql("update board_member set joined_via = 'invite' where board_id = $1 and account_id = (select id from account where username = $2)", [site.demo.board, member]);
  await site.sql("update board set general_access = 'invited' where id = $1", [site.demo.board]);
}

/** Signs in by email code on the page as it is, without going anywhere first. */
async function signInHere(site: SignInSite, page: Page, email: string, username?: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your email");
  await page.getByLabel("Code").fill(site.codeFor(email));
  await page.getByRole("button", { name: "Sign in" }).click();
  if (username !== undefined) {
    await page.getByLabel("Username").fill(username);
    await page.getByRole("button", { name: "Continue" }).click();
  }
}

/** Sam signs in by the board's link, comments on the question, and answers the comment's ID. */
async function samComments(site: SignInSite): Promise<string> {
  const page = await site.browse();
  await signInByCode(site, page, "sam.member@example.test", "sam_member");
  await questionBubble(page).click();
  await panel(page).getByRole("textbox", { name: "Add a comment on this question" }).fill(TEXT);
  await panel(page).getByRole("button", { name: "Comment", exact: true }).click();
  const item = comment(page, "You", TEXT);
  await expect(item).toBeVisible();
  const id = await item.getAttribute("data-comment");
  await page.context().close();
  return id!;
}

siteTest("D-01, M-06, H-02: a comment's link to a board the person can't open shows the no-access card", async ({ site }) => {
  const id = await samComments(site);
  await inviteOnly(site, "sam_member");
  const link = `${site.boardPath}/c/${id}`;
  const page = await site.browse();

  await page.goto(link);
  await signInHere(site, page, "lee.visitor@example.test", "lee_visitor");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You need access");
  await expect(page.getByRole("region", { name: "No access" })).toBeVisible();
  await expect(page.getByText(QUESTION)).toHaveCount(0);
  await expect(page.getByText(TEXT)).toHaveCount(0);
  await expect.poll(() => path(page)).toBe(link);
});

siteTest("D-01, M-06, L-01: signed out, a comment's link to a board only invited people can open signs in first, shows nothing, then opens the comment", async ({ site }) => {
  const id = await samComments(site);
  await inviteOnly(site, "sam_member");
  const link = `${site.boardPath}/c/${id}`;
  const page = await site.browse();
  const asked: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/boards")) asked.push(request.url());
  });

  await page.goto(link);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  await expect(page.getByText(QUESTION)).toHaveCount(0);
  await expect(page.getByText(TEXT)).toHaveCount(0);
  expect(asked).toEqual([]);

  await signInHere(site, page, "sam.member@example.test");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  await expect(comment(page, "You", TEXT)).toBeFocused();
  await expect.poll(() => path(page)).toBe(link);
});
