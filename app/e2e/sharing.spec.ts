// Who can get in (H-02), in the browser: the pill under the question, and
// the Share panel it opens. The owner changes general access and the link
// role there; everyone else sees them and can copy the link.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import { QUESTION, signInByCode, test as siteTest } from "./support/sign-in.ts";

const SIZES = [
  { name: "desktop", width: 1280 },
  { name: "375", width: 375 },
] as const;

const pill = (page: Page) => page.getByRole("button", { name: /^(Anyone with the link|Invited only)$/ });
const panel = (page: Page) => page.getByRole("dialog", { name: "Share" });

test("H-02: the pill under the question says who can get in, and opens the Share panel", async ({ board }) => {
  const owner = await board.open("maya.chen");

  await expect(pill(owner)).toHaveText("Anyone with the link");
  await pill(owner).click();

  await expect(panel(owner)).toBeVisible();
  await expect(owner.getByRole("combobox", { name: "General access" })).toHaveValue("link");
  await expect(owner.getByRole("combobox", { name: "Link role" })).toHaveValue("contributor");
  await expect(panel(owner)).toContainText("Anyone with the link can read, vote, and write.");
});

test("H-02: the owner's change shows at once, is saved, and reaches everyone else", async ({ board }) => {
  const owner = await board.open("maya.chen");
  const other = await board.open("jordan_w");

  await pill(owner).click();
  await owner.getByRole("combobox", { name: "Link role" }).selectOption("voter");
  await expect(panel(owner)).toContainText("Anyone with the link can read and vote.");
  await owner.getByRole("combobox", { name: "General access" }).selectOption("invited");

  await expect(pill(owner)).toHaveText("Invited only");
  await expect(owner.getByRole("combobox", { name: "Link role" })).toHaveCount(0);
  await expect(panel(owner)).toContainText("Only invited people can open it.");
  // Saved: the service says so, and so does the next poll in another browser.
  expect((await board.api("tess.b").snapshot()).access).toEqual({ general: "invited", linkRole: "voter" });
  await other.clock.runFor(10_000);
  await expect(pill(other)).toHaveText("Invited only");
});

test("H-02: someone who isn't the owner can see who can get in, and can't change it", async ({ board }) => {
  const contributor = await board.open("jordan_w");

  await pill(contributor).click();

  await expect(contributor.getByRole("combobox", { name: "General access" })).toBeDisabled();
  await expect(contributor.getByRole("combobox", { name: "Link role" })).toBeDisabled();
  await expect(panel(contributor)).toContainText("Only the owner can change who can get in.");
});

test("H-02: Copy link copies the board's address", async ({ board }) => {
  const reader = await board.open("jordan_w");
  await reader.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  await pill(reader).click();
  // The panel rises into place; the browser's clock is the test's, so let it play.
  await reader.clock.runFor(500);
  await reader.getByRole("button", { name: "Copy link" }).click();

  await expect(reader.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await reader.evaluate(() => navigator.clipboard.readText())).toBe(new URL(`/b/${board.demo.board}`, reader.url()).href);
});

test("H-02, M-04: Escape closes the panel and puts the cursor back on the pill, and so does a click elsewhere", async ({ board }) => {
  const reader = await board.open("jordan_w");

  await pill(reader).click();
  await reader.keyboard.press("Escape");
  await expect(panel(reader)).toHaveCount(0);
  await expect(pill(reader)).toBeFocused();

  await pill(reader).click();
  await reader.getByRole("heading", { level: 1 }).click();
  await expect(panel(reader)).toHaveCount(0);
});

for (const size of SIZES) {
  test(`H-02, M-04: the open Share panel passes an accessibility scan, and looks as saved, at ${size.name} width`, async ({ board }) => {
    const owner = await board.open("maya.chen", { width: size.width });
    await pill(owner).click();

    const results = await new AxeBuilder({ page: owner }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    await expect(owner).toHaveScreenshot(`share-${size.name}.png`);
  });
}

siteTest("H-02, L-01: someone who came by the link is told when the owner turns the link off", async ({ site }) => {
  const visitor = await site.browse();
  await signInByCode(site, visitor, "lee.visitor@example.test", "lee_visitor");
  const owner = await site.browse();
  await owner.addInitScript((id) => sessionStorage.setItem("steelman.testUser", id), site.demo.people["maya.chen"]);
  await owner.goto(site.boardPath);
  await expect(owner.getByRole("heading", { level: 1 })).toHaveText(QUESTION);

  await pill(owner).click();
  await owner.getByRole("combobox", { name: "General access" }).selectOption("invited");
  await expect(pill(owner)).toHaveText("Invited only");

  // Their next poll (every 3 s) learns it.
  await expect(visitor.getByText("You don’t have access to this steelman.")).toBeVisible({ timeout: 10_000 });
});
