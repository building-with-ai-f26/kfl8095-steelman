// The card menu (M1-10), in the browser: a version's ⋯ menu offers M1's
// actions by role (baseMenuMarkup in docs/prototype/source/steelman-refined.html):
// the author edits in place and deletes, with Undo for ten seconds; anyone
// else who may write suggests a revised version; everyone copies the link.
// A delete is held in the browser for those ten seconds and only then sent,
// or at once if the tab closes (plans/architecture.md §2).

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page, Request } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { POLL_MS } from "./support/board.ts";
import { column, find, pill, poll, row, rows, status } from "./support/screen.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const SHIFT = "Shift workers can only come on Sundays.";
const BUDGET = "Opening a seventh day costs more than the budget allows.";
const EDITED = "Sunday is the only day off for many people who work weekdays.";
const UNDO_MS = 10_000;

const card = (page: Page, wording: string): Locator => page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
const options = (page: Page, wording: string): Locator => card(page, wording).getByRole("button", { name: "Options for this version" });
const menu = (page: Page): Locator => page.getByRole("menu", { name: "Version options" });
const editForm = (page: Page): Locator => page.getByRole("form", { name: "Edit your version" });
const undoBar = (page: Page): Locator => page.locator(".sm-undo");

async function openMenu(page: Page, wording: string): Promise<void> {
  await options(page, wording).click();
  await expect(menu(page)).toBeVisible();
}

/** The menu's items, top to bottom. */
const items = (page: Page) => menu(page).getByRole("menuitem").allTextContents();

/** Every DELETE of a version this page sends. */
function deletesSent(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (request.method() === "DELETE" && /\/versions\/[^/]+$/.test(new URL(request.url()).pathname)) sent.push(request);
  });
  return sent;
}

/** Whether the service has the wording deleted. */
async function deletedOnService(board: TestBoard, versionId: string): Promise<boolean> {
  const snapshot = await board.api("tess.b").snapshot();
  return snapshot.versions.find((v: { id: string }) => v.id === versionId)?.deleted === true;
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.describe("what the menu offers", () => {
  test("A-12, A-10: the author's menu has Copy link, Edit wording and context, Combine…, Separate…, and Delete version, with Delete last", async ({ board }) => {
    const page = await board.open("maya.chen");
    await openMenu(page, LEAD);

    // The Owner may combine and separate (M3a-7; the builder approved this change, Nov 22), on a row with two wordings.
    expect(await items(page)).toEqual(["Copy link", "Edit wording and context", "Combine…", "Separate…", "Delete version"]);
    await expect(page.getByRole("menuitem", { name: "Copy link" })).toBeFocused();
  });

  test("A-12: on a row's only wording, the author's menu says Delete argument", async ({ board }) => {
    const page = await board.open("jordan_w");
    await openMenu(page, BUDGET);

    expect(await items(page)).toEqual(["Copy link", "Edit wording and context", "Delete argument"]);
  });

  test("A-12, A-10, J-01, J-02: someone else's menu has Copy link, Suggest a revised version, and Report; the owner's also Combine… and Hide; nothing of AI", async ({ board }) => {
    // Maya owns the board, and still can't edit or delete what someone else wrote. Report came with M2-3 and Hide with
    // M2-4 (the builder approved this change, Nov 20).
    for (const person of ["jordan_w", "maya.chen"] as const) {
      const page = await board.open(person);
      await openMenu(page, person === "maya.chen" ? BUDGET : LEAD);

      // The Owner also combines (M3a-7; the builder approved this change, Nov 22). Budget is its row's only wording, so there's no Separate….
      const owner = person === "maya.chen";
      expect(await items(page), person).toEqual(["Copy link", "Suggest a revised version", ...(owner ? ["Combine…"] : []), "Report", ...(owner ? ["Hide"] : [])]);
      await expect(menu(page).getByText(owner ? /separate|AI/i : /combine|separate|AI/i)).toHaveCount(0);
    }
  });

  test("A-12, M-04: arrow keys, Home, and End move between the menu's items", async ({ board }) => {
    const page = await board.open("maya.chen");
    await openMenu(page, LEAD);
    const item = (name: string) => page.getByRole("menuitem", { name });

    await page.keyboard.press("ArrowDown");
    await expect(item("Edit wording and context")).toBeFocused();
    await page.keyboard.press("End");
    await expect(item("Delete version")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(item("Copy link")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(item("Delete version")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(item("Copy link")).toBeFocused();
  });
});

test.describe("editing", () => {
  test("A-06, A-12: Edit opens the wording and context in place; saving shows the new wording, marked edited, here and for others", async ({ board }) => {
    const page = await board.open("maya.chen");
    const other = await board.open("jordan_w");
    await openMenu(page, LEAD);
    await page.getByRole("menuitem", { name: "Edit wording and context" }).click();

    const form = editForm(page);
    await expect(form.getByLabel("Your version", { exact: true })).toHaveValue(LEAD);
    await expect(form.getByLabel("Your version", { exact: true })).toBeFocused();
    await expect(form.getByLabel("Context (optional)")).toHaveValue("");
    await form.getByLabel("Your version", { exact: true }).fill(EDITED);
    await form.getByLabel("Context (optional)").fill("Most weekday workers have Sunday off.");
    await form.getByRole("button", { name: "Save changes" }).click();

    await expect(editForm(page)).toHaveCount(0);
    await expect(card(page, EDITED).getByRole("button", { name: "edited" })).toBeVisible();
    await expect(card(page, EDITED).getByRole("button", { name: EDITED })).toBeFocused();
    await expect(status(page)).toHaveText("Your version was saved.");

    await poll(other);
    await expect(card(other, EDITED).getByRole("button", { name: "edited" })).toBeVisible();
    await card(other, EDITED).getByRole("button", { name: "edited" }).click();
    await expect(card(other, EDITED).locator(".sm-prev del")).toHaveText(LEAD);

    await page.reload();
    await expect(card(page, EDITED)).toBeVisible();
    await card(page, EDITED).getByRole("button", { name: EDITED }).click();
    await expect(card(page, EDITED).locator(".sm-brief")).toHaveText("Most weekday workers have Sunday off.");
  });

  test("A-06: on an assessed wording, the edit form warns that the credibility score resets, once the text changes; saving resets it and keeps the votes", async ({ board }) => {
    const { version, rev } = await find(board, LEAD);
    for (const person of ["jordan_w", "omar_h"] as const) await board.api(person).put(`versions/${version}/assessment`, { rev, supported: false });
    const page = await board.open("maya.chen");
    await expect(card(page, LEAD).getByRole("img", { name: /^0% supported/ })).toBeVisible();
    await openMenu(page, LEAD);
    await page.getByRole("menuitem", { name: "Edit wording and context" }).click();
    const warning = editForm(page).getByRole("note");

    await expect(warning).toHaveCount(0);
    await editForm(page).getByLabel("Your version", { exact: true }).fill(EDITED);
    await expect(warning).toHaveText("The credibility score resets when you save.");
    await expect(editForm(page).getByRole("button", { name: "Save changes" })).toHaveAccessibleDescription("The credibility score resets when you save.");
    await editForm(page).getByLabel("Your version", { exact: true }).fill(LEAD);
    await expect(warning).toHaveCount(0);
    await editForm(page).getByLabel("Your version", { exact: true }).fill(EDITED);
    await editForm(page).getByRole("button", { name: "Save changes" }).click();

    await expect(card(page, EDITED).getByRole("img", { name: /^Unreviewed/ })).toBeVisible();
    await poll(page);
    await expect(card(page, EDITED).getByRole("img", { name: /^Unreviewed/ })).toBeVisible();
    // Importance votes stay: the row still leads its column.
    expect((await rows(page, "Yes"))[0]).toBe(EDITED);
    expect(await deletedOnService(board, version)).toBe(false);
  });

  test("A-06: Escape or Cancel discards the changes and puts the cursor back on ⋯; saving with no changes sends nothing", async ({ board }) => {
    const page = await board.open("maya.chen");
    const puts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PUT" && /\/versions\/[^/]+$/.test(new URL(request.url()).pathname)) puts.push(request.url());
    });
    await openMenu(page, LEAD);
    await page.getByRole("menuitem", { name: "Edit wording and context" }).click();
    await editForm(page).getByLabel("Your version", { exact: true }).fill(EDITED);
    await page.keyboard.press("Escape");

    await expect(editForm(page)).toHaveCount(0);
    await expect(card(page, LEAD)).toBeVisible();
    await expect(options(page, LEAD)).toBeFocused();
    await expect(status(page)).toHaveText("Changes discarded.");

    await openMenu(page, LEAD);
    await page.getByRole("menuitem", { name: "Edit wording and context" }).click();
    await expect(editForm(page).getByLabel("Your version", { exact: true })).toHaveValue(LEAD);
    await editForm(page).getByRole("button", { name: "Cancel editing" }).click();
    await expect(options(page, LEAD)).toBeFocused();

    await openMenu(page, LEAD);
    await page.getByRole("menuitem", { name: "Edit wording and context" }).click();
    await editForm(page).getByRole("button", { name: "Save changes" }).click();
    await expect(status(page)).toHaveText("No changes.");
    await poll(page);
    expect(puts).toEqual([]);
  });

  test("A-06: a wording can't be saved empty", async ({ board }) => {
    const page = await board.open("maya.chen");
    await openMenu(page, LEAD);
    await page.getByRole("menuitem", { name: "Edit wording and context" }).click();

    await editForm(page).getByLabel("Your version", { exact: true }).fill("   ");

    await expect(editForm(page).getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  test("A-06: an unfolded row's wording edits in place too", async ({ board }) => {
    const page = await board.open("omar_h");
    await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
    await openMenu(page, SHIFT);
    await page.getByRole("menuitem", { name: "Edit wording and context" }).click();

    await editForm(page).getByLabel("Your version", { exact: true }).fill("Shift workers often can only come on Sundays.");
    await editForm(page).getByRole("button", { name: "Save changes" }).click();

    await expect(row(page, LEAD).locator(".sm-track").getByRole("button", { name: "Shift workers often can only come on Sundays." })).toBeVisible();
  });
});

test.describe("deleting", () => {
  test("A-06, A-12: Delete takes the wording off at once with an Undo bar, and sends nothing for ten seconds; then it's sent, and others see it deleted", async ({ board }) => {
    const page = await board.open("omar_h");
    const other = await board.open("jordan_w");
    const { version } = await find(board, SHIFT);
    const sent = deletesSent(page);
    await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
    await openMenu(page, SHIFT);
    // The page's clock stops half a second on, so the ten seconds count only the clock's own runs, not the exit's real time.
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
    await page.getByRole("menuitem", { name: "Delete version" }).click();

    await expect(card(page, SHIFT)).toHaveCount(0);
    await expect(undoBar(page)).toHaveText("Version deleted.Undo");
    await expect(undoBar(page).getByRole("button", { name: "Undo" })).toBeFocused();
    await expect(status(page)).toHaveText("Version deleted. Undo is available for ten seconds.");
    await page.clock.runFor(UNDO_MS - 1_000);
    expect(sent).toHaveLength(0);
    expect(await deletedOnService(board, version)).toBe(false);

    const answered = page.waitForResponse((response) => response.request().method() === "DELETE");
    await page.clock.runFor(2_000);
    await answered;

    expect(sent).toHaveLength(1);
    await expect(undoBar(page)).toHaveCount(0);
    expect(await deletedOnService(board, version)).toBe(true);
    await poll(other);
    await expect(row(other, LEAD).locator(".sm-removed-note")).toHaveCount(0);
    await row(other, LEAD).getByRole("button", { name: /wordings of this argument/ }).click();
    await expect(other.locator(".sm-removed-note")).toHaveText("Deleted by omar_h");
    // The author's own board doesn't show it marked, or count it as a change.
    await poll(page);
    await expect(page.locator(".sm-removed-note")).toHaveCount(0);
    await expect(pill(page)).toBeHidden();
  });

  test("A-06: Undo within ten seconds puts the wording back where it was, and sends nothing", async ({ board }) => {
    const page = await board.open("maya.chen");
    const sent = deletesSent(page);
    const before = await rows(page, "Yes");
    await openMenu(page, LEAD);
    // The page's clock stops half a second on, so the ten seconds count only the clock's own runs, not the exit's real time.
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
    await page.getByRole("menuitem", { name: "Delete version" }).click();
    await expect(card(page, LEAD)).toHaveCount(0);
    // The row's other wording leads it meanwhile.
    expect((await rows(page, "Yes"))[0]).toBe(SHIFT);

    await page.clock.runFor(UNDO_MS - 1_000);
    await undoBar(page).getByRole("button", { name: "Undo" }).click();

    await expect(undoBar(page)).toHaveCount(0);
    expect(await rows(page, "Yes")).toEqual(before);
    await expect(card(page, LEAD).getByRole("button", { name: LEAD })).toBeFocused();
    await expect(status(page)).toHaveText("Restored.");
    await page.clock.runFor(3 * UNDO_MS);
    expect(sent).toHaveLength(0);
    await page.reload();
    await expect(card(page, LEAD)).toBeVisible();
  });

  test("A-06: deleting a row's only wording takes the row off, with Undo where it was; once sent, the argument is deleted", async ({ board }) => {
    const page = await board.open("jordan_w");
    const { version } = await find(board, BUDGET);
    await openMenu(page, BUDGET);
    await page.getByRole("menuitem", { name: "Delete argument" }).click();

    expect(await rows(page, "No")).not.toContain(BUDGET);
    await expect(column(page, "No").locator(".sm-undo")).toHaveText("Argument deleted.Undo");
    await expect(status(page)).toHaveText("Argument deleted. Undo is available for ten seconds.");
    // The phone's side tab counts the rows left (the tabs are hidden at this width).
    await expect(page.locator(".sm-sides button", { hasText: "No" }).locator("small")).toHaveText("2");

    const answered = page.waitForResponse((response) => response.request().method() === "DELETE");
    await page.clock.runFor(UNDO_MS + 1_000);
    await answered;
    await poll(page);

    expect(await deletedOnService(board, version)).toBe(true);
    expect(await rows(page, "No")).not.toContain(BUDGET);
    await expect(pill(page)).toBeHidden();
  });

  test("A-06: closing the tab within ten seconds sends the delete at once, without asking", async ({ board }) => {
    const page = await board.open("maya.chen");
    const { version } = await find(board, LEAD);
    await openMenu(page, LEAD);
    await page.getByRole("menuitem", { name: "Delete version" }).click();
    await expect(undoBar(page)).toBeVisible();
    let asked = false;
    page.on("dialog", async (dialog) => {
      asked = true;
      await dialog.accept();
    });

    await page.close({ runBeforeUnload: true });

    expect(asked).toBe(false);
    await expect.poll(() => deletedOnService(board, version)).toBe(true);
  });

  test("A-06, M-02: closing the tab offline during the ten seconds asks first, since the delete can't be sent", async ({ board }) => {
    const page = await board.open("maya.chen");
    await page.context().setOffline(true);
    // A browser already offline (CI's machine with no network) sends no "offline" event: the next poll failing is how the board learns it.
    await page.clock.runFor(POLL_MS);
    await expect(pill(page)).toHaveText("Offline");
    await openMenu(page, LEAD);
    await page.getByRole("menuitem", { name: "Delete version" }).click();
    await expect(undoBar(page)).toBeVisible();
    let asked = false;
    page.on("dialog", async (dialog) => {
      asked = dialog.type() === "beforeunload";
      await dialog.accept();
    });

    await page.close({ runBeforeUnload: true });
    await page.waitForEvent("close");

    expect(asked).toBe(true);
  });

  test("A-06, M-04: when the Undo bar leaves with the cursor on it, the cursor goes to the row it sat under", async ({ board }) => {
    const page = await board.open("maya.chen");
    await openMenu(page, LEAD);
    await page.getByRole("menuitem", { name: "Delete version" }).click();
    await expect(undoBar(page).getByRole("button", { name: "Undo" })).toBeFocused();

    await page.clock.runFor(UNDO_MS + 1_000);

    await expect(undoBar(page)).toHaveCount(0);
    await expect(card(page, SHIFT).getByRole("button", { name: SHIFT })).toBeFocused();
  });

  test("A-06: a second delete sends the first at once, and Undo then undoes only the second", async ({ board }) => {
    const page = await board.open("jordan_w");
    const sent = deletesSent(page);
    const budget = await find(board, BUDGET);
    await openMenu(page, BUDGET);
    await page.getByRole("menuitem", { name: "Delete argument" }).click();
    await row(page, "Staff need a guaranteed day off.").getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
    const library = "Library staff already work Saturdays, so Sunday would leave them no weekend.";
    await openMenu(page, library);
    const answered = page.waitForResponse((response) => response.request().method() === "DELETE");
    await page.getByRole("menuitem", { name: "Delete version" }).click();
    await answered;

    expect(sent).toHaveLength(1);
    expect(await deletedOnService(board, budget.version)).toBe(true);
    await expect(undoBar(page)).toHaveCount(1);
    await undoBar(page).getByRole("button", { name: "Undo" }).click();
    await expect(card(page, library)).toBeVisible();
    await page.clock.runFor(2 * UNDO_MS);
    expect(sent).toHaveLength(1);
  });
});

test.describe("suggesting a revised version", () => {
  test("A-05, A-12: Suggest a revised version unfolds the row and opens a draft that starts from that wording", async ({ board }) => {
    const page = await board.open("jordan_w");
    await openMenu(page, LEAD);
    await page.getByRole("menuitem", { name: "Suggest a revised version" }).click();

    const draft = row(page, LEAD).getByRole("form", { name: "Suggest a version" });
    await expect(draft.getByLabel("Your version", { exact: true })).toHaveValue(LEAD);
    await expect(draft.getByLabel("Your version", { exact: true })).toBeFocused();
    await expect(row(page, LEAD).locator(".sm-track")).toBeVisible();

    await draft.getByLabel("Your version", { exact: true }).fill(EDITED);
    await draft.getByLabel("What your version improves").fill("Says day off.");
    await draft.getByRole("button", { name: "Add your version" }).click();
    await poll(page);
    await expect(row(page, LEAD).locator(".sm-track").getByRole("button", { name: EDITED })).toBeVisible();
  });

  test("A-05: a draft already started in that row is kept, not replaced", async ({ board }) => {
    const page = await board.open("jordan_w");
    await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
    await row(page, LEAD).getByRole("button", { name: "Suggest a better version" }).click();
    await row(page, LEAD).getByLabel("Your version", { exact: true }).fill("My own start.");
    await row(page, LEAD).getByRole("button", { name: "Close draft" }).click();

    await openMenu(page, SHIFT);
    await page.getByRole("menuitem", { name: "Suggest a revised version" }).click();

    await expect(row(page, LEAD).getByLabel("Your version", { exact: true })).toHaveValue("My own start.");
    await expect(row(page, LEAD).getByLabel("Your version", { exact: true })).toBeFocused();
  });
});

for (const size of [
  { name: "desktop", width: 1280 },
  { name: "375", width: 375 },
]) {
  test(`A-12, A-06, M-04: the author's menu, the edit form with its warning, and the Undo bar pass an accessibility scan at ${size.name} width`, async ({ board }) => {
    const { version, rev } = await find(board, LEAD);
    await board.api("jordan_w").put(`versions/${version}/assessment`, { rev, supported: false });
    const page = await board.open("maya.chen", { width: size.width });
    await openMenu(page, LEAD);
    await expectNoAxeViolations(page);

    await page.getByRole("menuitem", { name: "Edit wording and context" }).click();
    await editForm(page).getByLabel("Your version", { exact: true }).fill(EDITED);
    await expect(editForm(page).getByRole("note")).toBeVisible();
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
    await page.keyboard.press("Escape");

    await openMenu(page, LEAD);
    await page.getByRole("menuitem", { name: "Delete version" }).click();
    await expect(undoBar(page)).toBeVisible();
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
  });
}
