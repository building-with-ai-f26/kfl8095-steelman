// What a role can't do, on the board (M2-2; H-03): controls a role can't use
// stay where they are, faded, and say why on hover or keyboard focus, in the
// prototype's words (WHY in docs/prototype/source/steelman-refined.html).
// Pressing one sends nothing. "Suggest a version" isn't offered at all to
// someone who can't write, as in the prototype. Roles are set straight in
// the database, since no screen sets every role yet.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { find } from "./support/screen.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const VOTE_WHY = "Voting and assessing evidence need “can vote” access.";
const WRITE_WHY = "Writing and editing need “can contribute” access.";

const SIZES = [
  { name: "desktop", width: 1280 },
  { name: "375", width: 375 },
] as const;

const card = (page: Page, wording: string): Locator => page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
const row = (page: Page, wording: string): Locator => page.locator(".sm-idea").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
const evidence = (page: Page, wording: string): Locator => card(page, wording).getByRole("region", { name: "Evidence and its assessment" });

/** Every request this page sends that would change something. */
function writesSent(page: Page): string[] {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && new URL(request.url()).pathname.startsWith("/api/boards/")) sent.push(`${request.method()} ${request.url()}`);
  });
  return sent;
}

/** A source on the lead wording, so Yes can be pressed by anyone who may assess. Maya adds it, unless `by` says who. */
async function citeSource(board: TestBoard, by: "maya.chen" | "jordan_w" = "maya.chen"): Promise<void> {
  const { version } = await find(board, LEAD);
  await board.api(by).post(`versions/${version}/sources`, {
    id: board.ids.itemId(),
    name: "Shift work survey, 2024",
    locator: "https://example.org/shift-work",
    finding: "Four in ten shift workers have Sunday as their only day off.",
    backsUp: "",
    limits: "",
  });
}

/** The controls this test looks at, on an open board with the lead card open. */
function controls(page: Page) {
  return {
    importance: row(page, LEAD).getByRole("button", { name: "More important if true" }),
    addArgument: page.getByRole("button", { name: "Add an argument for Yes" }),
    addSource: evidence(page, LEAD).getByRole("button", { name: "Add a source" }),
    yes: evidence(page, LEAD).getByRole("button", { name: "Yes", exact: true }),
    no: evidence(page, LEAD).getByRole("button", { name: "No", exact: true }),
  };
}

async function openLead(page: Page): Promise<void> {
  await card(page, LEAD).getByRole("button", { name: LEAD }).click();
  await expect(evidence(page, LEAD)).toBeVisible();
}

async function expectBlocked(control: Locator, why: string): Promise<void> {
  await expect(control).toHaveAttribute("aria-disabled", "true");
  await expect(control).toHaveAttribute("data-tooltip", why);
  await expect(control).toHaveAccessibleDescription(why);
}

async function expectOpen(control: Locator): Promise<void> {
  await expect(control).toBeVisible();
  await expect(control).not.toHaveAttribute("aria-disabled", "true");
}

test("H-03: a Viewer's votes, assessments, and writing are faded and say why; pressing them sends nothing", async ({ board }) => {
  await citeSource(board);
  await board.setRole("jordan_w", "viewer");
  const page = await board.open("jordan_w");
  const sent = writesSent(page);
  await openLead(page);
  const c = controls(page);

  for (const control of [c.importance, c.yes, c.no]) await expectBlocked(control, VOTE_WHY);
  for (const control of [c.addArgument, c.addSource]) await expectBlocked(control, WRITE_WHY);

  // Playwright won't press what's marked unavailable unless forced; a reader's click still lands on it.
  for (const control of [c.importance, c.yes, c.no, c.addArgument, c.addSource]) await control.click({ force: true });

  await expect(page.getByRole("form")).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(c.importance).toHaveAttribute("aria-pressed", "false");
  expect(sent).toEqual([]);
});

test("H-03: a Viewer's articulation votes are faded and say why, and no Suggest a version is offered", async ({ board }) => {
  await board.setRole("jordan_w", "viewer");
  const page = await board.open("jordan_w");
  const sent = writesSent(page);

  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();

  const better = row(page, LEAD).getByRole("button", { name: "Better articulated" }).first();
  await expectBlocked(better, VOTE_WHY);
  await better.click({ force: true });
  await expect(better).toHaveAttribute("aria-pressed", "false");
  await expect(row(page, LEAD).getByRole("button", { name: "Suggest a better version" })).toHaveCount(0);
  expect(sent).toEqual([]);
});

test("H-03: a Voter may vote and assess; writing is faded and says why, and no Suggest a version is offered", async ({ board }) => {
  await citeSource(board);
  await board.setRole("jordan_w", "voter");
  const page = await board.open("jordan_w");
  await openLead(page);
  const c = controls(page);

  for (const control of [c.importance, c.yes, c.no]) await expectOpen(control);
  for (const control of [c.addArgument, c.addSource]) await expectBlocked(control, WRITE_WHY);

  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await expectOpen(row(page, LEAD).getByRole("button", { name: "Better articulated" }).first());
  await expect(row(page, LEAD).getByRole("button", { name: "Suggest a better version" })).toHaveCount(0);
});

test("H-03: a Contributor sees nothing faded", async ({ board }) => {
  await citeSource(board);
  const page = await board.open("jordan_w");
  await openLead(page);
  const c = controls(page);

  for (const control of [c.importance, c.yes, c.no, c.addArgument, c.addSource]) await expectOpen(control);
  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await expectOpen(row(page, LEAD).getByRole("button", { name: "Suggest a better version" }));
  await expect(page.locator("[data-blocked]")).toHaveCount(0);
});

test("H-03: a faded control can still be reached with the keyboard, and Enter on it does nothing", async ({ board }) => {
  await board.setRole("jordan_w", "viewer");
  const page = await board.open("jordan_w");
  const sent = writesSent(page);
  const addArgument = controls(page).addArgument;

  await addArgument.focus();
  await page.keyboard.press("Enter");

  await expect(addArgument).toBeFocused();
  await expect(addArgument).toHaveAccessibleDescription(WRITE_WHY);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  expect(sent).toEqual([]);
});

test("H-03: someone who added a source and is now a Viewer sees its Edit faded, and Remove not offered", async ({ board }) => {
  await citeSource(board, "jordan_w");
  await board.setRole("jordan_w", "viewer");
  const page = await board.open("jordan_w");
  const sent = writesSent(page);
  await openLead(page);
  const source = evidence(page, LEAD).locator(".sm-source-row");
  await source.locator("summary").click();

  const edit = source.getByRole("button", { name: "Edit" });
  await expectBlocked(edit, WRITE_WHY);
  await expect(source.getByRole("button", { name: "Remove from this version" })).toHaveCount(0);
  await edit.click({ force: true });
  await expect(page.getByRole("textbox")).toHaveCount(0);
  expect(sent).toEqual([]);
});

for (const size of SIZES) {
  test(`H-03 M-04 A Viewer's board passes an accessibility scan and looks as saved at ${size.name} width`, async ({ board }) => {
    await board.setRole("jordan_w", "viewer");
    const page = await board.open("jordan_w", { width: size.width });

    const scan = async (where: string) => {
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`), where).toEqual([]);
    };
    await scan("folded");
    await expect(page).toHaveScreenshot(`board-viewer-${size.name}.png`, { fullPage: true });
    await openLead(page);
    await scan("with the card open");
    await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
    await scan("unfolded");
  });
}
