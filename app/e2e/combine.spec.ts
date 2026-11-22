// Combine and separate on the board (M3a-7; A-10, J-05), as M3a-5 designed
// them in the prototype and the builder chose on Nov 22: an Editor or the
// Owner moves one wording into another argument in its option, by dragging
// the card's merge handle onto it, or, without a drag, by "Combine with
// another argument" (the ⋯ menu, or a click on the handle), then "Combine
// here" on the argument it repeats. "Make it a separate argument" (the menu,
// or a drop on the column's "Add an argument") makes it its own argument.
// Each opens a short dialog first, as Zendesk does before merging tickets and
// Canny before merging posts: the question, the wordings, and Cancel and the
// action, named for what it does (GOV.UK's button guidance). When it's its
// argument's last wording, the two arguments become one, and the dialog says
// who'll be asked to vote again. Ten seconds of Undo follow.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { column, find, pill, poll, row, rows, short, status } from "./support/screen.ts";

/** Maya's wording, leading a row with a second wording, Omar's. */
const LEAD = "Sunday is the only free day for many people who work weekdays.";
const SHIFT = "Shift workers can only come on Sundays.";
/** Two arguments with one wording each, in the same option. */
const STUDY = "Students need a quiet place to study before Monday exams.";
const FAMILY = "Families could visit together on the one day nobody has school or work.";
/** An argument in the other option. */
const STAFF = "Staff need a guaranteed day off.";

const dialog = (page: Page) => page.getByRole("dialog");
const cardOf = (page: Page, wording: string): Locator => page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
const handle = (page: Page, wording: string) => cardOf(page, wording).getByRole("button", { name: "Combine with another argument" });
const here = (page: Page, wording: string) => page.getByRole("button", { name: `Combine here: same point as “${short(wording)}”` });
const argumentOf = async (board: TestBoard, versionId: string) =>
  (await board.api("maya.chen").snapshot()).versions.find((v: { id: string }) => v.id === versionId).argumentId as string;

async function chooseFromMenu(page: Page, wording: string, item: string): Promise<void> {
  await cardOf(page, wording).getByRole("button", { name: "Options for this version" }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: item }).click();
}

test("M3a-7, A-10: the Owner combines a wording from its ⋯ menu, picking the argument it repeats, after a dialog", async ({ board }) => {
  const page = await board.open("maya.chen");
  const lead = await find(board, LEAD);
  const study = await find(board, STUDY);

  await chooseFromMenu(page, LEAD, "Combine with another argument");
  await expect(column(page, "Yes").getByText("Pick the argument that makes the same point.")).toBeVisible();
  // Only the other arguments in its option offer Combine here; the first has the cursor.
  await expect(column(page, "Yes").locator(".sm-move-here")).toHaveCount(2);
  await expect(column(page, "No").locator(".sm-move-here")).toHaveCount(0);
  await expect(here(page, STUDY)).toBeFocused();
  await here(page, STUDY).click();

  await expect(dialog(page)).toHaveAccessibleName("Combine this wording with that argument?");
  await expect(dialog(page)).toContainText(short(LEAD));
  await expect(dialog(page)).toContainText(short(STUDY));
  await expect(dialog(page)).not.toContainText("vote again");
  await expect(dialog(page).getByRole("button", { name: "Combine" })).toBeFocused();
  await dialog(page).getByRole("button", { name: "Combine" }).click();

  await expect(dialog(page)).toHaveCount(0);
  await expect(status(page)).toHaveText("The wording now sits with the other argument’s wordings. Undo is available for ten seconds.");
  await expect(row(page, STUDY).getByRole("button", { name: "Compare 2 wordings of this argument" })).toBeVisible();
  await expect(row(page, SHIFT)).toBeVisible();
  await expect(page.locator(".sm-undo")).toContainText("You combined the wording with that argument.");
  await expect(page.locator(".sm-undo").getByRole("button", { name: "Undo" })).toBeFocused();
  expect(await argumentOf(board, lead.version)).toBe(study.argument);
  // The reader's own change isn't one waiting for Update.
  await expect(pill(page)).toBeHidden();
});

test("M3a-7, A-10, J-05: Undo puts the wording back where it was", async ({ board }) => {
  const page = await board.open("maya.chen");
  const lead = await find(board, LEAD);
  const before = await rows(page, "Yes");
  await chooseFromMenu(page, LEAD, "Combine with another argument");
  await here(page, STUDY).click();
  await dialog(page).getByRole("button", { name: "Combine" }).click();
  await expect(page.locator(".sm-undo")).toBeVisible();

  await page.locator(".sm-undo").getByRole("button", { name: "Undo" }).click();

  await expect(status(page)).toHaveText("The wording is back where it was.");
  await expect(page.locator(".sm-undo")).toHaveCount(0);
  expect(await rows(page, "Yes")).toEqual(before);
  await expect(row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" })).toBeVisible();
  expect(await argumentOf(board, lead.version)).toBe(lead.argument);
});

test("M3a-7, A-10, PRD §5: dragging an argument's last wording onto another combines the two, and asks again whoever's votes disagreed", async ({ board }) => {
  const study = await find(board, STUDY);
  const family = await find(board, FAMILY);
  await board.api("maya.chen").put(`arguments/${study.argument}/importance`, { value: 1 });
  await board.api("maya.chen").put(`arguments/${family.argument}/importance`, { value: -1 });
  await board.api("jordan_w").put(`arguments/${study.argument}/importance`, { value: -1 });
  const page = await board.open("maya.chen");

  await handle(page, STUDY).dragTo(row(page, FAMILY));

  await expect(dialog(page)).toHaveAccessibleName("Combine these arguments?");
  // Jordan voted up on Families and down on Students; Maya the other way round.
  await expect(dialog(page)).toContainText("You and 1 other will be asked to vote again.");
  await dialog(page).getByRole("button", { name: "Combine" }).click();

  await expect(status(page)).toHaveText("The arguments are combined. Undo is available for ten seconds.");
  await expect(page.locator(".sm-undo")).toContainText("You combined the arguments.");
  expect(await rows(page, "Yes")).toEqual([LEAD, FAMILY]);
  const note = row(page, FAMILY).getByRole("note");
  await expect(note).toHaveText("Your votes on the two arguments disagreed, so vote again.");
  await row(page, FAMILY).getByRole("button", { name: "More important if true" }).click();
  await expect(note).toHaveCount(0);
});

test("M3a-7, A-10: a wording is separated from its ⋯ menu, and by dropping it on Add an argument", async ({ board }) => {
  const page = await board.open("maya.chen");
  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();

  await chooseFromMenu(page, SHIFT, "Make it a separate argument");
  await expect(dialog(page)).toHaveAccessibleName("Make this wording its own argument?");
  await expect(dialog(page)).toContainText(SHIFT);
  await dialog(page).getByRole("button", { name: "Separate" }).click();

  await expect(status(page)).toHaveText("The wording is now its own argument, at the end of this option. Undo is available for ten seconds.");
  await expect(page.locator(".sm-undo")).toContainText("You made the wording its own argument.");
  expect((await rows(page, "Yes")).at(-1)).toBe(SHIFT);
  await expect(pill(page)).toBeHidden();
  await page.locator(".sm-undo").getByRole("button", { name: "Undo" }).click();
  await expect(status(page)).toHaveText("The wording is back where it was.");

  // The other way: drag it to the column's Add an argument. The row is still unfolded, as it was.
  await expect(cardOf(page, SHIFT)).toBeVisible();
  await handle(page, SHIFT).dragTo(column(page, "Yes").getByRole("button", { name: "Add an argument for Yes" }));
  await expect(dialog(page)).toHaveAccessibleName("Make this wording its own argument?");
});

test("M3a-7, A-10: Cancel, Escape, and a click outside change nothing; Escape also ends picking, by keyboard", async ({ board }) => {
  const page = await board.open("maya.chen");
  const before = await rows(page, "Yes");

  // By keyboard: the handle, Enter, then the first Combine here.
  await handle(page, STUDY).focus();
  await page.keyboard.press("Enter");
  await expect(here(page, LEAD)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(column(page, "Yes").locator(".sm-move-here")).toHaveCount(0);
  await expect(status(page)).toHaveText("Combining was cancelled.");
  await expect(handle(page, STUDY)).toBeFocused();

  await handle(page, STUDY).click();
  await here(page, FAMILY).click();
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(handle(page, STUDY)).toBeFocused();

  await handle(page, STUDY).click();
  await here(page, FAMILY).click();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);

  await handle(page, STUDY).click();
  await here(page, FAMILY).click();
  await page.mouse.click(5, 5);
  await expect(dialog(page)).toHaveCount(0);

  expect(await rows(page, "Yes")).toEqual(before);
  expect((await board.api("maya.chen").snapshot()).arguments.filter((a: { mergedInto: string | null }) => a.mergedInto !== null)).toEqual([]);
});

test("M3a-7, A-10, H-03: a Contributor sees no way to combine or separate", async ({ board }) => {
  const page = await board.open("tess.b");
  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();

  await expect(page.getByRole("button", { name: "Combine with another argument" })).toHaveCount(0);
  await cardOf(page, SHIFT).getByRole("button", { name: "Options for this version" }).click();
  await expect(page.getByRole("menu").getByRole("menuitem", { name: /Combine|separate/ })).toHaveCount(0);
});

test("M3a-7, A-10, M-02: another reader sees a combined argument in its place, saying so, until Update", async ({ board }) => {
  const study = await find(board, STUDY);
  const family = await find(board, FAMILY);
  const other = await board.open("tess.b");

  await board.api("maya.chen").post(`versions/${study.version}/combine`, { into: family.argument });
  await poll(other);

  await expect(row(other, FAMILY)).toBeVisible();
  const gone = column(other, "Yes").locator(".sm-idea.sm-merged");
  await expect(gone).toContainText(`This was combined with “${short(FAMILY)}”.`);
  await expect(pill(other)).toContainText("1 change");
  await gone.getByRole("button", { name: "Go to it" }).click();
  await expect(row(other, FAMILY).locator(".sm-claim-button").first()).toBeFocused();

  await pill(other).getByRole("button", { name: "Update" }).click();
  expect(await rows(other, "Yes")).toEqual([LEAD, FAMILY]);
  await expect(row(other, FAMILY).getByRole("button", { name: "Compare 2 wordings of this argument" })).toBeVisible();
});

test("M3a-7, A-10: a wording can't be combined into the other option, and the drop targets say what a drop does", async ({ board }) => {
  const page = await board.open("maya.chen");
  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();

  await handle(page, SHIFT).hover();
  await page.mouse.down();
  await row(page, STUDY).hover();
  await expect(row(page, STUDY)).toHaveAttribute("data-drop-label", "Combine here");
  await expect(row(page, STAFF)).not.toHaveAttribute("data-drop-label");
  await page.mouse.up();
});

test("M3a-7, A-10, M-02: another reader sees one wording moved out of a row they still see, saying where it went", async ({ board }) => {
  const lead = await find(board, LEAD);
  const study = await find(board, STUDY);
  const other = await board.open("tess.b");
  await row(other, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();

  await board.api("maya.chen").post(`versions/${lead.version}/combine`, { into: study.argument });
  await poll(other);

  await expect(cardOf(other, SHIFT)).toBeVisible();
  await expect(column(other, "Yes").locator(".sm-removed-note", { hasText: `This wording was combined with “${short(STUDY)}”.` })).toBeVisible();
  await expect(pill(other)).toContainText("1 change");
});

test("M3a-7, A-10: on a touch screen, tapping the handle picks, as the menu does", async ({ board }) => {
  const page = await board.open("maya.chen", { width: 375, touch: true });

  await handle(page, STUDY).tap();
  await here(page, FAMILY).tap();
  await expect(dialog(page)).toHaveAccessibleName("Combine these arguments?");
  await dialog(page).getByRole("button", { name: "Combine" }).tap();

  await expect(status(page)).toHaveText("The arguments are combined. Undo is available for ten seconds.");
});

for (const width of [1280, 375]) {
  test(`M3a-7, M-04: the combine dialog passes an accessibility scan, and fits, at ${width} px`, async ({ board }) => {
    const page = await board.open("maya.chen", { width });
    // On a phone the handle is pressed, not dragged: it picks, as the menu does.
    await handle(page, STUDY).click();
    await here(page, FAMILY).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole("button", { name: "Combine" })).toBeInViewport();

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
