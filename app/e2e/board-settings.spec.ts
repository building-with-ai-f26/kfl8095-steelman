// Board settings (M3b-2, I-01): the Owner's Settings button beside History
// opens the prototype's Settings in the drawer History uses, where the
// question is renamed. Enter or leaving the field saves; Escape keeps the old
// text; an empty question keeps the old one.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import { poll, status } from "./support/screen.ts";

const QUESTION = "Should our library open on Sundays?";
const RENAMED = "Should the library open on Sunday afternoons?";

const settings = (page: Page) => page.locator(".sm-head").getByRole("button", { name: "Settings" });
const panel = (page: Page) => page.getByRole("dialog", { name: "Settings" });
const field = (page: Page) => panel(page).getByRole("textbox", { name: "Question" });
const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const problem = (page: Page) => page.locator(".sm-problem");

async function openSettings(page: Page): Promise<void> {
  await settings(page).click();
  await expect(panel(page)).toBeVisible();
}

/** Presses Tab until the control has the focus, never counting presses (as accessibility.spec.ts does). */
async function tabTo(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  for (let presses = 0; presses < 200; presses++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Tab never reached the control");
}

test("I-01: the Owner renames the question, and the heading, the list, and the back link follow", async ({ board }) => {
  const page = await board.open("maya.chen");
  await openSettings(page);
  await expect(status(page)).toHaveText("The settings panel is open.");
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveValue(QUESTION);
  await expect(panel(page)).toContainText("Ask it neutrally, so each option can make its strongest case.");

  await field(page).fill(RENAMED);
  await field(page).press("Enter");

  await expect(heading(page)).toHaveText(RENAMED);
  await expect(status(page)).toHaveText("The question was renamed.");
  expect((await board.api("maya.chen").snapshot()).board.question).toBe(RENAMED);
  // The way back from New steelman names the board by its new question.
  await page.getByRole("link", { name: "New steelman" }).click();
  await expect(page.locator(".sm-back")).toContainText(RENAMED);
  await page.goto("/");
  await expect(page.getByRole("link", { name: RENAMED })).toBeVisible();
});

test("I-01: leaving the field saves the rename", async ({ board }) => {
  const page = await board.open("maya.chen");
  await openSettings(page);

  await field(page).fill(RENAMED);
  await panel(page).getByRole("button", { name: "Close settings" }).click();

  await expect(heading(page)).toHaveText(RENAMED);
  await expect.poll(async () => (await board.api("maya.chen").snapshot()).board.question).toBe(RENAMED);
});

test("I-01: a second reader sees the new question on the next poll, and History says who renamed it", async ({ board }) => {
  const page = await board.open("maya.chen");
  const other = await board.open("tess.b");
  await openSettings(page);
  await field(page).fill(RENAMED);
  await field(page).press("Enter");
  await expect(heading(page)).toHaveText(RENAMED);

  await poll(other);
  await expect(heading(other)).toHaveText(RENAMED);
  await other.getByRole("button", { name: "History" }).click();
  await expect(other.locator(".sm-history")).toContainText("maya.chen renamed the question.");
});

test("I-01: an empty question keeps the old one and says why", async ({ board }) => {
  const page = await board.open("maya.chen");
  await openSettings(page);

  await field(page).fill("   ");
  await field(page).press("Enter");

  await expect(panel(page)).toContainText("A steelman needs a question, so the old one stays.");
  await expect(field(page)).toHaveValue(QUESTION);
  await expect(heading(page)).toHaveText(QUESTION);
  expect((await board.api("maya.chen").snapshot()).board.question).toBe(QUESTION);
});

test("I-01: Escape keeps the old text, and Escape again closes the panel with the focus back on Settings", async ({ board }) => {
  const page = await board.open("maya.chen");
  await openSettings(page);

  await field(page).fill(RENAMED);
  await field(page).press("Escape");
  await expect(field(page)).toHaveValue(QUESTION);
  await expect(panel(page)).toBeVisible();

  await field(page).press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(settings(page)).toBeFocused();
  await expect(status(page)).toHaveText("The settings panel is closed.");
  await expect(heading(page)).toHaveText(QUESTION);
  expect((await board.api("maya.chen").snapshot()).board.question).toBe(QUESTION);
});

test("I-01: a rename that can't reach Steelman keeps the old heading and says so", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.route("**/question", (route) => route.abort("internetdisconnected"));
  await openSettings(page);

  await field(page).fill(RENAMED);
  await field(page).press("Enter");

  await expect(problem(page)).toContainText("Couldn’t reach Steelman. Try again.");
  await expect(heading(page)).toHaveText(QUESTION);
});

test("I-01: a rename the service refuses keeps the old heading", async ({ board }) => {
  const page = await board.open("maya.chen");
  // The service's answer is replaced with a refusal, so no poll can take the panel away meanwhile.
  await page.route("**/question", (route) => route.fulfill({ status: 403, json: { status: "refused", reason: "not_allowed" } }));
  await openSettings(page);

  await field(page).fill(RENAMED);
  await field(page).press("Enter");

  await expect(problem(page)).toBeVisible();
  await expect(heading(page)).toHaveText(QUESTION);
  expect(board.errors.splice(0)).toEqual(["maya.chen: Failed to load resource: the server responded with a status of 403 (Forbidden)"]);
});

test("I-01, H-02: Sharing and access closes the panel and opens Share", async ({ board }) => {
  const page = await board.open("maya.chen");
  await openSettings(page);

  await panel(page).getByRole("button", { name: "Sharing and access" }).click();

  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "General access" })).toBeVisible();
});

test("I-01: Settings and History share one drawer, one at a time", async ({ board }) => {
  const page = await board.open("maya.chen");
  await openSettings(page);

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("dialog", { name: "History" })).toBeVisible();
  await expect(panel(page)).toHaveCount(0);

  await settings(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "History" })).toHaveCount(0);
});

test("I-01: an Editor, or anyone who isn't the Owner, has no Settings button", async ({ board }) => {
  await board.setRole("tess.b", "editor");
  const editor = await board.open("tess.b");
  await expect(editor.getByRole("button", { name: "History" })).toBeVisible();
  await expect(settings(editor)).toHaveCount(0);
});

test("I-01, M-04: keyboard only, the Owner opens Settings, renames, and closes it, reaching each control by name", async ({ board }) => {
  const page = await board.open("maya.chen");

  await tabTo(page, settings(page));
  await page.keyboard.press("Enter");
  await expect(field(page)).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(RENAMED);
  await page.keyboard.press("Enter");
  await expect(heading(page)).toHaveText(RENAMED);

  await tabTo(page, panel(page).getByRole("button", { name: "Sharing and access" }));
  await tabTo(page, panel(page).getByRole("button", { name: "Close settings" }));
  await page.keyboard.press("Enter");
  await expect(panel(page)).toHaveCount(0);
  await expect(settings(page)).toBeFocused();
});

test("I-01: at 375 px, History stays on the sharing pill's line with Settings beside it, as an icon named Settings", async ({ board }) => {
  const page = await board.open("maya.chen", { width: 375 });
  const history = page.getByRole("button", { name: "History" });
  const access = page.locator(".sm-head .sm-meta-pill");
  const [h, s, a] = [(await history.boundingBox())!, (await settings(page).boundingBox())!, (await access.boundingBox())!];

  for (const box of [h, s]) expect(Math.abs(box.y + box.height / 2 - (a.y + a.height / 2))).toBeLessThan(6);
  expect(s.x).toBeGreaterThan(h.x + h.width - 1);
  await expect(history.getByText("History")).toBeVisible();
  await expect(settings(page).getByText("Settings")).toBeHidden();
  await expect(settings(page)).toHaveAttribute("data-tooltip", "Settings");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("I-01: at 1280 px, Settings says its name in words, with no hint box to repeat it", async ({ board }) => {
  const page = await board.open("maya.chen");
  await expect(settings(page).getByText("Settings")).toBeVisible();
  await expect(settings(page)).not.toHaveAttribute("data-tooltip");
});

test("I-01: an Owner who stops being the Owner while the panel is open loses it, and the board takes its room back", async ({ board }) => {
  const page = await board.open("maya.chen");
  await openSettings(page);

  await board.setRole("maya.chen", "editor");
  await poll(page);

  await expect(panel(page)).toHaveCount(0);
  await expect(settings(page)).toHaveCount(0);
  await expect(page.locator(".sm-scene")).not.toHaveClass(/sm-with-drawer/);
});

for (const width of [1280, 375]) {
  test(`I-01, M-04: with the settings panel open, the board passes an accessibility scan at ${width} px with no sideways scroll`, async ({ board }) => {
    const page = await board.open("maya.chen", { width });
    await openSettings(page);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
