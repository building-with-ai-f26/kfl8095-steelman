// Phones (M-03, M2-10): the core loop at 375 px with a phone's touch and user
// agent, from signing in to Strongest case, tapping as a person would. After
// each screen, nothing scrolls sideways.

import type { Page } from "@playwright/test";
import { short } from "./support/screen.ts";
import { test as boardTest } from "./support/board.ts";
import { QUESTION, expect, test } from "./support/sign-in.ts";

const NEW_QUESTION = "Should our school start an hour later?";
const ARGUMENT = "Teenagers sleep later, so first lessons are wasted.";
const FAMILIES = "Families could visit together on the one day nobody has school or work.";
const REVISED = "Sunday is the one day a whole family is free to come together.";

/** The page is no wider than the screen: nothing scrolls sideways. */
async function expectNoSidewaysScroll(page: Page, where: string): Promise<void> {
  const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: window.innerWidth }));
  expect(widths.page, `${where}: the page is ${widths.page} px wide on a ${widths.screen} px screen`).toBeLessThanOrEqual(widths.screen);
}

test("M-03, L-01, F-01, A-01, A-05, B-01, B-02, C-01, B-03, E-01: the core loop on a phone, by touch, with nothing scrolling sideways", async ({ site }) => {
  const page = await site.browse({ phone: true });

  // Sign in, from a board's link.
  await page.goto(site.boardPath);
  await expectNoSidewaysScroll(page, "Sign in");
  await page.getByLabel("Email").fill("pat.phone@example.test");
  await page.getByRole("button", { name: "Email me a code" }).tap();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your email");
  await expectNoSidewaysScroll(page, "Check your email");
  await page.getByLabel("Code").fill(site.codeFor("pat.phone@example.test"));
  await page.getByRole("button", { name: "Sign in" }).tap();
  await page.getByLabel("Username").fill("pat_phone");
  await expectNoSidewaysScroll(page, "Choose a username");
  await page.getByRole("button", { name: "Continue" }).tap();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  await expectNoSidewaysScroll(page, "The board");

  // The account button is within reach on a board.
  await expect(page.getByRole("link", { name: "Your account" })).toBeInViewport();

  // Importance, on someone else's argument.
  const importance = page.getByRole("group", { name: `Importance: ${short(FAMILIES)}` });
  await importance.getByRole("button", { name: "More important if true" }).tap();
  await expect(importance.getByRole("button", { name: "More important if true" })).toHaveAttribute("aria-pressed", "true");

  // A wording of it, from its card's menu.
  const families = page.locator(".sm-card", { has: page.locator(".sm-claim", { hasText: FAMILIES }) }).first();
  await families.getByRole("button", { name: "Options for this version" }).tap();
  await page.getByRole("menuitem", { name: "Suggest a revised version" }).tap();
  const draft = page.getByRole("form", { name: "Suggest a version" });
  await draft.getByLabel("Your version", { exact: true }).fill(REVISED);
  await draft.getByLabel("What your version improves").fill("Says why Sunday.");
  await expectNoSidewaysScroll(page, "Suggesting a version");
  await draft.getByRole("button", { name: "Add your version" }).tap();
  const revised = page.locator(".sm-track .sm-card", { has: page.locator(".sm-claim", { hasText: REVISED }) });
  await expect(revised).toBeVisible();
  await expectNoSidewaysScroll(page, "A row of two wordings");

  // Articulation, on the new wording.
  const articulation = page.getByRole("group", { name: `Articulation: ${short(REVISED)}` });
  await articulation.getByRole("button", { name: "Better articulated" }).tap();
  await expect(articulation.getByRole("button", { name: "Better articulated" })).toHaveAttribute("aria-pressed", "true");

  // A source, then an assessment.
  await revised.getByRole("button", { name: REVISED }).tap();
  const evidence = revised.getByRole("region", { name: "Evidence and its assessment" });
  await evidence.getByRole("button", { name: "Add a source" }).tap();
  const form = page.getByRole("form", { name: /source$/ });
  await form.getByLabel("Link").fill("https://example.org/family-time");
  await form.getByLabel("Title").fill("Family time survey, 2024");
  await form.getByLabel(/^Description/).fill("Most parents say Sunday is the only day the whole family is free.");
  await expectNoSidewaysScroll(page, "Adding a source");
  await form.getByRole("button", { name: "Add source" }).tap();
  await expect(evidence.getByText("Family time survey, 2024")).toBeVisible();
  const backs = evidence.getByRole("group", { name: "Does the evidence back this wording?" });
  await backs.getByRole("button", { name: "Yes" }).tap();
  await expect(backs.getByRole("button", { name: "Yes" })).toHaveAttribute("aria-pressed", "true");
  await expectNoSidewaysScroll(page, "An open card");

  // Strongest case.
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Strongest case" }).tap();
  await expect(page.getByText(REVISED).or(page.getByText(FAMILIES)).first()).toBeVisible();
  await expectNoSidewaysScroll(page, "Strongest case");
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Board" }).tap();

  // New steelman, from the top bar, and an argument on it.
  await page.getByRole("link", { name: "New steelman" }).tap();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New steelman");
  await expectNoSidewaysScroll(page, "New steelman");
  await page.getByRole("textbox", { name: "Question" }).fill(NEW_QUESTION);
  await page.getByRole("textbox", { name: "Option 1" }).fill("Start later");
  await page.getByRole("textbox", { name: "Option 2" }).fill("Keep the time");
  await page.getByRole("button", { name: "Create steelman" }).tap();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NEW_QUESTION);
  await expectNoSidewaysScroll(page, "The new board");
  await page.getByRole("button", { name: "Add an argument for Start later" }).tap();
  await page.getByRole("textbox", { name: "Your argument", exact: true }).fill(ARGUMENT);
  await expectNoSidewaysScroll(page, "Adding an argument");
  await page.getByRole("button", { name: "Add your argument" }).tap();
  await expect(page.locator(".sm-card .sm-claim", { hasText: ARGUMENT })).toBeVisible();
  await page.getByRole("tab", { name: /^Keep the time/ }).tap();
  await expect(page.getByRole("button", { name: "Add an argument for Keep the time" })).toBeVisible();

  // Your account, and the privacy page.
  await page.getByRole("link", { name: "Your account" }).tap();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your account");
  await expectNoSidewaysScroll(page, "Your account");
  await page.goto("/privacy");
  await expectNoSidewaysScroll(page, "Privacy");
});

boardTest("M-03: at 375 px nothing scrolls sideways with Share open, a card's menu open, a deleted version's note, or a missing board", async ({ board }) => {
  const page = await board.open("maya.chen", { width: 375, missingBoards: true });

  await page.getByRole("button", { name: /^(Anyone with the link|Invited only)$/ }).click();
  await expect(page.getByRole("combobox", { name: "General access" })).toBeVisible();
  await expectNoSidewaysScroll(page, "Share");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Options for this version" }).first().click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expectNoSidewaysScroll(page, "A card's menu");
  await page.keyboard.press("Escape");

  await page.goto(`/b/${board.demo.board}/v/nosuchversion`);
  await expect(page.locator(".sm-link-note")).toHaveText(/That version was deleted\./);
  await expectNoSidewaysScroll(page, "A deleted version's note");

  await page.goto("/b/nosuchboard1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This steelman doesn’t exist");
  await expectNoSidewaysScroll(page, "A missing board");
});
