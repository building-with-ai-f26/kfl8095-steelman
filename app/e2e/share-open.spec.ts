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

test("H-01 H-02 H-03 M-04: from the keyboard, Tab then reaches Close, the invite row, each person's access and Remove, and General access, and Escape still closes the panel", async ({ board }) => {
  const owner = await board.open("maya.chen");
  await pill(owner).focus();
  await owner.keyboard.press("Enter");
  await expect(panel(owner)).toBeFocused();

  // In the panel's order: its Close button, then the invite row (M3b-7; the builder approved this change, Nov 24), then
  // the people list's access and Remove for each person but the owner (M2-2b; approved Nov 20), then General access.
  await owner.keyboard.press("Tab");
  await expect(owner.getByRole("button", { name: "Close sharing" })).toBeFocused();
  await owner.keyboard.press("Tab");
  await expect(owner.getByRole("textbox", { name: "Add people" })).toBeFocused();
  await owner.keyboard.press("Tab");
  await expect(owner.getByRole("combobox", { name: "Access level for new people" })).toBeFocused();
  await owner.keyboard.press("Tab");
  await expect(owner.getByRole("button", { name: "Invite" })).toBeFocused();
  // Each person's name links to their profile (M3d-16; the builder approved this change, Nov 26), the owner's first.
  await owner.keyboard.press("Tab");
  await expect(panel(owner).getByRole("link", { name: "maya.chen" })).toBeFocused();
  for (const person of ["jordan_w", "lin.zhao", "omar_h", "tess.b"]) {
    await owner.keyboard.press("Tab");
    await expect(panel(owner).getByRole("link", { name: person })).toBeFocused();
    await owner.keyboard.press("Tab");
    await expect(owner.getByRole("combobox", { name: `Access level for ${person}` })).toBeFocused();
    await owner.keyboard.press("Tab");
    await expect(owner.getByRole("button", { name: `Remove ${person}` })).toBeFocused();
  }
  await owner.keyboard.press("Tab");

  await expect(owner.getByRole("combobox", { name: "General access" })).toBeFocused();
  await owner.keyboard.press("Escape");
  await expect(panel(owner)).toHaveCount(0);
  await expect(pill(owner)).toBeFocused();
});
