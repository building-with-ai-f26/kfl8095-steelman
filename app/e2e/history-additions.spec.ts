// History lists new arguments and wordings (J-03; the builder, Nov 22, 2026),
// as Google Drive's Activity panel lists "created an item" and GitHub's
// timeline "added" beside its edits (both from memory, not read live). Each
// reads as a sentence: who added what, with the wording linked as History
// links any wording. A wording the reader can't see (hidden, to anyone but an
// Editor or the Owner) or that's gone (deleted) is "a wording" or "an
// argument", so History shows no words the board doesn't. An edit of a
// source's link that cleared its "can't be opened" report says so.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { find, poll, short } from "./support/screen.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const STAFF = "Staff need a guaranteed day off.";
const SATURDAYS = "Library staff already work Saturdays, so Sunday would leave them no weekend.";
const CAFE = "The café could open on Sundays too.";
const QUIET = "Sunday is the quietest day to read";
const SURVEY = { name: "Shift work survey, 2024", locator: "https://example.org/shift-work", finding: "Four in ten shift workers have Sunday as their only day off.", backsUp: "", limits: "" };

const panel = (page: Page) => page.getByRole("dialog", { name: "History" });
const entries = (page: Page) => panel(page).getByRole("listitem");
const entry = (page: Page, text: string | RegExp): Locator => entries(page).filter({ hasText: text });
/** The entries that say exactly this. */
const saying = (page: Page, sentence: string): Locator => panel(page).getByText(sentence, { exact: true });

async function openHistory(page: Page): Promise<void> {
  await page.getByRole("button", { name: "History" }).click();
  await expect(panel(page)).toBeVisible();
}

/** Adds an argument through the API, and answers its first wording's ID. */
async function addArgument(board: TestBoard, as: "tess.b" | "lin.zhao", wording: string): Promise<string> {
  const version = board.ids.itemId();
  await board.api(as).post("arguments", { id: board.ids.itemId(), optionId: board.demo.options.yes, versionId: version, wording, context: "" });
  return version;
}

test("J-03, A-03, M-06: History says who added an argument, and its link opens the argument on the board", async ({ board }) => {
  const version = await addArgument(board, "tess.b", CAFE);
  const page = await board.open("lin.zhao");
  await openHistory(page);

  // The wording ends its own sentence, so the entry adds no second full stop.
  await expect(entries(page).nth(0).locator("p")).toHaveText(`tess.b added the argument “${CAFE}”`);
  await entries(page).nth(0).getByRole("link", { name: `“${CAFE}”` }).click();

  const card = page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: CAFE }) });
  await expect(card.getByRole("region", { name: "Evidence and its assessment" })).toBeVisible();
  expect(page.url()).toContain(version);
});

test("J-03, A-05: History says who added a wording to an argument, and lists what the board began with", async ({ board }) => {
  const { argument } = await find(board, LEAD);
  await board.api("jordan_w").post(`arguments/${argument}/versions`, { id: board.ids.itemId(), wording: QUIET, context: "" });
  const page = await board.open("tess.b");
  await openHistory(page);

  await expect(entries(page).nth(0).locator("p")).toHaveText(`jordan_w added the wording “${QUIET}”.`);
  await expect(saying(page, `maya.chen added the argument “${short(LEAD)}”`)).toHaveCount(1);
  await expect(saying(page, "omar_h added the wording “Shift workers can only come on Sundays.”")).toHaveCount(1);
  // The demo board has six arguments and eight wordings.
  await expect(entry(page, "added the argument")).toHaveCount(6);
  await expect(entry(page, "added the wording")).toHaveCount(3);
});

test("J-03, J-02: a hidden wording's addition names it for the Owner, and not for a Contributor", async ({ board }) => {
  const staff = await find(board, STAFF);
  const saturdays = await find(board, SATURDAYS);
  await board.api("maya.chen").put(`versions/${staff.version}/hidden`, { reason: "offtopic" });
  await board.api("maya.chen").put(`versions/${saturdays.version}/hidden`, { reason: "offtopic" });

  const contributor = await board.open("tess.b");
  await openHistory(contributor);
  await expect(saying(contributor, "omar_h added an argument.")).toHaveCount(1);
  await expect(saying(contributor, "jordan_w added a wording.")).toHaveCount(1);
  await expect(panel(contributor)).not.toContainText(STAFF);
  await expect(panel(contributor)).not.toContainText("Library staff already work Saturdays");

  const owner = await board.open("maya.chen");
  await openHistory(owner);
  await expect(saying(owner, `omar_h added the argument “${STAFF}”`)).toHaveCount(1);
  await expect(saying(owner, `jordan_w added the wording “${short(SATURDAYS)}”`)).toHaveCount(1);
  // A hidden wording isn't on the board to open, so its words aren't a link.
  await expect(entry(owner, `omar_h added the argument “${STAFF}”`).getByRole("link")).toHaveCount(0);
});

test("J-03, A-06: a deleted wording's addition says only that a wording was added", async ({ board }) => {
  const { version } = await find(board, SATURDAYS);
  await board.api("jordan_w").delete(`versions/${version}`);
  const page = await board.open("maya.chen");
  await openHistory(page);

  await expect(entries(page).nth(0).locator("p")).toHaveText("jordan_w deleted a wording.");
  await expect(saying(page, "jordan_w added a wording.")).toHaveCount(1);
  await expect(panel(page)).not.toContainText("Library staff already work Saturdays");
});

test("J-03, M-02: an open History takes in an argument someone adds, on the next poll", async ({ board }) => {
  const page = await board.open("tess.b");
  await openHistory(page);
  const before = await entries(page).count();

  await addArgument(board, "lin.zhao", CAFE);
  await poll(page);

  await expect(entries(page)).toHaveCount(before + 1);
  await expect(entries(page).nth(0).locator("p")).toHaveText(`lin.zhao added the argument “${CAFE}”`);
});

test("J-03, C-02: an edit of a source's link that cleared its report says so; another edit doesn't", async ({ board }) => {
  const source = board.ids.itemId();
  const { version } = await find(board, LEAD);
  await board.api("maya.chen").post(`versions/${version}/sources`, { id: source, ...SURVEY });
  await board.api("maya.chen").put(`sources/${source}`, { ...SURVEY, finding: "Four in ten shift workers have only Sunday off." });
  await board.api("jordan_w").put(`sources/${source}/unavailable`, {});
  await board.api("maya.chen").put(`sources/${source}`, { ...SURVEY, finding: "Four in ten shift workers have only Sunday off.", locator: "https://example.org/shift-work-2024" });
  const page = await board.open("tess.b");
  await openHistory(page);

  await expect(entries(page).nth(0).locator("p")).toHaveText("maya.chen edited the source “Shift work survey, 2024”, which cleared its report.");
  await expect(entries(page).nth(1).locator("p")).toHaveText("jordan_w reported that the source “Shift work survey, 2024” can’t be opened.");
  await expect(entries(page).nth(2).locator("p")).toHaveText("maya.chen edited the source “Shift work survey, 2024”.");
});

for (const width of [1280, 375]) {
  test(`J-03, M-04: History with arguments and wordings added passes an accessibility scan, at ${width} px`, async ({ board }) => {
    await addArgument(board, "tess.b", CAFE);
    const { version } = await find(board, STAFF);
    await board.api("maya.chen").put(`versions/${version}/hidden`, { reason: "spam" });
    const page = await board.open("lin.zhao", { width });
    await openHistory(page);
    await expect(entry(page, "added the argument").first()).toBeVisible();
    await expect(saying(page, "omar_h added an argument.")).toHaveCount(1);

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Every entry, and every day's heading, has an ID of its own.
    const repeated = await page.evaluate(() => {
      const ids = [...document.querySelectorAll("#sm-history [id]")].map((element) => element.id);
      return ids.filter((id, at) => ids.indexOf(id) !== at);
    });
    expect(repeated).toEqual([]);
  });
}
