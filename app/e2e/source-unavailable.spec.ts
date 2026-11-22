// "Can't open it?" on the board (M3a-3; C-02), as the prototype's source row
// has it: a "Can't open it?" link in an open source, and "Undo report" for
// whoever reported it. As Wikipedia handles a dead link (Help:Archiving a
// source, read live Nov 22, plans/reviews/m3-design-audit.md), the source
// stays readable: "Try an archived copy" links to the Wayback Machine, and the
// note says who reported it and when, so a reader can judge how old the
// report is. An Editor or the Owner clears anyone's report.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { find, poll, status } from "./support/screen.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const STAFF = "Staff need a guaranteed day off.";
const SURVEY = { name: "Shift work survey, 2024", locator: "https://example.org/shift-work", finding: "Four in ten shift workers have Sunday as their only day off.", backsUp: "", limits: "" };

const card = (page: Page, wording: string): Locator => page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
const evidence = (page: Page, wording: string): Locator => card(page, wording).getByRole("region", { name: "Evidence and its assessment" });
const sourceRow = (page: Page, wording: string): Locator => evidence(page, wording).locator(".sm-source-row").filter({ has: page.locator("summary", { hasText: SURVEY.name }) });

async function openSource(page: Page, wording: string): Promise<Locator> {
  await card(page, wording).getByRole("button", { name: wording }).click();
  await expect(evidence(page, wording)).toBeVisible();
  const row = sourceRow(page, wording);
  await row.locator("summary").click();
  await expect(row).toHaveAttribute("open", "");
  return row;
}

/** Adds the survey to a wording through the API, as Maya. */
async function addSurvey(board: TestBoard, wording: string): Promise<string> {
  const id = board.ids.itemId();
  const { version } = await find(board, wording);
  await board.api("maya.chen").post(`versions/${version}/sources`, { id, ...SURVEY });
  return id;
}

test("M3a-3, C-02: Can’t open it? marks the source unavailable, says who and when, and offers an archived copy", async ({ board }) => {
  await addSurvey(board, LEAD);
  const page = await board.open("jordan_w");
  const row = await openSource(page, LEAD);

  await row.getByRole("button", { name: "Can’t open it?" }).click();

  await expect(row.locator("summary")).toContainText("Unavailable");
  await expect(row.getByText("You reported it on Nov 16, 2026.")).toBeVisible();
  await expect(row.getByRole("link", { name: "Try an archived copy" })).toHaveAttribute("href", "https://web.archive.org/web/https://example.org/shift-work");
  await expect(row.getByRole("button", { name: "Can’t open it?" })).toHaveCount(0);
  await expect(row.locator("summary")).toBeFocused();
  await expect(status(page)).toHaveText("You reported that this source can’t be opened. It shows as unavailable on every wording that cites it.");
  // Yes needs a source someone can open (PRD §4).
  await expect(evidence(page, LEAD).getByRole("button", { name: "Yes" })).toBeDisabled();
});

test("M3a-3, C-02: another reader sees the mark on every wording that cites the source, on their next poll", async ({ board }) => {
  const source = await addSurvey(board, LEAD);
  const { version } = await find(board, STAFF);
  await board.api("maya.chen").put(`versions/${version}/sources/${source}`, {});
  const other = await board.open("tess.b");
  const row = await openSource(other, STAFF);
  await expect(row.locator("summary")).not.toContainText("Unavailable");

  await board.api("jordan_w").put(`sources/${source}/unavailable`, {});
  await poll(other);

  await expect(row.locator("summary")).toContainText("Unavailable");
  await expect(row.getByText("jordan_w reported it on Nov 16, 2026.")).toBeVisible();
  // Only the reporter, an Editor, or the Owner clears it.
  await expect(row.getByRole("button", { name: /report/i })).toHaveCount(0);
});

test("M3a-3, C-02: the reporter takes it back with Undo report", async ({ board }) => {
  await addSurvey(board, LEAD);
  const page = await board.open("jordan_w");
  const row = await openSource(page, LEAD);
  await row.getByRole("button", { name: "Can’t open it?" }).click();
  await expect(row.locator("summary")).toContainText("Unavailable");

  await row.getByRole("button", { name: "Undo report" }).click();

  await expect(row.locator("summary")).not.toContainText("Unavailable");
  await expect(row.getByRole("link", { name: "Try an archived copy" })).toHaveCount(0);
  await expect(row.locator("summary")).toBeFocused();
  await expect(status(page)).toHaveText("You withdrew your report.");
  expect((await board.api("maya.chen").snapshot()).sources[0]).toMatchObject({ unavailable: false });
});

test("M3a-3, C-02, H-03: an Editor clears someone else’s report; a Viewer can report one", async ({ board }) => {
  const source = await addSurvey(board, LEAD);
  await board.setRole("lin.zhao", "viewer");
  const viewer = await board.open("lin.zhao");
  const row = await openSource(viewer, LEAD);
  await row.getByRole("button", { name: "Can’t open it?" }).click();
  await expect(row.locator("summary")).toContainText("Unavailable");

  await board.setRole("omar_h", "editor");
  const editor = await board.open("omar_h");
  const seen = await openSource(editor, LEAD);
  await seen.getByRole("button", { name: "Clear report" }).click();

  await expect(seen.locator("summary")).not.toContainText("Unavailable");
  await expect(status(editor)).toHaveText("You cleared the report, so the source shows as available.");
  expect((await board.api("maya.chen").snapshot()).sources.find((s: { id: string }) => s.id === source)).toMatchObject({ unavailable: false });
});

for (const width of [1280, 375]) {
  test(`M3a-3, M-04: an open source marked unavailable passes an accessibility scan, at ${width} px`, async ({ board }) => {
    const source = await addSurvey(board, LEAD);
    await board.api("jordan_w").put(`sources/${source}/unavailable`, {});
    const page = await board.open("maya.chen", { width });
    if (width === 375) await page.getByRole("tab", { name: /^Yes/ }).click();
    const row = await openSource(page, LEAD);
    await expect(row.getByRole("button", { name: "Clear report" })).toBeVisible();

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
