// Report (M2-3; J-01), from the card's ⋯ menu, as the prototype does it:
// Report switches the menu to its reasons (Spam, Abusive, Off-topic,
// Something else, which asks what's wrong); once reported, the menu offers
// Withdraw your report. An Editor and the Owner see a red flag with how many
// open reports a wording has and why; nobody else does, and nobody sees who.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import { find } from "./support/screen.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";

const card = (page: Page, wording: string): Locator => page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
const status = (page: Page) => page.locator("#sm-status");
const flag = (page: Page, wording: string) => card(page, wording).locator(".sm-flag-tag");

async function openMenu(page: Page, wording: string): Promise<void> {
  await card(page, wording).getByRole("button", { name: "Options for this version" }).click();
}

test("M2-3, J-01: anyone reports someone else's wording from its menu, picking a reason; then the menu offers Withdraw", async ({ board }) => {
  const reader = await board.open("tess.b");

  await openMenu(reader, LEAD);
  await reader.getByRole("menuitem", { name: "Report", exact: true }).click();
  await expect(reader.getByRole("menu", { name: "Report it as" }).getByRole("menuitem")).toHaveText(["Spam", "Abusive", "Off-topic", "Something else"]);
  await expect(reader.getByRole("menuitem", { name: "Spam" })).toBeFocused();
  await reader.getByRole("menuitem", { name: "Spam" }).click();

  await expect(status(reader)).toHaveText("Reported. Editors will see it.");
  await expect(card(reader, LEAD).getByRole("button", { name: "Options for this version" })).toBeFocused();
  await openMenu(reader, LEAD);
  await expect(reader.getByRole("menuitem", { name: "Withdraw your report" })).toBeVisible();
  await expect(reader.getByRole("menuitem", { name: "Report", exact: true })).toHaveCount(0);
});

test("M2-3, J-01: nobody is offered Report on their own wording", async ({ board }) => {
  const author = await board.open("maya.chen");

  await openMenu(author, LEAD);

  await expect(author.getByRole("menuitem", { name: "Report", exact: true })).toHaveCount(0);
});

test("M2-3, J-01, H-03: an Editor sees a flag with the count and the reasons; a Contributor sees none", async ({ board }) => {
  await board.setRole("jordan_w", "editor");
  const editor = await board.open("jordan_w");
  const contributor = await board.open("lin.zhao");
  const reader = await board.open("tess.b");

  await openMenu(reader, LEAD);
  await reader.getByRole("menuitem", { name: "Report", exact: true }).click();
  await reader.getByRole("menuitem", { name: "Abusive" }).click();
  await expect(status(reader)).toHaveText("Reported. Editors will see it.");
  await editor.clock.runFor(10_000);
  await contributor.clock.runFor(10_000);

  await expect(flag(editor, LEAD)).toHaveText("1");
  await expect(flag(editor, LEAD)).toHaveAttribute("aria-label", "1 report: Abusive");
  await expect(flag(contributor, LEAD)).toHaveCount(0);
  // Who reported it is never said.
  expect(await flag(editor, LEAD).getAttribute("data-tooltip")).toBe("Abusive");
});

test("M2-3, J-01: Something else asks what's wrong, and reports only once it's said", async ({ board }) => {
  const reader = await board.open("tess.b");

  await openMenu(reader, LEAD);
  await reader.getByRole("menuitem", { name: "Report", exact: true }).click();
  await reader.getByRole("menuitem", { name: "Something else" }).click();

  const form = reader.getByRole("dialog", { name: "Report it as something else" });
  await expect(form.getByLabel("What’s wrong with it?")).toBeFocused();
  await expect(form.getByRole("button", { name: "Report" })).toBeDisabled();
  await form.getByLabel("What’s wrong with it?").fill("It names a classmate.");
  await form.getByRole("button", { name: "Report" }).click();

  await expect(status(reader)).toHaveText("Reported. Editors will see it.");
  await expect.poll(async () => (await board.api("maya.chen").snapshot()).versions.find((v: { wording: string }) => v.wording === LEAD).reports).toEqual({ count: 1, reasons: { other: 1 }, notes: ["It names a classmate."] });
});

test("M2-3, J-01: withdrawing takes the flag away", async ({ board }) => {
  const owner = await board.open("maya.chen");
  const reader = await board.open("tess.b");
  await openMenu(reader, LEAD);
  await reader.getByRole("menuitem", { name: "Report", exact: true }).click();
  await reader.getByRole("menuitem", { name: "Off-topic" }).click();
  await owner.clock.runFor(10_000);
  await expect(flag(owner, LEAD)).toHaveText("1");

  await openMenu(reader, LEAD);
  await reader.getByRole("menuitem", { name: "Withdraw your report" }).click();
  await expect(status(reader)).toHaveText("Report withdrawn.");
  await owner.clock.runFor(10_000);

  await expect(flag(owner, LEAD)).toHaveCount(0);
});

test("M2-3, J-01: once reported, the card tells the reporter so, until they withdraw it (the builder, Nov 20)", async ({ board }) => {
  const reader = await board.open("tess.b");
  await openMenu(reader, LEAD);
  await reader.getByRole("menuitem", { name: "Report", exact: true }).click();
  await reader.getByRole("menuitem", { name: "Spam" }).click();

  await expect(card(reader, LEAD).locator(".sm-reported-tag")).toHaveText("You reported this");
  await expect(card(reader, LEAD).locator(".sm-reported-tag")).toBeVisible();
  await reader.reload();
  await expect(card(reader, LEAD).locator(".sm-reported-tag")).toHaveText("You reported this");

  await openMenu(reader, LEAD);
  await reader.getByRole("menuitem", { name: "Withdraw your report" }).click();
  await expect(card(reader, LEAD).locator(".sm-reported-tag")).toHaveCount(0);
});

test("M2-3, J-01: an Editor's flag says what was written for Something else, and never who wrote it", async ({ board }) => {
  const { version } = await find(board, LEAD);
  await board.api("tess.b").put(`versions/${version}/report`, { reason: "other", note: "It names a student." });
  await board.api("jordan_w").put(`versions/${version}/report`, { reason: "spam", note: "" });
  const owner = await board.open("maya.chen");

  expect(await flag(owner, LEAD).getAttribute("data-tooltip")).toBe("Spam, Something else: “It names a student.”");
  await expect(flag(owner, LEAD)).toHaveAccessibleName("2 reports: Spam, Something else: “It names a student.”");
  await expect(card(owner, LEAD).locator(".sm-reported-tag")).toHaveCount(0);
});

test("M2-3, M-04: the reasons, the note, and the flag pass an accessibility scan", async ({ board }) => {
  const owner = await board.open("maya.chen");
  const reader = await board.open("tess.b");
  await openMenu(reader, LEAD);
  await reader.getByRole("menuitem", { name: "Report", exact: true }).click();
  const scan = async (page: Page) => (await new AxeBuilder({ page }).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

  expect(await scan(reader)).toEqual([]);
  await reader.getByRole("menuitem", { name: "Something else" }).click();
  expect(await scan(reader)).toEqual([]);
  await reader.getByLabel("What’s wrong with it?").fill("It names a classmate.");
  await reader.getByRole("button", { name: "Report", exact: true }).click();
  await owner.clock.runFor(10_000);
  await expect(flag(owner, LEAD)).toBeVisible();
  expect(await scan(owner)).toEqual([]);
});

test("M2-3, J-01, H-03: someone made an Editor while the board is open sees the flags already there", async ({ board }) => {
  const reader = await board.open("tess.b");
  const becoming = await board.open("jordan_w");
  await openMenu(reader, LEAD);
  await reader.getByRole("menuitem", { name: "Report", exact: true }).click();
  await reader.getByRole("menuitem", { name: "Spam" }).click();
  await expect(status(reader)).toHaveText("Reported. Editors will see it.");
  await becoming.clock.runFor(10_000);
  await expect(flag(becoming, LEAD)).toHaveCount(0);

  await board.setRole("jordan_w", "editor");
  await becoming.clock.runFor(10_000);

  await expect(flag(becoming, LEAD)).toHaveText("1");
});

test("M2-3, M-04: Tab past the note form's last button closes it, as Tab closes the menu", async ({ board }) => {
  const reader = await board.open("tess.b");
  await openMenu(reader, LEAD);
  await reader.getByRole("menuitem", { name: "Report", exact: true }).click();
  await reader.getByRole("menuitem", { name: "Something else" }).click();
  const form = reader.getByRole("dialog", { name: "Report it as something else" });
  await form.getByLabel("What’s wrong with it?").fill("It names a classmate.");

  await reader.keyboard.press("Tab");
  await expect(form.getByRole("button", { name: "Back" })).toBeFocused();
  await reader.keyboard.press("Tab");
  await expect(form.getByRole("button", { name: "Report" })).toBeFocused();
  await reader.keyboard.press("Tab");

  await expect(form).toHaveCount(0);
});
