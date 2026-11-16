// M1-11, Strongest case (E-01): the Board / Strongest case switch. Each
// option's top three arguments in their best wording, with the meter,
// importance, and how many wordings each beat. It follows the newest shared
// order, even while the reader's board waits for Update (the builder's
// decision, Nov 15). Choosing one opens it on the board.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { TICK_MS, expect, test } from "./support/board.ts";
import { find, pill, poll, rows, status } from "./support/screen.ts";

const YES = [
  "Sunday is the only free day for many people who work weekdays.",
  "Students need a quiet place to study before Monday exams.",
  "Families could visit together on the one day nobody has school or work.",
];
const NO = ["Staff need a guaranteed day off.", "Opening a seventh day costs more than the budget allows.", "Few people would come, judging by Saturday afternoons."];

const view = (page: Page, name: "Board" | "Strongest case") => page.getByRole("group", { name: "View" }).getByRole("button", { name, exact: true });
const caseFor = (page: Page, option: string) => page.getByRole("region", { name: `The case for ${option}` });
const caseClaims = (page: Page, option: string) => caseFor(page, option).locator(".sm-case-card .sm-claim").allTextContents();

test("E-01 The switch: each option's top three arguments in their best wording, with importance and how many wordings each beat", async ({ board }) => {
  const reader = await board.open("jordan_w");
  await expect(view(reader, "Board")).toHaveAttribute("aria-pressed", "true");

  await view(reader, "Strongest case").click();
  await expect(view(reader, "Strongest case")).toHaveAttribute("aria-pressed", "true");
  await expect(view(reader, "Board")).toHaveAttribute("aria-pressed", "false");
  expect(await caseClaims(reader, "Yes")).toEqual(YES);
  expect(await caseClaims(reader, "No")).toEqual(NO);
  await expect(reader.locator("#steelman-study")).toHaveAttribute("data-zoom", "case");

  const first = caseFor(reader, "Yes").locator(".sm-case-item").first();
  await expect(first.locator(".sm-case-rank")).toHaveText("1");
  await expect(first.getByTitle("Importance: 3 net votes")).toHaveText("Importance: 3");
  await expect(first.getByTitle("The best-articulated of 2 wordings")).toHaveText("best of 2 wordings");
  await expect(first.locator(".sm-meter, .sm-cred").first()).toBeVisible();
  // One wording beats nobody, so it says nothing about wordings.
  await expect(
    caseFor(reader, "Yes")
      .locator(".sm-case-item")
      .nth(1)
      .getByTitle(/best-articulated/),
  ).toHaveCount(0);
  await expect(caseFor(reader, "Yes").locator(".sm-case-caption")).toHaveText("Its 3 most important arguments, in the best wording");
  await expect(status(reader)).toHaveText("Strongest case: each option’s most important arguments, in their best wording. Choose one to open it on the board.");
  const axe = await new AxeBuilder({ page: reader }).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

  await view(reader, "Board").click();
  await expect(view(reader, "Board")).toHaveAttribute("aria-pressed", "true");
  expect(await rows(reader, "Yes")).toEqual(YES);
  await expect(status(reader)).toHaveText("Board.");
});

test("E-01 B-05 Follows the newest shared order, while the board on screen waits for Update", async ({ board }) => {
  const reader = await board.open("jordan_w");
  const families = await find(board, YES[2]!);
  for (const person of ["lin.zhao", "maya.chen", "tess.b"] as const) await board.api(person).put(`arguments/${families.argument}/importance`, { value: 1 });
  board.clock.advance(TICK_MS);
  await poll(reader);
  await expect(pill(reader)).toHaveText(/1 change\s*Update/);
  expect(await rows(reader, "Yes")).toEqual(YES);

  await view(reader, "Strongest case").click();
  expect(await caseClaims(reader, "Yes")).toEqual([YES[2], YES[0], YES[1]]);
  // The case is already current, so the pill doesn't offer an Update here.
  await expect(pill(reader)).toBeHidden();

  await view(reader, "Board").click();
  expect(await rows(reader, "Yes")).toEqual(YES);
  await expect(pill(reader)).toHaveText(/1 change\s*Update/);
});

test("E-01 Choosing an argument opens it on the board, its card open and the cursor on it", async ({ board }) => {
  const reader = await board.open("jordan_w");
  await view(reader, "Strongest case").click();

  await caseFor(reader, "No")
    .getByRole("button", { name: `Argument 2: ${NO[1]}. Open it on the board.` })
    .click();
  await expect(view(reader, "Board")).toHaveAttribute("aria-pressed", "true");
  const claim = reader.locator(".sm-column[aria-label='No'] .sm-claim-button", { hasText: NO[1]! });
  await expect(claim).toHaveAttribute("aria-expanded", "true");
  await expect(claim).toBeFocused();
});

test("E-01 A best wording that isn't first on the reader's screen opens with its row unfolded", async ({ board }) => {
  const reader = await board.open("jordan_w");
  const shift = await find(board, "Shift workers can only come on Sundays.");
  for (const person of ["lin.zhao", "maya.chen", "tess.b"] as const) await board.api(person).put(`versions/${shift.version}/articulation`, { value: 1 });
  board.clock.advance(TICK_MS);
  await poll(reader);

  await view(reader, "Strongest case").click();
  expect((await caseClaims(reader, "Yes"))[0]).toBe("Shift workers can only come on Sundays.");
  await caseFor(reader, "Yes")
    .getByRole("button", { name: /^Argument 1: Shift workers/ })
    .click();

  const track = reader.getByRole("region", { name: "Versions, best articulated first" });
  await expect(track).toBeVisible();
  const claim = track.locator(".sm-claim-button", { hasText: "Shift workers can only come on Sundays." });
  await expect(claim).toHaveAttribute("aria-expanded", "true");
  await expect(claim).toBeFocused();
});

test("E-01 A side with more than three says how many more; a side with one says it needs a stronger case", async ({ board }) => {
  await board
    .api("omar_h")
    .post("arguments", { id: board.ids.itemId(), optionId: board.demo.options.yes, versionId: board.ids.itemId(), wording: "Other libraries nearby already open on Sundays.", context: "" });
  await board.api("jordan_w").delete(`versions/${(await find(board, NO[1]!)).version}`);
  await board.api("tess.b").delete(`versions/${(await find(board, NO[2]!)).version}`);
  const reader = await board.open("lin.zhao");

  await view(reader, "Strongest case").click();
  expect(await caseClaims(reader, "Yes")).toEqual(YES);
  await expect(caseFor(reader, "Yes").locator(".sm-case-note")).toHaveText("1 more argument on the board.");
  expect(await caseClaims(reader, "No")).toEqual([NO[0]]);
  await expect(caseFor(reader, "No").locator(".sm-case-caption")).toHaveText("Its argument, in the best wording");
  await expect(caseFor(reader, "No").locator(".sm-case-note")).toHaveText("Only one argument so far. This side needs a stronger case.");
});

test("E-01 On a phone both cases show, one under the other", async ({ board }) => {
  const reader = await board.open("jordan_w", { width: 390 });
  await view(reader, "Strongest case").click();

  await expect(caseFor(reader, "Yes")).toBeVisible();
  await expect(caseFor(reader, "No")).toBeVisible();
  const [yes, no] = [await caseFor(reader, "Yes").boundingBox(), await caseFor(reader, "No").boundingBox()];
  expect(no!.y).toBeGreaterThan(yes!.y + yes!.height - 1);
  // The columns fit the screen. (The header's test-account switch, in development and tests only, doesn't.)
  expect(yes!.x + yes!.width).toBeLessThanOrEqual(390);
  expect(no!.x + no!.width).toBeLessThanOrEqual(390);
});

test("E-01 A-06 Strongest case closes what's open on the board, and a held delete keeps its Undo there", async ({ board }) => {
  const reader = await board.open("maya.chen");
  await reader.locator(".sm-claim-button", { hasText: YES[1]! }).click();
  await expect(reader).toHaveURL(/\/v\//);
  await reader.locator("[data-card]", { hasText: YES[0]! }).getByRole("button", { name: "Options for this version" }).click();
  await reader.getByRole("menuitem", { name: "Delete version" }).click();

  await view(reader, "Strongest case").click();
  await expect(reader).toHaveURL(`/b/${board.demo.board}`);
  await expect(reader.locator(".sm-undo")).toContainText("Version deleted.");
  expect((await caseClaims(reader, "Yes"))[0]).toBe("Shift workers can only come on Sundays.");

  await reader.locator(".sm-undo").getByRole("button", { name: "Undo" }).click();
  expect(await caseClaims(reader, "Yes")).toEqual(YES);
  await view(reader, "Board").click();
  await expect(reader.locator(".sm-claim-button", { hasText: YES[1]! })).toHaveAttribute("aria-expanded", "false");
});

test("E-01 The switch isn't offered where there's no board", async ({ board }) => {
  const reader = await board.open("jordan_w", { missingBoards: true });
  await reader.goto("/b/no-such-board");
  await expect(reader.getByRole("heading", { name: "This steelman doesn’t exist" })).toBeVisible();
  await expect(reader.getByRole("group", { name: "View" })).toHaveCount(0);
});
