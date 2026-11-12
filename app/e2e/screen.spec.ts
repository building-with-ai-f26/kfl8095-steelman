// The board screen as a whole (A-01, M-03, M-04): an accessibility scan, and
// screenshots compared with saved ones, at desktop width and at 375 px.
// Plus the "Phone width" row of "Live changes": the pill sits centred near the
// bottom of the screen, and nothing overflows sideways.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { TICK_MS, expect, test } from "./support/board.ts";
import { find, pill, poll, row } from "./support/screen.ts";

const SIZES = [
  { name: "desktop", width: 1280 },
  { name: "375", width: 375 },
] as const;

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

for (const size of SIZES) {
  test(`M-04 A-01 M-03 The board passes an accessibility scan at ${size.name} width, folded and unfolded`, async ({ board }) => {
    const reader = await board.open("jordan_w", { width: size.width });
    await expectNoAxeViolations(reader);

    await row(reader, "Sunday is the only free day for many people who work weekdays.").getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
    await expectNoAxeViolations(reader);
  });

  test(`A-01 M-03 The board looks as saved at ${size.name} width`, async ({ board }) => {
    const reader = await board.open("jordan_w", { width: size.width });
    await expect(reader).toHaveScreenshot(`board-${size.name}.png`, { fullPage: true });
  });
}

test("B-05 M-03 Phone width (375 px): the pill is centred 16 px above the bottom of the screen, and nothing overflows sideways", async ({ board }) => {
  const reader = await board.open("jordan_w", { width: 375 });
  const families = await find(board, "Families could visit together on the one day nobody has school or work.");
  for (const person of ["lin.zhao", "maya.chen", "tess.b"] as const) await board.api(person).put(`arguments/${families.argument}/importance`, { value: 1 });
  board.clock.advance(TICK_MS);
  await poll(reader);
  await expect(pill(reader)).toBeVisible();
  await pill(reader).evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));

  const box = (await pill(reader).boundingBox())!;
  const viewport = reader.viewportSize()!;
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.round(viewport.height - (box.y + box.height))).toBe(16);
  expect(await reader.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
