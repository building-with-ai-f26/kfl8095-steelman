// Two things the builder found looking at the board (Nov 17): Share's
// settings looked changeable to someone who can't change them, and the
// importance axis crowded and overran a column with one argument or none.

import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";

const pill = (page: Page) => page.getByRole("button", { name: /^(Anyone with the link|Invited only)$/ });
const axis = (page: Page) => page.locator(".sm-col-vaxis");
const opacity = (page: Page, name: string) => page.getByRole("combobox", { name }).evaluate((element) => Number(getComputedStyle(element).opacity));

/** A new board of Maya's with the given arguments for Yes and No, opened in her browser. */
async function boardWith(board: TestBoard, page: Page, yes: number, no: number): Promise<void> {
  const maya = board.api("maya.chen");
  const { board: id } = (await maya.post("/api/boards", { question: "Should the pod meet on Fridays?", options: ["Yes", "No"] })) as { board: string };
  const snapshot = (await maya.get(`/api/boards/${id}`)) as { options: { id: string; position: number }[] };
  const [yesOption, noOption] = [...snapshot.options].sort((a, b) => a.position - b.position);
  for (const [option, count] of [[yesOption!, yes], [noOption!, no]] as const) {
    for (let n = 0; n < count; n++) {
      await maya.post(`/api/boards/${id}/arguments`, { id: board.ids.itemId(), optionId: option.id, versionId: board.ids.itemId(), wording: `Argument ${n + 1} for this side.`, context: "" });
    }
  }
  await page.goto(`/b/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should the pod meet on Fridays?");
}

test("H-02: someone who isn't the owner sees Share's two settings faded, arrows and all; the owner doesn't", async ({ board }) => {
  const contributor = await board.open("jordan_w");
  await pill(contributor).click();
  for (const name of ["General access", "Link role"]) {
    await expect(contributor.getByRole("combobox", { name })).toBeDisabled();
    expect(await opacity(contributor, name), name).toBeLessThan(0.6);
  }

  const owner = await board.open("maya.chen");
  await pill(owner).click();
  for (const name of ["General access", "Link role"]) expect(await opacity(owner, name), name).toBe(1);
});

test("A-01: the importance axis shows only once a column has two arguments to rank", async ({ board }) => {
  const page = await board.open("maya.chen");

  await boardWith(board, page, 0, 0);
  await expect(axis(page)).toHaveCount(0);

  await boardWith(board, page, 1, 1);
  await expect(axis(page)).toHaveCount(0);

  await boardWith(board, page, 2, 0);
  await expect(axis(page)).toBeVisible();
});

test("A-01 M-03: on a phone, a column says \"Most important first\" only once it has two arguments", async ({ board }) => {
  const page = await board.open("maya.chen", { width: 375 });

  await boardWith(board, page, 2, 1);

  const line = (column: number) => page.locator("section.sm-column").nth(column).locator(".sm-col-axis");
  await expect(line(0)).toHaveText("Most important first");
  await expect(line(0)).toBeVisible();
  await expect(line(1)).toHaveCount(0);
});
