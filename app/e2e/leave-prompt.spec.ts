// The offline queue lives in memory while the tab is open (Q20), so leaving
// with actions still waiting brings up the browser's own leave prompt, and
// leaving with nothing waiting doesn't (plans/architecture.md §3; M-02).

import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import { importance, pill } from "./support/screen.ts";

const WORDING = "Opening a seventh day costs more than the budget allows.";

/** Closes the page as a person closing the tab would, and says whether the browser asked first. */
async function closeAndSeeIfAsked(page: Page): Promise<boolean> {
  let asked = false;
  page.on("dialog", async (dialog) => {
    asked = dialog.type() === "beforeunload";
    await dialog.accept();
  });
  await page.close({ runBeforeUnload: true });
  await page.waitForEvent("close");
  return asked;
}

test("M-02 Leaving with actions waiting to send brings up the leave prompt", async ({ board }) => {
  const reader = await board.open("jordan_w");
  await reader.context().setOffline(true);
  await importance(reader, WORDING).getByRole("button", { name: "More important if true" }).click();
  await expect(pill(reader)).toHaveText("Offline · 1 waiting to send");

  expect(await closeAndSeeIfAsked(reader)).toBe(true);
});

test("M-02 Leaving with nothing waiting brings up no prompt", async ({ board }) => {
  const reader = await board.open("jordan_w");
  // Act on the page first: browsers only ever ask on a page someone has used.
  const vote = importance(reader, WORDING).getByRole("button", { name: "More important if true" });
  const answered = reader.waitForResponse((response) => response.url().includes("/importance") && response.request().method() === "PUT");
  await vote.click();
  await expect(importance(reader, WORDING).getByLabel("Net 2")).toBeVisible();
  // The count shows at once; the vote is sent a moment later. Once its answer is in, the board takes it off
  // what's waiting and then asks for changes, so that ask means nothing is waiting. (Changed with the builder,
  // Nov 16: closing as soon as the count showed sometimes caught the vote still on its way, on a slow machine.)
  await answered;
  await reader.waitForResponse((response) => response.url().includes("/changes?"));

  expect(await closeAndSeeIfAsked(reader)).toBe(false);
});
