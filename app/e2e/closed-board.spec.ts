// The closed board for readers (M3b-5, I-05). On a closed board every control
// the service would refuse fades and says "This board is closed." on hover,
// focus, or a tap, as role-blocked controls do; reading, History, and Copy
// link stay usable. A pill beside the sharing pill says when it closed, or
// when it closes, in the reader's own time zone. Boards close through the API
// and the service's clock moves with `board.clock`.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { find, poll, status } from "./support/screen.ts";

test.use({ timezoneId: "America/New_York" });

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const CLOSED = "This board is closed.";
const HOUR = 3_600_000;

const card = (page: Page, wording: string): Locator => page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
const row = (page: Page, wording: string): Locator => page.locator(".sm-idea").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
const evidence = (page: Page, wording: string): Locator => card(page, wording).getByRole("region", { name: "Evidence and its assessment" });
const closingPill = (page: Page): Locator => page.locator(".sm-head .sm-closing-pill");

/** Every request this page sends that would change something. */
function writesSent(page: Page): string[] {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && new URL(request.url()).pathname.startsWith("/api/boards/")) sent.push(`${request.method()} ${request.url()}`);
  });
  return sent;
}

async function citeSource(board: TestBoard): Promise<void> {
  const { version } = await find(board, LEAD);
  await board.api("maya.chen").post(`versions/${version}/sources`, {
    id: board.ids.itemId(),
    name: "Shift work survey, 2024",
    locator: "https://example.org/shift-work",
    finding: "Four in ten shift workers have Sunday as their only day off.",
    backsUp: "",
    limits: "",
  });
}

async function openLead(page: Page): Promise<void> {
  await card(page, LEAD).getByRole("button", { name: LEAD }).click();
  await expect(evidence(page, LEAD)).toBeVisible();
}

function controls(page: Page) {
  return {
    importance: row(page, LEAD).getByRole("button", { name: "More important if true" }),
    addArgument: page.getByRole("button", { name: "Add an argument for Yes" }),
    addSource: evidence(page, LEAD).getByRole("button", { name: "Add a source" }),
    yes: evidence(page, LEAD).getByRole("button", { name: "Yes", exact: true }),
  };
}

async function expectClosed(control: Locator): Promise<void> {
  await expect(control).toHaveAttribute("aria-disabled", "true");
  await expect(control).toHaveAttribute("data-tooltip", CLOSED);
  await expect(control).toHaveAccessibleDescription(CLOSED);
}

async function expectOpen(control: Locator): Promise<void> {
  await expect(control).toBeVisible();
  await expect(control).not.toHaveAttribute("aria-disabled", "true");
}

const close = (board: TestBoard) => board.api("maya.chen").put("closed", {});
const reopen = (board: TestBoard) => board.api("maya.chen").delete("closed");

test("I-05: a Contributor on a closed board sees the pill and every control faded with the sentence, and can still read, open History, and copy a link", async ({ board }) => {
  await citeSource(board);
  await close(board);
  const page = await board.open("tess.b");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const sent = writesSent(page);

  // Closed at noon UTC on Nov 16, which is 7 AM in New York.
  await expect(closingPill(page)).toHaveText("Closed Nov 16");
  await openLead(page);
  const c = controls(page);
  for (const control of [c.importance, c.addArgument, c.addSource, c.yes]) await expectClosed(control);
  for (const control of [c.importance, c.addArgument, c.yes]) await control.click({ force: true });
  await expect(page.getByRole("form")).toHaveCount(0);
  expect(sent).toEqual([]);

  // The card's menu keeps Copy link and nothing that writes.
  await card(page, LEAD).getByRole("button", { name: "Options for this version" }).click();
  await expect(page.getByRole("menuitem")).toHaveText([/Copy link/]);
  await page.getByRole("menuitem", { name: /Copy link/ }).click();
  const { version } = await find(board, LEAD);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(version);

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("dialog", { name: "History" })).toContainText("maya.chen closed the board.");
});

test("I-05, H-02: on a closed board the Owner's Share controls are faded with the sentence, and Copy link works", async ({ board }) => {
  await close(board);
  const page = await board.open("maya.chen");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const sent = writesSent(page);

  await page.getByRole("button", { name: "Anyone with the link" }).click();
  // The panel rises into place; the browser's clock is the test's, so let it play.
  await page.clock.runFor(500);
  for (const name of ["General access", "Link role"]) await expectClosed(page.getByRole("combobox", { name }));
  // From the keyboard a faded setting takes the focus and says why, but doesn't change, and Tab moves on.
  const general = page.getByRole("combobox", { name: "General access" });
  await general.focus();
  await page.keyboard.press("ArrowDown");
  await expect(general).toHaveValue("link");
  await page.keyboard.press("Tab");
  await expect(general).not.toBeFocused();
  await page.getByRole("button", { name: "Copy link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(`/b/${board.demo.board}`, page.url()).href);
  expect(sent).toEqual([]);
});

test("I-05, I-01: on a closed board the Owner's question field in Settings is read only and says why, and a question being typed when it closes goes back", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.locator(".sm-head").getByRole("button", { name: "Settings" }).click();
  const field = page.getByRole("dialog", { name: "Settings" }).getByRole("textbox", { name: "Question" });
  await field.fill("Should the library open on Sunday afternoons?");

  await close(board);
  await poll(page);

  await expect(field).toHaveValue("Should our library open on Sundays?");
  await expect(field).not.toBeEditable();
  await expect(field).toHaveAttribute("data-tooltip", CLOSED);
  await expect(field).toHaveAccessibleDescription(/This board is closed\./);
  await field.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should our library open on Sundays?");
});

test("I-05, H-02: at 375 px with touch, a tap on the Owner's faded General access changes nothing", async ({ board }) => {
  await close(board);
  const page = await board.open("maya.chen", { width: 375, touch: true });
  const sent = writesSent(page);
  await page.getByRole("button", { name: "Anyone with the link" }).tap();
  await page.clock.runFor(500);
  const general = page.getByRole("combobox", { name: "General access" });

  await general.tap({ force: true });

  await expect(general).toHaveValue("link");
  await expect(general).toHaveAttribute("data-tooltip", CLOSED);
  expect(sent).toEqual([]);
});

test("I-05: a second reader's controls fade on their next poll after a close, the status line says so once, and a reopen brings them back without a reload", async ({ board }) => {
  const page = await board.open("tess.b");
  const importance = row(page, LEAD).getByRole("button", { name: "More important if true" });
  await expectOpen(importance);

  await close(board);
  await poll(page);
  await expectClosed(importance);
  await expect(status(page)).toHaveText(CLOSED);
  await expect(closingPill(page)).toHaveText("Closed Nov 16");
  await page.evaluate(() => {
    (window as unknown as { said: string[] }).said = [];
    new MutationObserver(() => (window as unknown as { said: string[] }).said.push(document.querySelector("#sm-status")?.textContent ?? "")).observe(document.querySelector("#sm-status")!, { childList: true, characterData: true, subtree: true });
  });
  await poll(page);
  expect(await page.evaluate(() => (window as unknown as { said: string[] }).said)).not.toContain(CLOSED);

  await reopen(board);
  await poll(page);
  await expectOpen(importance);
  await expect(closingPill(page)).toHaveCount(0);
  await expect(status(page)).toHaveText("This board is open again.");
});

test("I-05: with a closing time the pill says when; once the service's clock passes it, both readers see the board closed, with nothing sent", async ({ board }) => {
  // An hour after noon UTC on Nov 16 is 8 AM in New York.
  await board.api("maya.chen").put("closing", { closesAt: new Date(board.clock.now().getTime() + HOUR).toISOString() });
  const owner = await board.open("maya.chen");
  const other = await board.open("tess.b");
  const sent = [...writesSent(owner), ...writesSent(other)];
  for (const page of [owner, other]) await expect(closingPill(page)).toHaveText("Closes Nov 16 at 8 AM EST");

  board.clock.advance(HOUR);
  for (const page of [owner, other]) {
    await poll(page);
    await expect(closingPill(page)).toHaveText("Closed Nov 16");
    await expectClosed(row(page, LEAD).getByRole("button", { name: "More important if true" }));
  }
  expect(sent).toEqual([]);
});

test("I-05, M-02: a vote and a wording made offline are refused on reconnecting with the closed-board sentence", async ({ board }) => {
  const page = await board.open("tess.b");
  await page.context().setOffline(true);
  await row(page, LEAD).getByRole("button", { name: "More important if true" }).click();
  await page.getByRole("button", { name: "Add an argument for No" }).click();
  await page.getByRole("textbox", { name: "Your argument", exact: true }).fill("Libraries are quieter on Sundays.");
  await page.getByRole("button", { name: "Add your argument" }).click();
  await expect(page.locator(".sm-fresh")).toHaveText("Offline · 2 waiting to send");

  await close(board);
  await page.context().setOffline(false);

  await expect(page.locator(".sm-problem")).toContainText("This board closed while you were away.");
  await expect(row(page, LEAD).getByRole("button", { name: "More important if true" })).toHaveAttribute("aria-disabled", "true");
  expect(board.errors.splice(0).every((error) => error.includes("409 (Conflict)"))).toBe(true);
});

test("I-05, E-03: the list marks the closed board, and only that one", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.getByRole("link", { name: "New steelman" }).first().click();
  await page.getByRole("textbox", { name: "Question" }).fill("Should the library lend laptops?");
  await page.getByRole("textbox", { name: "Option 1" }).fill("Lend them");
  await page.getByRole("textbox", { name: "Option 2" }).fill("Don’t lend them");
  await page.getByRole("button", { name: "Create steelman" }).click();
  await expect(page).toHaveURL(/\/b\//);
  await close(board);

  await page.goto("/");
  const closedOne = page.locator(".sm-post").filter({ hasText: "Should our library open on Sundays?" });
  const openOne = page.locator(".sm-post").filter({ hasText: "Should the library lend laptops?" });
  await expect(closedOne.locator(".sm-post-closed")).toHaveText("Closed");
  await expect(openOne.locator(".sm-post-closed")).toHaveCount(0);
});

test("I-05: at 375 px with touch, the pill's time is in its text; from the keyboard, the Owner's pill is a button that says it and opens Settings", async ({ board }) => {
  await board.api("maya.chen").put("closing", { closesAt: new Date(board.clock.now().getTime() + HOUR).toISOString() });
  const phone = await board.open("tess.b", { width: 375, touch: true });
  await expect(closingPill(phone)).toHaveText("Closes Nov 16 at 8 AM EST");
  const box = (await closingPill(phone).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  await expect(closingPill(phone).getByRole("button")).toHaveCount(0);

  const owner = await board.open("maya.chen");
  const pill = owner.getByRole("button", { name: "Closes Nov 16 at 8 AM EST" });
  for (let presses = 0; presses < 60 && !(await pill.evaluate((element) => element === document.activeElement)); presses++) await owner.keyboard.press("Tab");
  await expect(pill).toBeFocused();
  await owner.keyboard.press("Enter");
  await expect(owner.getByRole("dialog", { name: "Settings" })).toBeVisible();
});

test("I-05: at 375 px the Owner's header with both pills, History, and Settings has nothing overlapping and no sideways scroll", async ({ board }) => {
  await board.api("maya.chen").put("closing", { closesAt: new Date(board.clock.now().getTime() + HOUR).toISOString() });
  const page = await board.open("maya.chen", { width: 375 });
  const parts = [page.locator(".sm-head .sm-meta-vis .sm-meta-pill"), closingPill(page), page.getByRole("button", { name: "History" }), page.locator(".sm-head").getByRole("button", { name: "Settings" })];
  const boxes = await Promise.all(parts.map(async (part) => (await part.boundingBox())!));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i]!, boxes[j]!];
      const overlap = a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
      expect(overlap, `parts ${i} and ${j} overlap`).toBe(false);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("I-05, M-04: the Owner's closed board with Share open passes an accessibility scan", async ({ board }) => {
  await close(board);
  const page = await board.open("maya.chen");
  await page.getByRole("button", { name: "Anyone with the link" }).click();
  await page.clock.runFor(500);

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

for (const width of [1280, 375]) {
  test(`I-05, M-04: a closed board passes an accessibility scan at ${width} px`, async ({ board }) => {
    await close(board);
    const page = await board.open("tess.b", { width });
    await expect(closingPill(page)).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}
