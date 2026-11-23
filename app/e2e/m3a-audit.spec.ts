// What the M3a audit found on the board (Nov 22), each with the fix it pins:
//
// - A wording named in History that someone has moved, which the board shows
//   in its new place only after Update: choosing it used to fold the reader's
//   row and open nothing. A note in the header now says how to see it.
// - Undo of the reader's own combine, after they pressed Update: it used to
//   draw the screen from before Update again, deleted rows and all.
// - "Combine here" and the dialog named a row by its first card, even one
//   marked deleted. They name a wording that is still in the argument.
// - A wording being placed stayed "picked" through a switch to Strongest
//   case, and an Escape that closed History also cancelled the pick.

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import { column, find, pill, poll, row, rows, short, status } from "./support/screen.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const SHIFT = "Shift workers can only come on Sundays.";
const STUDY = "Students need a quiet place to study before Monday exams.";
const FAMILY = "Families could visit together on the one day nobody has school or work.";
/** A row in No with two wordings, Omar's leading and Jordan's second. */
const STAFF = "Staff need a guaranteed day off.";
const SATURDAYS = "Library staff already work Saturdays, so Sunday would leave them no weekend.";
const BUDGET = "Opening a seventh day costs more than the budget allows.";

const NOT_SHOWN_YET = "Press Update to see that wording where it is now.";

const dialog = (page: Page) => page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Cancel" }) });
const history = (page: Page) => page.getByRole("dialog", { name: "History" });
const cardOf = (page: Page, wording: string): Locator => page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
const banner = (page: Page) => page.locator(".sm-move-banner");
const view = (page: Page, name: "Board" | "Strongest case") => page.getByRole("group", { name: "View" }).getByRole("button", { name, exact: true });

async function chooseFromMenu(page: Page, wording: string, item: string): Promise<void> {
  await cardOf(page, wording).getByRole("button", { name: "Options for this version" }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: item }).click();
}

test("J-03, A-10, M-02: a wording in History that someone moved says to press Update, and opens once the board shows it there", async ({ board }) => {
  const study = await find(board, STUDY);
  const family = await find(board, FAMILY);
  const page = await board.open("tess.b");
  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await board.api("maya.chen").post(`versions/${study.version}/combine`, { into: family.argument });
  await poll(page);
  await page.getByRole("button", { name: "History" }).click();
  // The newest entry that names it is the combine's; the entry for adding it, which History now lists, links it too.
  const link = history(page).getByRole("link", { name: `“${short(STUDY)}”` }).first();

  await link.click();

  // Nothing on the board moves: the row the reader unfolded stays unfolded, and no card opens.
  await expect(page.locator(".sm-link-note")).toContainText(NOT_SHOWN_YET);
  await expect(status(page)).toHaveText(NOT_SHOWN_YET);
  await expect(cardOf(page, SHIFT)).toBeVisible();
  expect(page.url()).not.toContain(study.version);
  await expect(history(page)).toBeVisible();

  await pill(page).getByRole("button", { name: "Update" }).click();
  await link.click();

  await expect(cardOf(page, STUDY).getByRole("region", { name: "Evidence and its assessment" })).toBeVisible();
  expect(page.url()).toContain(study.version);
});

test("A-10, J-05, M-02: Undo after Update moves only the wording back, and doesn't bring back what Update cleared", async ({ board }) => {
  const lead = await find(board, LEAD);
  const family = await find(board, FAMILY);
  const page = await board.open("maya.chen");
  // Someone's delete waits for Update, marked in its place.
  await board.api("tess.b").delete(`versions/${family.version}`);
  await poll(page);
  await expect(pill(page)).toContainText("1 change");
  await chooseFromMenu(page, LEAD, "Combine…");
  await page.getByRole("button", { name: `Combine here: same point as “${short(STUDY)}”` }).click();
  await dialog(page).getByRole("button", { name: "Combine" }).click();
  await expect(page.locator(".sm-undo")).toBeVisible();

  await pill(page).getByRole("button", { name: "Update" }).click();
  await expect(column(page, "Yes").getByText("Deleted by tess.b")).toHaveCount(0);
  await page.locator(".sm-undo").getByRole("button", { name: "Undo" }).click();

  await expect(status(page)).toHaveText("The wording is back where it was.");
  await expect(row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" })).toBeVisible();
  await expect(column(page, "Yes").getByText("Deleted by tess.b")).toHaveCount(0);
  await expect(pill(page)).toBeHidden();
  expect(await rows(page, "Yes")).toEqual([LEAD, STUDY]);
  expect((await board.api("maya.chen").snapshot()).versions.find((v: { id: string }) => v.id === lead.version).argumentId).toBe(lead.argument);
});

test("A-10: Combine here and its dialog name a wording still in the argument, not a card marked deleted", async ({ board }) => {
  const staff = await find(board, STAFF);
  const page = await board.open("maya.chen");
  // Omar deletes the row's leading wording; until Update, the row still leads with its marker.
  await board.api("omar_h").delete(`versions/${staff.version}`);
  await poll(page);
  await expect(column(page, "No").getByText("Deleted by omar_h")).toBeVisible();

  await chooseFromMenu(page, BUDGET, "Combine…");
  await expect(page.getByRole("button", { name: /Deleted by/ })).toHaveCount(0);
  await page.getByRole("button", { name: `Combine here: same point as “${short(SATURDAYS)}”` }).click();

  await expect(dialog(page)).toContainText(short(BUDGET));
  await expect(dialog(page)).toContainText(short(SATURDAYS));
  await expect(dialog(page).locator("blockquote")).toHaveText([short(BUDGET), short(SATURDAYS)]);
});

test("A-10, J-03: Escape that closes History leaves the pick as it is; Strongest case puts the wording down", async ({ board }) => {
  const page = await board.open("maya.chen");
  await chooseFromMenu(page, LEAD, "Combine…");
  await expect(banner(page)).toBeVisible();

  await page.getByRole("button", { name: "History" }).click();
  await expect(history(page).getByRole("button", { name: "Close history" })).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(history(page)).toHaveCount(0);
  await expect(banner(page)).toBeVisible();

  await view(page, "Strongest case").click();
  await view(page, "Board").click();

  await expect(banner(page)).toHaveCount(0);
  await expect(page.locator(".sm-move-here")).toHaveCount(0);
});
