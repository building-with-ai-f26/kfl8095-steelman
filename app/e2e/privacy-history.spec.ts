// The privacy page says what a board's History shows about people (M-07,
// J-03): since the M3a audit (Nov 22), History lists when each argument and
// wording was added, as well as who did what to the board and when, so
// everyone who can open a board sees when each person added each thing.

import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";

async function signedOut(browser: Browser, origin: string, path: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  await page.goto(path);
  return page;
}

test("M-07, J-03: Who sees what says that a board's history shows who did what and when, including additions, and never votes", async ({ board, browser }) => {
  const origin = new URL((await board.open("jordan_w")).url()).origin;
  const page = await signedOut(browser, origin, "/privacy");

  const seen = page.getByRole("heading", { name: "Who sees what" }).locator("xpath=following-sibling::ul[1]");
  await expect(seen).toContainText("A board’s history shows everyone who can open the board who did what there, and when, including when you added each argument and wording. It never shows your votes.");
});
