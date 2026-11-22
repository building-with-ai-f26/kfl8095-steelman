// History on the board (M3a-4; J-03), as the prototype's drawer has it: the
// question header's History opens a panel beside the board that lists what
// happened, newest first. As Google Drive's Activity panel and Google Docs'
// Version history do (plans/reviews/m3-design-audit.md, read live Nov 22), it
// groups entries by day and says each in a sentence: who did what to what.
// The button says "History" in words. Restore brings back a deleted option, a
// source taken off a wording, or a hidden wording, so the ten-second Undo
// isn't the only way back (WCAG 2.2.1). A deleted wording's text is erased
// when it's deleted (A-06), so it has no Restore.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { column, find, poll, status } from "./support/screen.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const STAFF = "Staff need a guaranteed day off.";
const SURVEY = { name: "Shift work survey, 2024", locator: "https://example.org/shift-work", finding: "Four in ten shift workers have Sunday as their only day off.", backsUp: "", limits: "" };

const historyButton = (page: Page) => page.getByRole("button", { name: "History" });
const panel = (page: Page) => page.getByRole("dialog", { name: "History" });
const entries = (page: Page) => panel(page).getByRole("listitem");
const entry = (page: Page, text: string | RegExp): Locator => entries(page).filter({ hasText: text });

async function openHistory(page: Page): Promise<void> {
  await historyButton(page).click();
  await expect(panel(page)).toBeVisible();
}

/** Adds an option and deletes it, through the API, as Maya. */
async function addAndDelete(board: TestBoard, name: string): Promise<string> {
  const id = board.ids.itemId();
  await board.api("maya.chen").post("options", { id, name });
  await board.api("maya.chen").delete(`options/${id}`);
  return id;
}

test("M3a-4, J-03: History, in words in the question header, opens a panel that says what happened, newest first, by day", async ({ board }) => {
  await addAndDelete(board, "Only in winter");
  const page = await board.open("tess.b");

  await expect(historyButton(page)).toHaveText("History");
  await openHistory(page);

  await expect(panel(page).getByRole("button", { name: "Close history" })).toBeFocused();
  await expect(status(page)).toHaveText("History is open.");
  await expect(panel(page).getByRole("heading", { name: /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/ }).first()).toBeVisible();
  await expect(entries(page).nth(0)).toContainText("maya.chen deleted the option “Only in winter”.");
  await expect(entries(page).nth(1)).toContainText("maya.chen added the option “Only in winter”.");
  // A Contributor can't restore an option.
  await expect(panel(page).getByRole("button", { name: /Restore/ })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(historyButton(page)).toBeFocused();
});

test("M3a-4, J-03, A-07: the Owner restores a deleted option from History", async ({ board }) => {
  await addAndDelete(board, "Only in winter");
  const page = await board.open("maya.chen");
  await openHistory(page);

  await entry(page, "deleted the option").getByRole("button", { name: "Restore" }).click();

  await expect(column(page, "Only in winter")).toBeVisible();
  await expect(status(page)).toHaveText("You restored the option “Only in winter”.");
  await expect(entries(page).nth(0)).toContainText("maya.chen restored the option “Only in winter”.");
  await expect(entry(page, "deleted the option").getByRole("button", { name: "Restore" })).toHaveCount(0);
});

test("M3a-4, J-03, C-01: a source taken off a wording is put back from History", async ({ board }) => {
  const source = board.ids.itemId();
  const { version } = await find(board, LEAD);
  await board.api("maya.chen").post(`versions/${version}/sources`, { id: source, ...SURVEY });
  await board.api("maya.chen").delete(`versions/${version}/sources/${source}`);
  const page = await board.open("maya.chen");
  await openHistory(page);
  await expect(entries(page).nth(0)).toContainText("maya.chen took the source “Shift work survey, 2024” off a wording.");

  await entries(page).nth(0).getByRole("button", { name: "Restore" }).click();

  await expect(status(page)).toHaveText("You put the source back on the wording. The credibility score resets.");
  await expect.poll(async () => (await board.api("maya.chen").snapshot()).versions.find((v: { id: string }) => v.id === version).sourceIds).toEqual([source]);
  await expect(entries(page).nth(0)).toContainText("maya.chen cited the source “Shift work survey, 2024”.");
});

test("M3a-4, J-03, J-02: a hidden wording shows its words and Restore to an Editor, and neither to a Contributor", async ({ board }) => {
  const { version } = await find(board, STAFF);
  await board.api("maya.chen").put(`versions/${version}/hidden`, { reason: "offtopic" });
  const contributor = await board.open("tess.b");
  await openHistory(contributor);
  await expect(entries(contributor).nth(0)).toContainText("maya.chen hid a wording as off-topic.");
  await expect(entries(contributor).nth(0)).not.toContainText(STAFF);

  const owner = await board.open("maya.chen");
  await openHistory(owner);
  await expect(entries(owner).nth(0)).toContainText(`maya.chen hid “${STAFF}” as off-topic.`);
  await entries(owner).nth(0).getByRole("button", { name: "Restore" }).click();
  await expect(status(owner)).toHaveText("You restored the wording.");
  await expect(entries(owner).nth(0)).toContainText(`maya.chen restored “${STAFF}”.`);
});

test("M3a-4, J-03, M-06: a wording named in History opens on the board", async ({ board }) => {
  const { version } = await find(board, STAFF);
  await board.api("maya.chen").put(`versions/${version}/hidden`, { reason: "spam" });
  await board.api("maya.chen").delete(`versions/${version}/hidden`);
  const page = await board.open("tess.b");
  await openHistory(page);

  await entries(page).nth(0).getByRole("link", { name: `“${STAFF}”` }).click();

  const card = page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: STAFF }) });
  await expect(card.getByRole("region", { name: "Evidence and its assessment" })).toBeVisible();
  expect(page.url()).toContain(version);
});

test("M3a-4, J-03, M-02: an open History takes in what others do, on the next poll", async ({ board }) => {
  const page = await board.open("tess.b");
  await openHistory(page);
  const before = await entries(page).count();

  await addAndDelete(board, "Only at night");
  await poll(page);

  await expect(entries(page)).toHaveCount(before + 2);
  await expect(entries(page).nth(0)).toContainText("maya.chen deleted the option “Only at night”.");
});

test("M3a-4, J-03, A-07: with four options showing, a deleted one has no Restore", async ({ board }) => {
  await addAndDelete(board, "Only in winter");
  for (const name of ["Third", "Fourth"]) await board.api("maya.chen").post("options", { id: board.ids.itemId(), name });
  const page = await board.open("maya.chen");
  await openHistory(page);

  await expect(entry(page, "deleted the option")).toBeVisible();
  await expect(entry(page, "deleted the option").getByRole("button", { name: /Restore/ })).toHaveCount(0);
});

test("M3a-4, J-03: changes of access, roles, and source reports read as sentences", async ({ board }) => {
  const source = board.ids.itemId();
  const { version } = await find(board, LEAD);
  await board.api("maya.chen").post(`versions/${version}/sources`, { id: source, ...SURVEY });
  await board.api("jordan_w").put(`sources/${source}/unavailable`, {});
  await board.api("maya.chen").delete(`sources/${source}/unavailable`);
  await board.api("maya.chen").put("access", { general: "link", linkRole: "voter" });
  const people = (await board.api("maya.chen").get("people")) as { people: { id: string; name: string }[] };
  const tess = people.people.find((p) => p.name === "tess.b")!.id;
  await board.api("maya.chen").put(`people/${tess}`, { role: "editor" });
  const page = await board.open("lin.zhao");
  await openHistory(page);

  await expect(entries(page).nth(0)).toContainText("maya.chen made tess.b an editor.");
  await expect(entries(page).nth(1)).toContainText("maya.chen let anyone with the link vote.");
  await expect(entries(page).nth(2)).toContainText("maya.chen cleared the report on the source “Shift work survey, 2024”.");
  await expect(entries(page).nth(3)).toContainText("jordan_w reported that the source “Shift work survey, 2024” can’t be opened.");
  await expect(entries(page).nth(4)).toContainText("maya.chen added the source “Shift work survey, 2024”.");
});

for (const width of [1280, 375]) {
  test(`M3a-4, M-04: the open History passes an accessibility scan, at ${width} px`, async ({ board }) => {
    await addAndDelete(board, "Only in winter");
    const page = await board.open("maya.chen", { width });
    await openHistory(page);
    await expect(entries(page).first()).toBeVisible();

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
