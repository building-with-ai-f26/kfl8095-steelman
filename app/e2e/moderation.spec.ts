// Hide and restore (M2-4; J-02), with two people, as the prototype does it:
// an Editor hides a wording from its ⋯ menu, or from its report flag, with
// a reason; it keeps its place as "Removed by a moderator · Spam", its text
// shown, struck through, only to Editors and the Owner, who restore it from
// the same menu. Everyone else's board learns of it with its next poll.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import { find } from "./support/screen.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";

const card = (page: Page, versionId: string): Locator => page.locator(`[data-card="${versionId}"]`);
const status = (page: Page) => page.locator("#sm-status");

test("M2-4, J-02: an Editor hides a wording with a reason; it keeps its place, and someone else sees why but not what it said", async ({ board }) => {
  await board.setRole("jordan_w", "editor");
  const { version } = await find(board, LEAD);
  const editor = await board.open("jordan_w");
  const reader = await board.open("tess.b");

  await card(editor, version).getByRole("button", { name: "Options for this version" }).click();
  await editor.getByRole("menuitem", { name: "Hide" }).click();
  await expect(editor.getByRole("menu", { name: "Hide it as" }).getByRole("menuitem")).toHaveText(["Spam", "Abusive", "Off-topic", "Something else"]);
  await editor.getByRole("menuitem", { name: "Spam" }).click();

  await expect(status(editor)).toHaveText("Hidden.");
  await expect(card(editor, version).locator(".sm-removed-note")).toHaveText("Removed by a moderator · Spam");
  await expect(card(editor, version).locator(".sm-removed-claim")).toHaveText(LEAD);

  await reader.clock.runFor(10_000);
  await expect(card(reader, version).locator(".sm-removed-note")).toHaveText("Removed by a moderator · Spam");
  await expect(reader.getByText(LEAD)).toHaveCount(0);
  await expect(card(reader, version).getByRole("button", { name: "Options for this version" })).toHaveCount(0);
});

test("M2-4, J-02: an Editor restores a hidden wording from its menu, and it comes back for everyone", async ({ board }) => {
  await board.setRole("jordan_w", "editor");
  const { version } = await find(board, LEAD);
  await board.api("jordan_w").put(`versions/${version}/hidden`, { reason: "offtopic" });
  // Each comes by the wording's link, as an Editor following up a report would: a hidden wording sits after the
  // live ones in its row, which a link unfolds.
  const editor = await board.open("jordan_w");
  await editor.goto(`/b/${board.demo.board}/v/${version}`);
  const reader = await board.open("tess.b");
  await reader.goto(`/b/${board.demo.board}/v/${version}`);
  await expect(card(reader, version).locator(".sm-removed-note")).toHaveText("Removed by a moderator · Off-topic");

  await card(editor, version).getByRole("button", { name: "Options for this version" }).click();
  await editor.getByRole("menuitem", { name: "Restore" }).click();

  await expect(status(editor)).toHaveText("Restored.");
  await expect(card(editor, version).locator(".sm-claim")).toHaveText(LEAD);
  await reader.clock.runFor(10_000);
  await expect(card(reader, version).locator(".sm-claim")).toHaveText(LEAD);
});

test("M2-4, J-01, J-02: an Editor hides a reported wording from its flag, and the flag goes", async ({ board }) => {
  await board.setRole("jordan_w", "editor");
  const { version } = await find(board, LEAD);
  await board.api("tess.b").put(`versions/${version}/report`, { reason: "abuse", note: "" });
  const editor = await board.open("jordan_w");

  await card(editor, version).getByRole("button", { name: "1 report: Abusive" }).click();
  await expect(editor.getByRole("menuitem", { name: "Spam" })).toBeFocused();
  await editor.getByRole("menuitem", { name: "Abusive" }).click();

  await expect(card(editor, version).locator(".sm-removed-note")).toHaveText("Removed by a moderator · Abusive");
  await expect(card(editor, version).locator(".sm-flag-tag")).toHaveCount(0);
});

test("M2-4, J-02, H-03: a Contributor isn't offered Hide, nor the Owner on their own wording", async ({ board }) => {
  const { version } = await find(board, LEAD);
  const contributor = await board.open("tess.b");

  await card(contributor, version).getByRole("button", { name: "Options for this version" }).click();

  await expect(contributor.getByRole("menuitem", { name: "Hide" })).toHaveCount(0);
  const owner = await board.open("maya.chen");
  await card(owner, version).getByRole("button", { name: "Options for this version" }).click();
  await expect(owner.getByRole("menuitem", { name: "Hide" })).toHaveCount(0);
});

test("M2-4, J-02, M-06: a link to a hidden wording lands on its place, which says it was removed", async ({ board }) => {
  const { version } = await find(board, LEAD);
  await board.api("maya.chen").put(`versions/${version}/hidden`, { reason: "spam" });

  const reader = await board.open("tess.b");
  await reader.goto(`/b/${board.demo.board}/v/${version}`);

  await expect(card(reader, version).locator(".sm-removed-note")).toHaveText("Removed by a moderator · Spam");
  await expect(reader.getByText("That version was deleted.")).toHaveCount(0);
});

test("M2-4, M-04: a hidden wording, the Hide reasons, and the flag pass an accessibility scan", async ({ board }) => {
  await board.setRole("jordan_w", "editor");
  const { version } = await find(board, LEAD);
  await board.api("tess.b").put(`versions/${version}/report`, { reason: "spam", note: "" });
  const editor = await board.open("jordan_w");
  const scan = async (page: Page) => (await new AxeBuilder({ page }).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

  expect(await scan(editor)).toEqual([]);
  await card(editor, version).getByRole("button", { name: "Options for this version" }).click();
  await editor.getByRole("menuitem", { name: "Hide" }).click();
  // The menu rises into place; the browser's clock is the test's, so let it finish before scanning.
  await editor.clock.runFor(500);
  expect(await scan(editor)).toEqual([]);
  await editor.getByRole("menuitem", { name: "Spam" }).click();
  await expect(card(editor, version).locator(".sm-removed-note")).toBeVisible();
  expect(await scan(editor)).toEqual([]);
});
