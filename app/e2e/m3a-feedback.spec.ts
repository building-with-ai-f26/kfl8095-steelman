// The builder's notes after testing M3a by hand (Nov 22), each pinned here:
//
// - The combine and separate dialog says, in one light gray line, what
//   happens to the votes.
// - A reported source stands out in red, says who and when in one short
//   sentence, and "Can’t open it?" is an icon button, as GitHub puts a
//   report action behind an icon with a tooltip.
// - History sits on the line under the question, beside who can open the
//   board, at every width.
// - A card has the prototype's chevron at the far right of its footer, which
//   opens and closes it.
// - An unfolded row with one wording no longer says "Only one wording so far."

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { find, row, short } from "./support/screen.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const SHIFT = "Shift workers can only come on Sundays.";
const STUDY = "Students need a quiet place to study before Monday exams.";
const FAMILY = "Families could visit together on the one day nobody has school or work.";
const STAFF = "Staff need a guaranteed day off.";
const SURVEY = { name: "Shift work survey, 2024", locator: "https://example.org/shift-work", finding: "Four in ten shift workers have Sunday as their only day off.", backsUp: "", limits: "" };

const dialog = (page: Page) => page.getByRole("dialog");
const card = (page: Page, wording: string): Locator => page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
const evidence = (page: Page, wording: string): Locator => card(page, wording).getByRole("region", { name: "Evidence and its assessment" });

async function chooseFromMenu(page: Page, wording: string, item: string): Promise<void> {
  await card(page, wording).getByRole("button", { name: "Options for this version" }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: item }).click();
}

async function addSurvey(board: TestBoard, wording: string): Promise<void> {
  const { version } = await find(board, wording);
  await board.api("maya.chen").post(`versions/${version}/sources`, { id: board.ids.itemId(), ...SURVEY });
}

test("A-10: the dialog says in a light gray line what happens to the votes, for each kind of change", async ({ board }) => {
  const page = await board.open("maya.chen");

  // One of two wordings joins another argument: both arguments keep their importance votes.
  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await chooseFromMenu(page, SHIFT, "Combine…");
  await page.getByRole("button", { name: `Combine here: same point as “${short(STUDY)}”` }).click();
  await expect(dialog(page).locator(".sm-preview-votes")).toHaveText("The wording keeps its votes and credibility score. Each argument keeps its importance votes.");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  // An argument's last wording: the two arguments become one.
  await chooseFromMenu(page, STUDY, "Combine…");
  await page.getByRole("button", { name: /^Combine here: same point as “Families/ }).click();
  await expect(dialog(page).locator(".sm-preview-votes")).toHaveText("Each person keeps at most one importance vote on the combined argument. The wording keeps its votes and credibility score.");
  const gray = await dialog(page).locator(".sm-preview-votes").evaluate((node) => getComputedStyle(node).color);
  const ink = await dialog(page).locator("h2").evaluate((node) => getComputedStyle(node).color);
  expect(gray).not.toBe(ink);
  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  await chooseFromMenu(page, SHIFT, "Separate…");
  await expect(dialog(page).locator(".sm-preview-votes")).toHaveText("The new argument starts with no importance votes. The wording keeps its votes and credibility score.");
});

test("C-02: Can’t open it? is an icon button; a reported source shows in red, with who and when in one sentence", async ({ board }) => {
  await addSurvey(board, LEAD);
  const page = await board.open("jordan_w");
  await card(page, LEAD).getByRole("button", { name: LEAD }).click();
  const source = evidence(page, LEAD).locator(".sm-source-row");
  await source.locator("summary").click();

  const report = source.getByRole("button", { name: "Report a broken link" });
  await expect(report).toHaveAttribute("data-tooltip", "Can’t open it?");
  await expect(report).toHaveText("");
  await expect(source.getByRole("button", { name: "Can’t open it?" })).toHaveCount(0);
  await report.click();

  const tag = source.locator("summary .sm-unavailable");
  await expect(tag).toHaveText("Unavailable");
  const note = source.locator(".sm-unavailable-note");
  await expect(note).toContainText("You reported it on Nov 16, 2026.");
  await expect(note.getByRole("link", { name: "Try an archived copy" })).toBeVisible();
  await expect(note.getByRole("button", { name: "Undo report" })).toBeVisible();
  // Red: the tag's text and the note's edge are the alert colour, not the muted gray around them.
  const red = await tag.evaluate((node) => getComputedStyle(node).color);
  expect(red).toBe("rgb(180, 35, 47)");
  expect(await note.evaluate((node) => getComputedStyle(node).borderLeftColor)).not.toBe("rgba(0, 0, 0, 0)");

  await note.getByRole("button", { name: "Undo report" }).click();
  await expect(source.locator("summary .sm-unavailable")).toHaveCount(0);
  expect((await new AxeBuilder({ page }).include(".sm-source-row").analyze()).violations).toEqual([]);
});

for (const width of [1280, 375]) {
  test(`J-03, M-03: History sits on the line under the question, beside who can open the board, at ${width} px`, async ({ board }) => {
    const page = await board.open("maya.chen", { width });
    const history = page.getByRole("button", { name: "History" });
    const access = page.locator(".sm-head .sm-meta-pill");
    const question = page.locator(".sm-head h1");
    const [h, a, q] = [(await history.boundingBox())!, (await access.boundingBox())!, (await question.boundingBox())!];
    // Below the question, on the access chip's line, at the head's right.
    expect(h.y).toBeGreaterThan(q.y + q.height - 1);
    expect(Math.abs(h.y + h.height / 2 - (a.y + a.height / 2))).toBeLessThan(6);
    expect(h.x).toBeGreaterThan(a.x + a.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("A-02: a chevron at the far right of a card's footer opens and closes it", async ({ board }) => {
  const page = await board.open("maya.chen");
  const target = card(page, STAFF);
  const chevron = target.locator(".sm-card-meta").getByRole("button", { name: "Expand card" });
  await expect(chevron).toHaveAttribute("aria-expanded", "false");
  // The last thing in the footer, at its right.
  expect(await target.locator(".sm-card-meta .sm-card-tools > *").last().evaluate((node) => node.classList.contains("sm-expand"))).toBe(true);

  await chevron.click();
  await expect(target.getByRole("region", { name: "Context" })).toBeVisible();
  const hide = target.locator(".sm-card-meta").getByRole("button", { name: "Collapse card" });
  await expect(hide).toHaveAttribute("aria-expanded", "true");
  await hide.click();
  await expect(target.getByRole("region", { name: "Context" })).toHaveCount(0);
});

test("A-05: an unfolded row with one wording says nothing about it, and still folds back", async ({ board }) => {
  const page = await board.open("maya.chen");
  // Students has one wording on the demo board.
  const study = row(page, STUDY);
  await study.locator(".sm-stack-button").click();
  const axis = study.locator(".sm-track-note");
  await expect(axis).toBeVisible();
  await expect(axis).toHaveText("");
  await expect(axis.getByRole("button", { name: "Fold versions back into the stack" })).toBeVisible();
});

test("A-10: the moved wording and the row it joined stay readable while picking", async ({ board }) => {
  const page = await board.open("maya.chen");
  await chooseFromMenu(page, STUDY, "Combine…");
  await expect(row(page, FAMILY).locator(".sm-claim")).toBeVisible();
});
