// The tour (L-02, M2-9): the prototype's tour of the three votes, on the
// real board's cards. The page dims around the cards it points at, with a
// short note beside them: importance on the board's top argument,
// articulation on the argument with the most wordings (its row unfolded),
// and evidence on the wording with the most assessments. Skip, Back, and the
// arrow keys and Escape; shown once per account, on any device, and taken
// again from Your account.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { OpenOptions, TestBoard } from "./support/board.ts";

test.use({ tour: true });

const QUESTION = "Should our library open on Sundays?";
const TOP = "Sunday is the only free day for many people who work weekdays.";
const SECOND = "Shift workers can only come on Sundays.";

const note = (page: Page) => page.getByRole("dialog");
const status = (page: Page) => page.locator("#sm-status");
const card = (page: Page, wording: string) => page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) });

/** Opens a page at this address and waits for the board to have asked whether the account has seen the tour, so the tour's absence means something. */
async function openAsked(board: TestBoard, person: Parameters<TestBoard["open"]>[0], at: string, options: OpenOptions = {}): Promise<Page> {
  let answered: Promise<unknown> = Promise.resolve();
  const page = await board.open(person, {
    ...options,
    at,
    prepare: async (context) => {
      answered = context.waitForEvent("response", (response) => new URL(response.url()).pathname === "/api/account/tour" && response.request().method() === "GET");
    },
  });
  await answered;
  return page;
}

/** Waits until the spotlight's hole frames the element (it glides from step to step). */
async function expectFramed(page: Page, target: Locator) {
  await expect
    .poll(async () => {
      const hole = await page.locator(".sm-tour-hole").boundingBox();
      const box = await target.boundingBox();
      if (!hole || !box) return false;
      return hole.x <= box.x + 1 && hole.y <= box.y + 1 && hole.x + hole.width >= box.x + box.width - 1 && hole.y + hole.height >= box.y + box.height - 1;
    })
    .toBe(true);
}

/** Once the spotlight has settled on something else, checks it doesn't frame this element too: only the vote is framed, not the card. */
async function expectNotFramed(page: Page, target: Locator) {
  const hole = (await page.locator(".sm-tour-hole").boundingBox())!;
  const box = (await target.boundingBox())!;
  expect(hole.x <= box.x + 1 && hole.y <= box.y + 1 && hole.x + hole.width >= box.x + box.width - 1 && hole.y + hole.height >= box.y + box.height - 1).toBe(false);
}

test("L-02: on a first board, the tour frames each vote on the real cards: importance, articulation with the row unfolded, then evidence; Done ends it", async ({ board }) => {
  const page = await board.open("tess.b");

  await expect(note(page)).toHaveAccessibleName("Importance");
  await expect(note(page)).toContainText("Step 1 of 3");
  await expect(note(page)).toContainText("Vote on how much this argument matters, assuming it's true.");
  await expect(status(page)).toHaveText("The tour has started.");
  await expectFramed(page, page.getByRole("group", { name: `Importance: ${TOP.slice(0, 40)}` }));
  await expectNotFramed(page, card(page, TOP).locator(".sm-claim"));
  await expect(note(page).getByRole("button", { name: "Next" })).toBeFocused();

  await note(page).getByRole("button", { name: "Next" }).click();
  await expect(note(page)).toHaveAccessibleName("Articulation");
  await expect(note(page)).toContainText("Vote on which wording states this argument best.");
  await expect(page.locator(".sm-idea.sm-open .sm-claim")).toHaveText([TOP, SECOND]);
  await expectFramed(page, page.locator(".sm-idea.sm-open [data-vote-for]").first());
  await expectFramed(page, page.locator(".sm-idea.sm-open [data-vote-for]").nth(1));
  await expectNotFramed(page, card(page, TOP).locator(".sm-claim"));

  await note(page).getByRole("button", { name: "Next" }).click();
  await expect(note(page)).toHaveAccessibleName("Evidence");
  await expect(note(page)).toContainText("Vote on whether the linked sources support this specific wording.");
  await expect(page.locator(".sm-idea.sm-open")).toHaveCount(0);
  await expectFramed(page, card(page, TOP).locator(".sm-cred-group"));
  await expectNotFramed(page, card(page, TOP).locator(".sm-claim"));

  await note(page).getByRole("button", { name: "Done" }).click();
  await expect(note(page)).toHaveCount(0);
  await expect(page.locator(".sm-tour")).toBeHidden();
  await expect(status(page)).toHaveText("You finished the tour.");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
});

test("L-02: the evidence step points at the wording with the most assessments, and frames only its evidence vote", async ({ board }) => {
  const OTHER = "Staff need a guaranteed day off.";
  const versionOf = async () => (await board.api("omar_h").snapshot()).versions.find((v: { wording: string }) => v.wording === OTHER);
  await board.api("omar_h").post(`versions/${(await versionOf()).id}/sources`, { id: board.ids.itemId(), name: "Staff rota, 2025", locator: "", finding: "Every current shift pattern gives each person one fixed day off.", backsUp: "", limits: "" });
  // Citing a source makes a new revision, which is the one assessed.
  const other = await versionOf();
  await board.api("jordan_w").put(`versions/${other.id}/assessment`, { rev: other.rev, supported: true });
  await board.api("lin.zhao").put(`versions/${other.id}/assessment`, { rev: other.rev, supported: false });
  const page = await board.open("tess.b");
  await expect(note(page)).toHaveAccessibleName("Importance");

  await page.keyboard.press("ArrowRight");
  await expect(note(page)).toHaveAccessibleName("Articulation");
  await page.keyboard.press("ArrowRight");

  await expect(note(page)).toHaveAccessibleName("Evidence");
  await expectFramed(page, card(page, OTHER).locator(".sm-cred-group"));
  await expectNotFramed(page, card(page, OTHER).locator(".sm-claim"));
});

test("L-02: Back returns to the step before, and the first step has none", async ({ board }) => {
  const page = await board.open("tess.b");
  await expect(note(page)).toHaveAccessibleName("Importance");
  await expect(note(page).getByRole("button", { name: "Back" })).toHaveCount(0);

  await note(page).getByRole("button", { name: "Next" }).click();
  await note(page).getByRole("button", { name: "Back" }).click();

  await expect(note(page)).toHaveAccessibleName("Importance");
  await expect(page.locator(".sm-idea.sm-open")).toHaveCount(0);
});

test("L-02, M-04: the right arrow goes on, the left goes back, Escape skips, and Tab stays in the note", async ({ board }) => {
  const page = await board.open("tess.b");
  await expect(note(page)).toHaveAccessibleName("Importance");

  await page.keyboard.press("ArrowRight");
  await expect(note(page)).toHaveAccessibleName("Articulation");
  await expect(note(page).getByRole("button", { name: "Next" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(note(page)).toHaveAccessibleName("Importance");

  await page.keyboard.press("ArrowRight");
  for (const name of ["Skip tour", "Back", "Next", "Skip tour"]) {
    await page.keyboard.press("Tab");
    await expect(note(page).getByRole("button", { name })).toBeFocused();
  }

  await page.keyboard.press("Escape");
  await expect(note(page)).toHaveCount(0);
  await expect(status(page)).toHaveText("You closed the tour. You can start it again from Your account.");
  await expect(page.locator(".sm-idea.sm-open")).toHaveCount(0);
});

test("L-02: while the tour is open, the board under it waits: a click outside the note does nothing", async ({ board }) => {
  const page = await board.open("tess.b");
  await expect(note(page)).toBeVisible();

  await card(page, TOP).locator(".sm-claim-button").click({ force: true });

  await expect(card(page, TOP).locator(".sm-claim-button")).toHaveAttribute("aria-expanded", "false");
  await expect(note(page)).toHaveAccessibleName("Importance");
});

test("L-02: shown once per account: not again on that board, another board, or another device, even if it was never finished", async ({ board }) => {
  let marked: Promise<unknown> = Promise.resolve();
  const first = await board.open("tess.b", {
    prepare: async (context) => {
      marked = context.waitForEvent("response", (response) => new URL(response.url()).pathname === "/api/account/tour" && response.request().method() === "PUT");
    },
  });
  await expect(note(first)).toBeVisible();
  await marked;
  await first.context().close();

  const again = await openAsked(board, "tess.b", `/b/${board.demo.board}`);
  await expect(again.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  await expect(note(again)).toHaveCount(0);

  const other = await openAsked(board, "tess.b", `/b/${board.demo.board}`, { width: 375, touch: true });
  await expect(other.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  await expect(note(other)).toHaveCount(0);

  // Someone else still gets it on their first board.
  await expect(note(await board.open("lin.zhao"))).toBeVisible();
});

test("L-02: a board with nothing to point at shows no tour, and the account still gets it on the next board that has", async ({ board }) => {
  const { board: empty } = (await board.api("tess.b").post("../../boards", { question: "Should the café stay open late?", options: ["Yes", "No"] })) as { board: string };

  const page = await openAsked(board, "tess.b", `/b/${empty}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should the café stay open late?");
  await expect(note(page)).toHaveCount(0);

  await page.goto(`/b/${board.demo.board}`);
  await expect(note(page)).toHaveAccessibleName("Importance");
});

test("L-02: Your account's Start opens the tour again on your most recently changed board that has arguments", async ({ board }) => {
  const page = await board.open("tess.b");
  await note(page).getByRole("button", { name: "Skip tour" }).click();
  // A newer board with an argument, then a newer one still with none.
  const tess = board.api("tess.b");
  board.clock.advance(60_000);
  const { board: newer } = (await tess.post("../../boards", { question: "Should the café stay open late?", options: ["Yes", "No"] })) as { board: string };
  const options = ((await tess.get(`../${newer}`)) as { options: { id: string }[] }).options;
  await tess.post(`../${newer}/arguments`, { id: board.ids.itemId(), optionId: options[0]!.id, versionId: board.ids.itemId(), wording: "Evening shifts end after the café closes.", context: "" });
  board.clock.advance(60_000);
  await tess.post("../../boards", { question: "Should the gym open earlier?", options: ["Yes", "No"] });

  await page.goto("/account");
  await expect(page.locator(".sm-rrow", { hasText: "Tour" })).toContainText("Learn how voting works on a board.");
  await page.getByRole("link", { name: "Start" }).click();

  await expect(page).toHaveURL(`/b/${newer}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should the café stay open late?");
  await expect(note(page)).toHaveAccessibleName("Importance");
});

test("L-02: while the tour is open, the Update pill isn't drawn above it, so Update can't move the cards it points at", async ({ board }) => {
  const page = await board.open("tess.b");
  await expect(note(page)).toBeVisible();

  await expect(page.locator(".sm-fresh")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(page.locator(".sm-fresh")).toHaveCount(1);
});

test("L-02, M-04: with reduced motion, the spotlight jumps from step to step instead of gliding", async ({ board }) => {
  const page = await board.open("tess.b");
  const glide = () => page.locator(".sm-tour-hole").evaluate((hole) => getComputedStyle(hole).transitionDuration);
  await expect(note(page)).toBeVisible();
  expect(await glide()).not.toBe("0s");

  await page.emulateMedia({ reducedMotion: "reduce" });

  expect(await glide()).toBe("0s");
});

for (const width of [1280, 375]) {
  test(`L-02, M-04: no accessibility violations with the tour open, at ${width} px`, async ({ board }) => {
    const page = await board.open("tess.b", width === 375 ? { width, touch: true } : { width });
    await expect(note(page)).toHaveAccessibleName("Importance");
    await expectFramed(page, page.getByRole("group", { name: `Importance: ${TOP.slice(0, 40)}` }));

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
    await expect(page).toHaveScreenshot(`tour-${width === 375 ? "375" : "desktop"}.png`);
  });
}

test("L-02, M-03: on a phone, the articulation step frames the leading wording's vote, not its card", async ({ board }) => {
  const page = await board.open("tess.b", { width: 375, touch: true });
  await expect(note(page)).toBeVisible();

  await note(page).getByRole("button", { name: "Next" }).tap();

  await expect(note(page)).toHaveAccessibleName("Articulation");
  await expectFramed(page, page.locator(".sm-idea.sm-open [data-vote-for]").first());
  await expectNotFramed(page, card(page, TOP).locator(".sm-claim"));
  const box = (await note(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
});
