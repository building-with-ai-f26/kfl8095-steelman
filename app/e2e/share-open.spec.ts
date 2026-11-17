// Opening Share (H-02): the cursor goes to the panel itself, so no control in
// it shows a focus outline after a click (the builder, Nov 17). The keyboard
// reaches the settings with Tab, as in the W3C's dialog pattern.

import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";

const pill = (page: Page) => page.getByRole("button", { name: /^(Anyone with the link|Invited only)$/ });
const panel = (page: Page) => page.getByRole("dialog", { name: "Share" });
/** What shows a focus outline: the element with the cursor, if the browser draws one for it. */
const outlined = (page: Page) => page.evaluate(() => document.querySelector(":focus-visible")?.getAttribute("aria-label") ?? document.querySelector(":focus-visible")?.tagName ?? null);

test("H-02: clicking the pill opens Share with the cursor on the panel, and nothing in it outlined", async ({ board }) => {
  const owner = await board.open("maya.chen");

  await pill(owner).click();

  await expect(panel(owner)).toBeFocused();
  expect(await outlined(owner)).toBeNull();
});

test("H-02 M-04: from the keyboard, Tab then reaches Close and General access, and Escape still closes the panel", async ({ board }) => {
  const owner = await board.open("maya.chen");
  await pill(owner).focus();
  await owner.keyboard.press("Enter");
  await expect(panel(owner)).toBeFocused();

  // In the panel's order: its Close button, then the settings.
  await owner.keyboard.press("Tab");
  await expect(owner.getByRole("button", { name: "Close sharing" })).toBeFocused();
  await owner.keyboard.press("Tab");

  await expect(owner.getByRole("combobox", { name: "General access" })).toBeFocused();
  await owner.keyboard.press("Escape");
  await expect(panel(owner)).toHaveCount(0);
  await expect(pill(owner)).toBeFocused();
});
