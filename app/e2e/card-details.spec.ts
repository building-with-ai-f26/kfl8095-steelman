// Card details (M1-9), in the browser: an open card's evidence, the source
// form, the credibility meter, and assessing, in the prototype's markup
// (evidenceContent and sourceForm in docs/prototype/source/steelman-refined.html).
// Sources are added through the API where a test only needs one to be there.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { find, poll } from "./support/screen.ts";
import type { DemoPerson } from "../server/src/demo-board.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const STAFF = "Staff need a guaranteed day off.";

const SURVEY = { name: "Shift work survey, 2024", locator: "https://example.org/shift-work", finding: "Four in ten shift workers have Sunday as their only day off." };

/** A wording's card, wherever it is on the board. */
const card = (page: Page, wording: string): Locator => page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
/** Opens a card by its wording, as a reader does. */
const openCard = async (page: Page, wording: string) => {
  await card(page, wording).getByRole("button", { name: wording }).click();
  await expect(evidence(page, wording)).toBeVisible();
};
const evidence = (page: Page, wording: string): Locator => card(page, wording).getByRole("region", { name: "Evidence and its assessment" });
/** A source's row in an open card, by its name. */
const sourceRow = (page: Page, wording: string, name: string): Locator => evidence(page, wording).locator(".sm-source-row").filter({ has: page.locator("summary", { hasText: name }) });

/** Adds a source to a wording through the API, as `person`. */
async function addSource(board: TestBoard, person: DemoPerson, wording: string, fields: Partial<typeof SURVEY & { backsUp: string; limits: string }> = {}): Promise<string> {
  const id = board.ids.itemId();
  const { version } = await find(board, wording);
  await board.api(person).post(`versions/${version}/sources`, { id, ...SURVEY, backsUp: "", limits: "", ...fields });
  return id;
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.describe("evidence", () => {
  test("A-02, C-01: an open card lists its sources, with who added each; each opens to where to find it and what it shows", async ({ board }) => {
    await addSource(board, "maya.chen", LEAD);
    const page = await board.open("jordan_w");

    await expect(card(page, LEAD).getByRole("img", { name: "1 source" })).toBeVisible();
    await openCard(page, LEAD);
    await expect(evidence(page, LEAD).getByRole("heading", { name: "Evidence", exact: true })).toBeVisible();
    const row = sourceRow(page, LEAD, SURVEY.name);
    await expect(row.locator("summary")).toHaveText(`${SURVEY.name}maya.chen`);
    await expect(row.locator(".sm-source-packet")).toBeHidden();

    await row.locator("summary").click();

    await expect(row.getByText(SURVEY.finding)).toBeVisible();
    const link = row.getByRole("link", { name: SURVEY.locator });
    await expect(link).toHaveAttribute("href", SURVEY.locator);
    await expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow ugc");
    await expect(link).toHaveAttribute("target", "_blank");
  });

  test("C-01: what a source backs up and its limits aren't shown (the builder, Nov 14)", async ({ board }) => {
    await addSource(board, "maya.chen", LEAD, { backsUp: "That many people can only come on Sundays.", limits: "One city only." });
    const page = await board.open("jordan_w");
    await openCard(page, LEAD);
    const row = sourceRow(page, LEAD, SURVEY.name);
    await row.locator("summary").click();

    await expect(row.getByText(SURVEY.finding)).toBeVisible();
    await expect(row.getByText("One city only.")).toHaveCount(0);
    await expect(row.getByText("That many people can only come on Sundays.")).toHaveCount(0);
  });

  test("C-01: where to find it is text, not a link, unless it is an http or https address", async ({ board }) => {
    await addSource(board, "maya.chen", LEAD, { locator: "javascript:alert(1)" });
    await addSource(board, "maya.chen", LEAD, { name: "City budget, 2026", locator: "Chapter 3, page 41" });
    const page = await board.open("jordan_w");
    await openCard(page, LEAD);

    for (const [name, locator] of [
      [SURVEY.name, "javascript:alert(1)"],
      ["City budget, 2026", "Chapter 3, page 41"],
    ] as const) {
      const row = sourceRow(page, LEAD, name);
      await row.locator("summary").click();
      await expect(row.getByText(locator, { exact: true })).toBeVisible();
      await expect(row.getByRole("link")).toHaveCount(0);
    }
    await expect(card(page, LEAD).getByRole("img", { name: "2 sources" })).toBeVisible();
  });

  test("A-02, C-01: a card with no sources says so, and shows no count", async ({ board }) => {
    const page = await board.open("jordan_w");

    await expect(card(page, LEAD).locator(".sm-source-button")).toHaveCount(0);
    await openCard(page, LEAD);
    await expect(evidence(page, LEAD).getByText("No sources yet.")).toBeVisible();
  });

  test("C-01: a source you added is marked You, instead of your name", async ({ board }) => {
    await addSource(board, "jordan_w", LEAD);

    const mine = await board.open("jordan_w");
    await openCard(mine, LEAD);
    await expect(sourceRow(mine, LEAD, SURVEY.name).locator(".sm-you-tag")).toHaveText("You");
    await expect(sourceRow(mine, LEAD, SURVEY.name).locator("summary")).not.toContainText("jordan_w");

    const theirs = await board.open("tess.b");
    await openCard(theirs, LEAD);
    await expect(sourceRow(theirs, LEAD, SURVEY.name).locator(".sm-you-tag")).toHaveCount(0);
    await expect(sourceRow(theirs, LEAD, SURVEY.name).locator("summary")).toContainText("jordan_w");
  });

  test("C-01, M-01: a source someone else adds shows in an open card with the next poll", async ({ board }) => {
    const page = await board.open("jordan_w");
    await openCard(page, LEAD);
    await expect(evidence(page, LEAD).getByText("No sources yet.")).toBeVisible();

    await addSource(board, "maya.chen", LEAD);
    await poll(page);

    await expect(sourceRow(page, LEAD, SURVEY.name)).toBeVisible();
    await expect(card(page, LEAD).getByRole("img", { name: "1 source" })).toBeVisible();
  });

  for (const width of [1280, 375]) {
    test(`C-01, M-04: an open card with an open source passes an accessibility scan at ${width === 1280 ? "desktop width" : "375 width"}`, async ({ board }) => {
      await addSource(board, "maya.chen", STAFF);
      const page = await board.open("jordan_w", { width });
      if (width === 375) await page.getByRole("tab", { name: /^No/ }).click();
      await openCard(page, STAFF);
      await sourceRow(page, STAFF, SURVEY.name).locator("summary").click();

      await expectNoAxeViolations(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});

test.describe("the source form", () => {
  const form = (page: Page) => page.getByRole("form", { name: /source$/ });
  const field = (page: Page, label: string | RegExp) => form(page).getByLabel(label);
  const fill = async (page: Page, fields: { name?: string; locator?: string; finding?: string }) => {
    if (fields.locator !== undefined) await field(page, "Link").fill(fields.locator);
    if (fields.name !== undefined) await field(page, "Title").fill(fields.name);
    if (fields.finding !== undefined) await field(page, /^Description/).fill(fields.finding);
  };
  const problem = (page: Page) => form(page).getByRole("alert");
  /** Assesses a wording through the API, as `person`, at its current revision. */
  const assessNo = async (board: TestBoard, person: DemoPerson, wording: string) => {
    const { version, rev } = await find(board, wording);
    await board.api(person).put(`versions/${version}/assessment`, { rev, supported: false });
  };

  test("C-01: Add a source asks for a link, a title, and a description, in that order; the new source arrives open, marked You", async ({ board }) => {
    const page = await board.open("jordan_w");
    await openCard(page, LEAD);

    await evidence(page, LEAD).getByRole("button", { name: "Add a source" }).click();
    await expect(form(page)).toHaveAccessibleName("Add a source");
    await expect(form(page).locator("label")).toHaveText(["Link", "Title", "Description (optional)"]);
    await expect(field(page, "Link")).toHaveAttribute("type", "url");
    await expect(field(page, "Link")).toBeFocused();
    await fill(page, SURVEY);
    await form(page).getByRole("button", { name: "Add source" }).click();

    const row = sourceRow(page, LEAD, SURVEY.name);
    await expect(row.locator(".sm-you-tag")).toHaveText("You");
    await expect(row).toHaveAttribute("open", "");
    await expect(row.locator("summary")).toBeFocused();
    await expect(row.getByRole("link", { name: SURVEY.locator })).toBeVisible();
    await expect(form(page)).toHaveCount(0);
    await expect(card(page, LEAD).getByRole("img", { name: "1 source" })).toBeVisible();
    await expect(page.locator("#sm-status")).toHaveText("Source added. It is open below so you can check it.");
    expect((await board.api("maya.chen").snapshot()).sources).toEqual([expect.objectContaining({ ...SURVEY, backsUp: "", limits: "" })]);
  });

  test("C-01: a source needs a link and a title; nothing is sent without them", async ({ board }) => {
    const page = await board.open("jordan_w");
    await openCard(page, LEAD);
    await evidence(page, LEAD).getByRole("button", { name: "Add a source" }).click();

    await fill(page, { finding: "Page 12." });
    await form(page).getByRole("button", { name: "Add source" }).click();

    await expect(field(page, "Link")).toHaveAttribute("aria-invalid", "true");
    await expect(field(page, "Title")).toHaveAttribute("aria-invalid", "true");
    await expect(field(page, /^Description/)).not.toHaveAttribute("aria-invalid", "true");
    await expect(field(page, "Link")).toBeFocused();
    await expect(problem(page)).toHaveText("Add a link and a title.");
    expect((await board.api("maya.chen").snapshot()).sources).toEqual([]);
  });

  test("C-01: the link must be a web address, starting with http:// or https://", async ({ board }) => {
    const page = await board.open("jordan_w");
    await openCard(page, LEAD);
    await evidence(page, LEAD).getByRole("button", { name: "Add a source" }).click();

    await fill(page, { locator: "javascript:alert(1)", name: SURVEY.name });
    await form(page).getByRole("button", { name: "Add source" }).click();

    await expect(field(page, "Link")).toHaveAttribute("aria-invalid", "true");
    await expect(field(page, "Title")).not.toHaveAttribute("aria-invalid", "true");
    await expect(problem(page)).toHaveText("Links start with http:// or https://.");
    expect((await board.api("maya.chen").snapshot()).sources).toEqual([]);

    await fill(page, { locator: SURVEY.locator });
    await form(page).getByRole("button", { name: "Add source" }).click();
    await expect(sourceRow(page, LEAD, SURVEY.name)).toBeVisible();
  });

  test("C-01: the description is optional", async ({ board }) => {
    const page = await board.open("jordan_w");
    await openCard(page, LEAD);
    await evidence(page, LEAD).getByRole("button", { name: "Add a source" }).click();

    await fill(page, { locator: SURVEY.locator, name: SURVEY.name });
    await form(page).getByRole("button", { name: "Add source" }).click();

    const row = sourceRow(page, LEAD, SURVEY.name);
    await expect(row.getByRole("link", { name: SURVEY.locator })).toBeVisible();
    await expect(row.locator(".sm-source-packet p")).toHaveCount(0);
  });

  test("C-01: Cancel and Escape close the form, and the cursor goes back to Add a source", async ({ board }) => {
    const page = await board.open("jordan_w");
    await openCard(page, LEAD);
    const add = evidence(page, LEAD).getByRole("button", { name: "Add a source" });

    await add.click();
    await form(page).getByRole("button", { name: "Cancel" }).click();
    await expect(form(page)).toHaveCount(0);
    await expect(add).toBeFocused();

    await add.click();
    await page.keyboard.press("Escape");
    await expect(form(page)).toHaveCount(0);
    await expect(add).toBeFocused();
  });

  test("B-03, C-01: the form warns that the credibility score resets when you save", async ({ board }) => {
    await assessNo(board, "tess.b", LEAD);
    const page = await board.open("jordan_w");
    await openCard(page, LEAD);

    await evidence(page, LEAD).getByRole("button", { name: "Add a source" }).click();

    await expect(form(page).getByRole("note")).toHaveText("The credibility score resets when you save.");
  });

  test("B-03, C-01: editing a source cited on several assessed wordings says how many scores reset", async ({ board }) => {
    const id = await addSource(board, "jordan_w", LEAD);
    await board.api("jordan_w").put(`versions/${(await find(board, STAFF)).version}/sources/${id}`, {});
    await assessNo(board, "tess.b", LEAD);
    await assessNo(board, "tess.b", STAFF);
    const page = await board.open("jordan_w");
    await openCard(page, LEAD);
    const row = sourceRow(page, LEAD, SURVEY.name);
    await row.locator("summary").click();

    await row.getByRole("button", { name: "Edit" }).click();

    await expect(form(page).getByRole("note")).toHaveText("Credibility scores reset on 2 wordings when you save.");
  });

  test("C-01: a form on a wording nobody has assessed gives no warning", async ({ board }) => {
    const page = await board.open("jordan_w");
    await openCard(page, LEAD);

    await evidence(page, LEAD).getByRole("button", { name: "Add a source" }).click();

    await expect(form(page).getByRole("note")).toHaveCount(0);
  });

  test("C-01: Edit, on your own source, opens the form filled in; Save source changes it", async ({ board }) => {
    await addSource(board, "jordan_w", LEAD);
    const page = await board.open("jordan_w");
    await openCard(page, LEAD);
    const row = sourceRow(page, LEAD, SURVEY.name);
    await row.locator("summary").click();

    await row.getByRole("button", { name: "Edit" }).click();
    await expect(form(page)).toHaveAccessibleName("Edit source");
    await expect(field(page, "Title")).toHaveValue(SURVEY.name);
    await expect(field(page, "Link")).toHaveValue(SURVEY.locator);
    await fill(page, { finding: "Four in ten shift workers, in one city, have Sunday as their only day off." });
    await form(page).getByRole("button", { name: "Save source" }).click();

    await expect(row.getByText("Four in ten shift workers, in one city, have Sunday as their only day off.")).toBeVisible();
    await expect(row.locator("summary")).toBeFocused();
    await expect(page.locator("#sm-status")).toHaveText("Source updated.");
  });

  test("C-01: Remove, when the credibility score would reset, asks for a second click, then takes the source off this wording", async ({ board }) => {
    await addSource(board, "jordan_w", LEAD);
    await assessNo(board, "tess.b", LEAD);
    const page = await board.open("jordan_w");
    await openCard(page, LEAD);
    const row = sourceRow(page, LEAD, SURVEY.name);
    await row.locator("summary").click();

    await row.getByRole("button", { name: "Remove from this version" }).click();
    const armed = row.getByRole("button", { name: "Remove: the credibility score resets" });
    await expect(armed).toBeFocused();
    await expect(armed).toHaveText("Remove · credibility score resets");
    await expect(page.locator("#sm-status")).toHaveText("Removing this source resets the credibility score. Click Remove again to confirm.");
    await armed.click();

    await expect(evidence(page, LEAD).getByText("No sources yet.")).toBeVisible();
    await expect(evidence(page, LEAD).getByRole("button", { name: "Add a source" })).toBeFocused();
    await expect(page.locator("#sm-status")).toHaveText("Source removed from this version; its credibility score resets.");
  });

  test("C-01: Edit is only on your own source; Remove is also there for the wording's author and the Owner", async ({ board }) => {
    await addSource(board, "jordan_w", STAFF); // Omar wrote the wording; Maya owns the board
    const seen: Record<string, [boolean, boolean]> = {};
    for (const person of ["jordan_w", "omar_h", "maya.chen", "tess.b"] as const) {
      const page = await board.open(person);
      await openCard(page, STAFF);
      const row = sourceRow(page, STAFF, SURVEY.name);
      await row.locator("summary").click();
      seen[person] = [await row.getByRole("button", { name: "Edit" }).isVisible(), await row.getByRole("button", { name: /^Remove/ }).isVisible()];
    }
    expect(seen).toEqual({ jordan_w: [true, true], omar_h: [false, true], "maya.chen": [false, true], "tess.b": [false, false] });
  });

  for (const width of [1280, 375]) {
    test(`C-01, M-04: the source form passes an accessibility scan at ${width === 1280 ? "desktop width" : "375 width"}`, async ({ board }) => {
      await assessNo(board, "tess.b", STAFF);
      const page = await board.open("jordan_w", { width });
      if (width === 375) await page.getByRole("tab", { name: /^No/ }).click();
      await openCard(page, STAFF);
      await evidence(page, STAFF).getByRole("button", { name: "Add a source" }).click();
      await form(page).getByRole("button", { name: "Add source" }).click();

      await expectNoAxeViolations(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});

test.describe("assessing", () => {
  /** The yes/no question in an open card. */
  const question = (page: Page, wording: string) => evidence(page, wording).getByRole("group", { name: "Does the evidence back this wording?" });
  /** A card by its version's ID, which stays put when its wording changes. */
  const cardOf = (page: Page, version: string) => page.locator(`.sm-card[data-card="${version}"]`);
  const meter = (scope: Locator) => scope.locator(".sm-card-meta .sm-cred");
  const assess = async (board: TestBoard, person: DemoPerson, wording: string, supported: boolean) => {
    const { version, rev } = await find(board, wording);
    await board.api(person).put(`versions/${version}/assessment`, { rev, supported });
  };

  test("B-03: an open card asks whether the evidence backs the wording; Yes needs a source, No doesn't", async ({ board }) => {
    const page = await board.open("jordan_w");
    await openCard(page, STAFF);

    await expect(question(page, STAFF).getByRole("button", { name: "Yes" })).toBeDisabled();
    await expect(question(page, STAFF).getByRole("button", { name: "No" })).toBeEnabled();
    await expect(question(page, STAFF).getByRole("button", { name: "Undo" })).toHaveCount(0);
  });

  test("B-03, B-04: an assessment fills the meter at once and is kept; No switches it; Undo withdraws it", async ({ board }) => {
    await addSource(board, "maya.chen", LEAD);
    const page = await board.open("jordan_w");
    await openCard(page, LEAD);
    const yes = question(page, LEAD).getByRole("button", { name: "Yes" });
    const no = question(page, LEAD).getByRole("button", { name: "No" });

    await yes.click();
    await expect(yes).toHaveAttribute("aria-pressed", "true");
    await expect(meter(card(page, LEAD))).toHaveAccessibleName("100% supported as worded; 1 of 1 assessments; few assessments");

    await page.reload(); // the address names the open card, so it opens again
    await expect(yes).toHaveAttribute("aria-pressed", "true");

    await no.click();
    await expect(no).toHaveAttribute("aria-pressed", "true");
    await expect(yes).toHaveAttribute("aria-pressed", "false");
    await expect(meter(card(page, LEAD))).toHaveAccessibleName("0% supported as worded; 0 of 1 assessments; few assessments");

    await question(page, LEAD).getByRole("button", { name: "Undo" }).click();
    await expect(no).toHaveAttribute("aria-pressed", "false");
    await expect(meter(card(page, LEAD))).toHaveAccessibleName("Unreviewed; no assessments");
    await expect(question(page, LEAD).getByRole("button", { name: "Undo" })).toHaveCount(0);
    await expect(no).toBeFocused();
  });

  test("B-03, B-04, M-02: with two people, an edit in one browser resets the meter in the other", async ({ board }) => {
    await addSource(board, "jordan_w", LEAD);
    const tess = await board.open("tess.b");
    await openCard(tess, LEAD);
    await question(tess, LEAD).getByRole("button", { name: "Yes" }).click();
    await expect(meter(card(tess, LEAD))).toHaveAccessibleName(/^100% supported/);

    const jordan = await board.open("jordan_w");
    await openCard(jordan, LEAD);
    const row = sourceRow(jordan, LEAD, SURVEY.name);
    await row.locator("summary").click();
    await row.getByRole("button", { name: "Edit" }).click();
    await jordan.getByRole("form", { name: "Edit source" }).getByLabel("Link").fill("https://example.org/shift-work-2025");
    await jordan.getByRole("button", { name: "Save source" }).click();
    await expect(meter(card(jordan, LEAD))).toHaveAccessibleName("Unreviewed; no assessments");

    await poll(tess);
    await expect(meter(card(tess, LEAD))).toHaveAccessibleName("Unreviewed; no assessments");
    await expect(question(tess, LEAD).getByRole("button", { name: "Yes" })).toHaveAttribute("aria-pressed", "false");
  });

  test("B-03: a source edit resets every card citing it", async ({ board }) => {
    const id = await addSource(board, "jordan_w", LEAD);
    await board.api("jordan_w").put(`versions/${(await find(board, STAFF)).version}/sources/${id}`, {});
    await assess(board, "tess.b", LEAD, true);
    await assess(board, "tess.b", STAFF, false);
    const page = await board.open("jordan_w");
    await expect(meter(card(page, LEAD))).toHaveAccessibleName(/^100% supported/);
    await expect(meter(card(page, STAFF))).toHaveAccessibleName(/^0% supported/);
    await openCard(page, LEAD);
    const row = sourceRow(page, LEAD, SURVEY.name);
    await row.locator("summary").click();

    await row.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("form", { name: "Edit source" }).getByLabel(/^Description/).fill("Three in ten, not four.");
    await page.getByRole("button", { name: "Save source" }).click();

    await expect(meter(card(page, LEAD))).toHaveAccessibleName("Unreviewed; no assessments");
    await expect(meter(card(page, STAFF))).toHaveAccessibleName("Unreviewed; no assessments");
  });

  test("B-03: an assessment of a wording that changed meanwhile isn't counted; the card says so and shows the new wording", async ({ board }) => {
    await addSource(board, "jordan_w", LEAD);
    const { version, rev } = await find(board, LEAD);
    const page = await board.open("tess.b");
    await openCard(page, LEAD);
    const EDITED = "Sunday is the only free day for most people who work weekdays.";
    await board.api("maya.chen").put(`versions/${version}`, { baseRev: rev, wording: EDITED, context: "" });

    await question(page, LEAD).getByRole("button", { name: "Yes" }).click();

    const here = cardOf(page, version);
    await expect(here.locator(".sm-claim")).toHaveText(EDITED);
    await expect(here.getByText("This wording changed; take another look.")).toBeVisible();
    await expect(meter(here)).toHaveAccessibleName("Unreviewed; no assessments");
    const yes = here.getByRole("group", { name: "Does the evidence back this wording?" }).getByRole("button", { name: "Yes" });
    await expect(yes).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#sm-status")).toHaveText("This wording changed; take another look.");
    // The refusal is the service's answer, and the browser logs it; nothing else may be.
    expect(board.errors.splice(0)).toEqual(["tess.b: Failed to load resource: the server responded with a status of 409 (Conflict)"]);
    await expectNoAxeViolations(page);

    await yes.click();
    await expect(yes).toHaveAttribute("aria-pressed", "true");
    await expect(here.getByText("This wording changed; take another look.")).toHaveCount(0);
    await expect(meter(here)).toHaveAccessibleName(/^100% supported/);
  });
});
