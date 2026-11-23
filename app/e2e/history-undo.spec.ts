// Undo a combine from History (M3a-8; J-04): after the ten seconds of Undo,
// History still names each combine and separation, and an Editor or the
// Owner undoes it there, as GitHub's pull-request timeline offers Revert on a
// merge long after it, and Canny lets an admin unmerge a post. The service's
// undo (M3a-6) does the rest: the wording goes back, votes set aside come
// back, and a wording or vote added since stays. One undone since, or built
// on since, says why it can't be undone yet.

import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import { column, find, row, rows, short, status } from "./support/screen.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const SHIFT = "Shift workers can only come on Sundays.";
const STUDY = "Students need a quiet place to study before Monday exams.";
const FAMILY = "Families could visit together on the one day nobody has school or work.";

const panel = (page: Page) => page.getByRole("dialog", { name: "History" });
const entries = (page: Page) => panel(page).getByRole("listitem");

async function openHistory(page: Page): Promise<void> {
  await page.getByRole("button", { name: "History" }).click();
  await expect(panel(page)).toBeVisible();
}

test("M3a-8, J-03, J-04: History says who combined and separated what, in sentences", async ({ board }) => {
  const study = await find(board, STUDY);
  const family = await find(board, FAMILY);
  const shift = await find(board, SHIFT);
  await board.api("maya.chen").post(`versions/${study.version}/combine`, { into: family.argument });
  await board.api("maya.chen").post(`versions/${shift.version}/separate`, { argumentId: board.ids.itemId() });
  const page = await board.open("tess.b");
  await openHistory(page);

  await expect(entries(page).nth(0)).toContainText(`maya.chen made “${short(SHIFT)}” its own argument.`);
  await expect(entries(page).nth(1)).toContainText(`maya.chen combined “${short(STUDY)}” with “${short(FAMILY)}”`);
  // A Contributor can't undo either.
  await expect(panel(page).getByRole("button", { name: /Undo/ })).toHaveCount(0);
});

test("M3a-8, J-04: the Owner undoes a combine from History after its ten seconds; the arguments are two again", async ({ board }) => {
  const study = await find(board, STUDY);
  const family = await find(board, FAMILY);
  await board.api("maya.chen").post(`versions/${study.version}/combine`, { into: family.argument });
  const page = await board.open("maya.chen");
  expect(await rows(page, "Yes")).not.toContain(STUDY);
  await openHistory(page);

  await entries(page).nth(0).getByRole("button", { name: "Undo" }).click();

  await expect(status(page)).toHaveText("The wording is back where it was.");
  await expect(row(page, STUDY)).toBeVisible();
  await expect(entries(page).nth(0)).toContainText(`maya.chen moved “${short(STUDY)}” back where it was.`);
  await expect(entries(page).nth(1).getByRole("button", { name: "Undo" })).toHaveCount(0);
  expect((await board.api("maya.chen").snapshot()).versions.find((v: { id: string }) => v.id === study.version).argumentId).toBe(study.argument);
});

test("M3a-8, J-04: a separation is undone from History too", async ({ board }) => {
  const shift = await find(board, SHIFT);
  await board.api("maya.chen").post(`versions/${shift.version}/separate`, { argumentId: board.ids.itemId() });
  const page = await board.open("maya.chen");
  await openHistory(page);

  await entries(page).nth(0).getByRole("button", { name: "Undo" }).click();

  await expect(status(page)).toHaveText("The wording is back where it was.");
  await expect(row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" })).toBeVisible();
  await expect(entries(page).nth(0)).toContainText(`maya.chen moved “${short(SHIFT)}” back into its argument.`);
});

test("M3a-8, J-04: a combine the wording has moved on from since says why it can't be undone yet", async ({ board }) => {
  const study = await find(board, STUDY);
  const family = await find(board, FAMILY);
  const lead = await find(board, LEAD);
  await board.api("maya.chen").post(`versions/${study.version}/combine`, { into: family.argument });
  await board.api("maya.chen").post(`versions/${study.version}/combine`, { into: lead.argument });
  const page = await board.open("maya.chen");
  await openHistory(page);

  await entries(page).nth(1).getByRole("button", { name: "Undo" }).click();

  await expect(status(page)).toHaveText("Something was combined or separated since, so this can’t be undone yet.");
  await expect(column(page, "Yes")).toBeVisible();
  // The browser logs the service's refusal; it's the answer this test expects.
  expect(board.errors.splice(0)).toEqual(["maya.chen: Failed to load resource: the server responded with a status of 409 (Conflict)"]);
});

test("M3a-8, J-04, M-04: an Editor who isn't the Owner undoes it too; its name says what it undoes, and the cursor goes to History's title", async ({ board }) => {
  const study = await find(board, STUDY);
  const family = await find(board, FAMILY);
  await board.api("maya.chen").post(`versions/${study.version}/combine`, { into: family.argument });
  const people = (await board.api("maya.chen").get("people")) as { people: { id: string; name: string }[] };
  await board.api("maya.chen").put(`people/${people.people.find((p) => p.name === "tess.b")!.id}`, { role: "editor" });
  const page = await board.open("tess.b");
  await openHistory(page);

  const undo = entries(page).nth(1).getByRole("button", { name: `Undo combining “${short(STUDY)}”` });
  await undo.click();

  await expect(status(page)).toHaveText("The wording is back where it was.");
  await expect(panel(page).getByRole("heading", { name: "History", level: 2 })).toBeFocused();
});

test("M3a-8, J-04, A-06: no Undo once the combined wording has been deleted", async ({ board }) => {
  const lead = await find(board, LEAD);
  const study = await find(board, STUDY);
  await board.api("maya.chen").post(`versions/${lead.version}/combine`, { into: study.argument });
  await board.api("maya.chen").delete(`versions/${lead.version}`);
  const page = await board.open("maya.chen");
  await openHistory(page);

  await expect(entries(page).filter({ hasText: "combined" })).toHaveCount(1);
  await expect(entries(page).filter({ hasText: "combined" }).getByRole("button", { name: /Undo/ })).toHaveCount(0);
});

test("M3a-8, J-04, J-05: History's Undo for the change the Undo bar still holds takes the bar with it", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: STUDY }) }).getByRole("button", { name: "Combine with another argument" }).click();
  await page.getByRole("button", { name: `Combine here: same point as “${short(FAMILY)}”` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Combine" }).click();
  await expect(page.locator(".sm-undo")).toBeVisible();
  await openHistory(page);

  await entries(page).nth(0).getByRole("button", { name: /^Undo/ }).click();

  await expect(status(page)).toHaveText("The wording is back where it was.");
  await expect(page.locator(".sm-undo")).toHaveCount(0);
  await expect(row(page, STUDY)).toBeVisible();
});
