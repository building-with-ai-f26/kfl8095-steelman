// Share's people list (M2-2b, Q27; H-03): People with access, above General
// access, as in the prototype's shareMarkup. Everyone sees who's on the
// board, by username; the owner sets each member's role with a menu by their
// name, as Google Drive and Figma do. A lowered role closes what the person
// was writing.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";

const SIZES = [
  { name: "desktop", width: 1280 },
  { name: "375", width: 375 },
] as const;

const pill = (page: Page) => page.getByRole("button", { name: /^(Anyone with the link|Invited only)$/ });
const people = (page: Page) => page.getByRole("region", { name: "People with access" }).getByRole("listitem");

test("M2-2b, H-03: People with access lists the owner first, then everyone else with their role", async ({ board }) => {
  const owner = await board.open("maya.chen");

  await pill(owner).click();

  await expect(people(owner)).toHaveText([/^MCmaya\.chen \(you\)Owner/, /^JWjordan_w/, /^LZlin\.zhao/, /^OHomar_h/, /^TBtess\.b/]);
  await expect(owner.getByRole("combobox", { name: "Access level for jordan_w" })).toHaveValue("contributor");
  await expect(owner.getByRole("combobox", { name: /^Access level for maya\.chen/ })).toHaveCount(0);
});

test("M2-2b, H-03: the owner makes someone an Editor; it is saved, and theirs", async ({ board }) => {
  const owner = await board.open("maya.chen");
  await pill(owner).click();

  await owner.getByRole("combobox", { name: "Access level for jordan_w" }).selectOption("editor");

  await expect(owner.locator("#sm-status")).toHaveText("jordan_w can edit.");
  await expect.poll(async () => (await board.api("jordan_w").snapshot()).role).toBe("editor");
  await expect(owner.getByRole("combobox", { name: "Access level for jordan_w" })).toHaveValue("editor");
});

test("M2-2b, H-03: someone who isn't the owner sees each role, and no menus", async ({ board }) => {
  const reader = await board.open("jordan_w");

  await pill(reader).click();

  await expect(people(reader).first()).toContainText("Owner");
  await expect(people(reader).filter({ hasText: "jordan_w" })).toContainText("(you)can contribute");
  await expect(reader.getByRole("region", { name: "People with access" }).getByRole("combobox")).toHaveCount(0);
});

test("M2-2b, H-03: when the owner lowers someone below writing, the draft they have open closes", async ({ board }) => {
  const writer = await board.open("jordan_w");
  await writer.getByRole("button", { name: "Add an argument for Yes" }).click();
  await expect(writer.locator(".sm-compose-card")).toBeVisible();

  await board.api("maya.chen").put(`people/${board.demo.people["jordan_w"]}`, { role: "voter" });
  await writer.clock.runFor(10_000);

  await expect(writer.locator(".sm-compose-card")).toHaveCount(0);
  await expect(writer.getByRole("button", { name: "Add an argument for Yes" })).toHaveAttribute("aria-disabled", "true");
});

test("M2-2b, H-03: when the owner lowers someone below writing, the edit of their own wording they have open closes", async ({ board }) => {
  const writer = await board.open("jordan_w");
  const own = writer.locator(".sm-card").filter({ hasText: "Opening a seventh day costs more than the budget allows." });
  await own.getByRole("button", { name: "Options for this version" }).click();
  await writer.getByRole("menuitem", { name: "Edit wording and context" }).click();
  await expect(writer.getByRole("button", { name: "Save changes" })).toBeVisible();

  await board.api("maya.chen").put(`people/${board.demo.people["jordan_w"]}`, { role: "voter" });
  await writer.clock.runFor(10_000);

  await expect(writer.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  await expect(own.locator(".sm-claim")).toHaveText("Opening a seventh day costs more than the budget allows.");
});

for (const size of SIZES) {
  test(`M2-2b, M-04: Share with its people list passes an accessibility scan, and looks as saved, at ${size.name} width`, async ({ board }) => {
    const owner = await board.open("maya.chen", { width: size.width });
    await pill(owner).click();
    await expect(people(owner)).toHaveCount(5);

    const results = await new AxeBuilder({ page: owner }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    await expect(owner).toHaveScreenshot(`share-people-${size.name}.png`);
  });
}
