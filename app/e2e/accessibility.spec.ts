// M2-11, accessibility on every screen (M-04): the axe scan on each screen
// that had none at both widths before, at desktop width and at 375 px. The
// other screens are scanned in their own files: sign in (sign-in.spec.ts),
// the list (list.spec.ts), New steelman (new-steelman.spec.ts), the board
// folded and unfolded (screen.spec.ts), an open card and its sources
// (card-details.spec.ts), the card menu (card-menu.spec.ts), Share
// (sharing.spec.ts, people-list.spec.ts), moderation (moderation.spec.ts,
// reports.spec.ts), the tour (tour.spec.ts), and Your account with the
// analytics row (account-card.spec.ts).

import AxeBuilder from "@axe-core/playwright";
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";

const SIZES = [
  { name: "desktop", width: 1280 },
  { name: "375", width: 375 },
] as const;

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** A browser session nobody is signed in to, at the same service as the board's. */
async function signedOut(browser: Browser, origin: string, path: string, width: number): Promise<Page> {
  const context = await browser.newContext({ baseURL: origin, viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto(path);
  return page;
}

for (const size of SIZES) {
  test(`M2-11, M-04: Strongest case passes an accessibility scan at ${size.name} width`, async ({ board }) => {
    const page = await board.open("jordan_w", { width: size.width });
    await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Strongest case", exact: true }).click();
    await expect(page.getByRole("group", { name: "View" }).getByRole("button", { name: "Strongest case", exact: true })).toHaveAttribute("aria-pressed", "true");

    await expectNoAxeViolations(page);
  });

  test(`M2-11, M-04: Your account, with Delete account open, passes an accessibility scan at ${size.name} width`, async ({ board }) => {
    const page = await board.open("jordan_w", { width: size.width });
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "Delete account" }).click();
    await expect(page.getByRole("group", { name: "Delete your account?" })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test(`M2-11, M-04: the privacy page passes an accessibility scan, signed in and signed out, at ${size.name} width`, async ({ board, browser }) => {
    const page = await board.open("jordan_w", { width: size.width });
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
    await expectNoAxeViolations(page);

    const outside = await signedOut(browser, new URL(page.url()).origin, "/privacy", size.width);
    await expect(outside.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
    await expectNoAxeViolations(outside);
  });

  test(`M2-11, M-04: a page that doesn't exist passes an accessibility scan at ${size.name} width`, async ({ board }) => {
    const page = await board.open("jordan_w", { width: size.width });
    await page.goto("/no-such-page");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await expectNoAxeViolations(page);
  });
}

const TOP = "Sunday is the only free day for many people who work weekdays.";

test("M2-11, M-04: each vote is announced to screen readers, and so is taking it back", async ({ board }) => {
  const page = await board.open("jordan_w");
  const status = page.locator("#sm-status");
  const importance = page.getByRole("group", { name: `Importance: ${TOP.slice(0, 40)}` });

  await importance.getByRole("button", { name: "More important if true" }).click();
  await expect(status).toHaveText("You voted this argument more important.");
  await importance.getByRole("button", { name: "More important if true" }).click();
  await expect(status).toHaveText("You took back your importance vote.");
  await importance.getByRole("button", { name: "Less important if true" }).click();
  await expect(status).toHaveText("You voted this argument less important.");

  await page.getByRole("button", { name: "Compare 2 wordings of this argument" }).first().click();
  const articulation = page.getByRole("group", { name: `Articulation: ${TOP.slice(0, 40)}` });
  await articulation.getByRole("button", { name: "Better articulated" }).click();
  await expect(status).toHaveText("You voted this wording better articulated.");
  await articulation.getByRole("button", { name: "Better articulated" }).click();
  await expect(status).toHaveText("You took back your articulation vote.");
  await articulation.getByRole("button", { name: "Less well articulated" }).click();
  await expect(status).toHaveText("You voted this wording less well articulated.");
});

test("M2-11, M-04: the same announcement twice in a row still changes the status line, so a screen reader reads it again", async ({ board }) => {
  const page = await board.open("jordan_w");
  const status = page.locator("#sm-status");
  const first = page.getByRole("group", { name: `Importance: ${TOP.slice(0, 40)}` }).getByRole("button", { name: "Less important if true" });
  const second = page.getByRole("group", { name: "Importance: Students need a quiet place" }).getByRole("button", { name: "Less important if true" });

  await first.click();
  await expect(status).toHaveText("You voted this argument less important.");
  const before = await status.evaluate((element) => element.textContent);
  await second.click();
  await expect(second).toHaveAttribute("aria-pressed", "true");

  await expect(status).toHaveText("You voted this argument less important.");
  expect(await status.evaluate((element) => element.textContent)).not.toBe(before);
});

/** Presses Tab (or Shift+Tab) until the control has the focus, as someone using only a keyboard would. */
async function tabTo(page: Page, target: Locator, back = false): Promise<void> {
  await expect(target).toBeVisible();
  for (let presses = 0; presses < 200; presses++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(back ? "Shift+Tab" : "Tab");
  }
  throw new Error("Tab never reached the control");
}

/** Presses the down arrow until the menu item has the focus. */
async function arrowTo(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  for (let presses = 0; presses < 12; presses++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("ArrowDown");
  }
  throw new Error("The arrow keys never reached the menu item");
}

const FAMILIES = "Families could visit together on the one day nobody has school or work.";
const REVISED = "Sunday is the one day whole families are free together.";
const NEW_QUESTION = "Should the school day start later?";
const ARGUMENT = "Teenagers sleep better with a later start.";

test("M2-11, M-04: the core loop, with the keyboard alone: vote, suggest a wording, vote on it, add a source and assess it, Strongest case, then New steelman and an argument", async ({ board }) => {
  test.setTimeout(90_000);
  const page = await board.open("jordan_w");

  // Importance, on someone else's argument.
  const more = page.getByRole("group", { name: `Importance: ${FAMILIES.slice(0, 40)}` }).getByRole("button", { name: "More important if true" });
  await tabTo(page, more);
  // jordan_w may already have voted here in the demo data; pressing it then takes the vote back.
  const before = await more.getAttribute("aria-pressed");
  await page.keyboard.press("Space");
  await expect(more).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");

  // A wording of it, from its card's menu.
  const families = page.locator(".sm-card", { has: page.locator(".sm-claim", { hasText: FAMILIES }) }).first();
  await tabTo(page, families.getByRole("button", { name: "Options for this version" }));
  await page.keyboard.press("Enter");
  await arrowTo(page, page.getByRole("menuitem", { name: "Suggest a revised version" }));
  await page.keyboard.press("Enter");
  const draft = page.getByRole("form", { name: "Suggest a version" });
  await tabTo(page, draft.getByLabel("Your version", { exact: true }));
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(REVISED);
  await tabTo(page, draft.getByLabel("What your version improves"));
  await page.keyboard.type("Says who is free.");
  await tabTo(page, draft.getByRole("button", { name: "Add your version" }));
  await page.keyboard.press("Enter");
  const revised = page.locator(".sm-track .sm-card", { has: page.locator(".sm-claim", { hasText: REVISED }) });
  await expect(revised).toBeVisible();

  // Articulation, on the new wording.
  const better = page.getByRole("group", { name: `Articulation: ${REVISED.slice(0, 40)}` }).getByRole("button", { name: "Better articulated" });
  await tabTo(page, better);
  await page.keyboard.press("Space");
  await expect(better).toHaveAttribute("aria-pressed", "true");

  // A source, then an assessment.
  await tabTo(page, revised.getByRole("button", { name: REVISED }));
  await page.keyboard.press("Enter");
  const evidence = revised.getByRole("region", { name: "Evidence and its assessment" });
  await tabTo(page, evidence.getByRole("button", { name: "Add a source" }));
  await page.keyboard.press("Enter");
  const form = page.getByRole("form", { name: /source$/ });
  for (const [label, text] of [
    ["Link", "https://example.org/family-time"],
    ["Title", "Family time survey, 2024"],
  ] as const) {
    await tabTo(page, form.getByLabel(label));
    await page.keyboard.type(text);
  }
  await tabTo(page, form.getByLabel(/^Description/));
  await page.keyboard.type("Most parents say Sunday is the only day the whole family is free.");
  await tabTo(page, form.getByRole("button", { name: "Add source" }));
  await page.keyboard.press("Enter");
  await expect(evidence.getByText("Family time survey, 2024")).toBeVisible();
  const yes = evidence.getByRole("group", { name: "Does the evidence back this wording?" }).getByRole("button", { name: "Yes" });
  await tabTo(page, yes);
  await page.keyboard.press("Space");
  await expect(yes).toHaveAttribute("aria-pressed", "true");

  // Strongest case, and back.
  const strongest = page.getByRole("group", { name: "View" }).getByRole("button", { name: "Strongest case", exact: true });
  await tabTo(page, strongest, true);
  await page.keyboard.press("Enter");
  await expect(strongest).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: /^The case for / }).first()).toBeVisible();
  const boardView = page.getByRole("group", { name: "View" }).getByRole("button", { name: "Board", exact: true });
  await tabTo(page, boardView, true);
  await page.keyboard.press("Enter");
  await expect(boardView).toHaveAttribute("aria-pressed", "true");

  // New steelman, from the top bar, and an argument on it.
  await tabTo(page, page.getByRole("link", { name: "New steelman" }), true);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New steelman");
  for (const [name, text] of [
    ["Question", NEW_QUESTION],
    ["Option 1", "Start later"],
    ["Option 2", "Keep the time"],
  ] as const) {
    await tabTo(page, page.getByRole("textbox", { name }));
    await page.keyboard.type(text);
  }
  await tabTo(page, page.getByRole("button", { name: "Create steelman" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NEW_QUESTION);
  await tabTo(page, page.getByRole("button", { name: "Add an argument for Start later" }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("textbox", { name: "Your argument", exact: true }));
  await page.keyboard.type(ARGUMENT);
  await tabTo(page, page.getByRole("button", { name: "Add your argument" }));
  await page.keyboard.press("Enter");
  await expect(page.locator(".sm-card .sm-claim", { hasText: ARGUMENT })).toBeVisible();
});

test("M2-11, M-04: with reduced motion, nothing on the board moves: no transitions and no animations", async ({ board }) => {
  const page = await board.open("jordan_w");
  await page.getByRole("button", { name: "Compare 2 wordings of this argument" }).first().click();
  const movingNow = () =>
    page.evaluate(() =>
    [...document.querySelectorAll("#steelman-study *")]
      .map((element) => ({ element, style: getComputedStyle(element) }))
      .filter(({ style }) => style.transitionDuration.split(",").some((time) => parseFloat(time) > 0) || style.animationName !== "none")
      .map(({ element }) => element.className || element.tagName),
    );
  // Without the setting, things on the board do move, so the check below can find them.
  expect((await movingNow()).length).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await movingNow()).toEqual([]);
});
