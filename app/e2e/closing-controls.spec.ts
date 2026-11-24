// The Owner's closing controls in Settings (M3b-6, I-05): a group of its own
// below "Sharing and access", with a row "Closes" (Add a date, then a date and
// a time with the zone named, and Remove) and a row "Open" (Close now), or
// "Closed Nov 16" (Reopen). Each is sent at once, with no confirmation.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import { poll, status } from "./support/screen.ts";

test.use({ timezoneId: "America/New_York" });

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const HOUR = 3_600_000;

const panel = (page: Page) => page.getByRole("dialog", { name: "Settings" });
const timing = (page: Page) => panel(page).getByRole("region", { name: "Timing" });
const closingPill = (page: Page): Locator => page.locator(".sm-head .sm-closing-pill");
const importance = (page: Page) => page.locator(".sm-idea").filter({ has: page.locator(".sm-claim", { hasText: LEAD }) }).getByRole("button", { name: "More important if true" });

async function openSettings(page: Page): Promise<void> {
  await page.locator(".sm-head").getByRole("button", { name: "Settings" }).click();
  await expect(panel(page)).toBeVisible();
}

test("I-05: the Owner closes now, the pill and the row change, and a second reader's controls fade on their next poll; Reopen brings them back", async ({ board }) => {
  const owner = await board.open("maya.chen");
  const other = await board.open("tess.b");
  await openSettings(owner);
  await expect(timing(owner)).toContainText("Open");

  await timing(owner).getByRole("button", { name: "Close now" }).click();

  await expect(status(owner)).toHaveText("The board is closed.");
  await expect(timing(owner).getByRole("button", { name: "Reopen" })).toBeFocused();
  await expect(timing(owner)).toContainText("Closed Nov 16");
  await expect(closingPill(owner)).toHaveText("Closed Nov 16");
  await poll(other);
  await expect(importance(other)).toHaveAttribute("aria-disabled", "true");

  await timing(owner).getByRole("button", { name: "Reopen" }).click();

  await expect(status(owner)).toHaveText("The board is open again.");
  await expect(timing(owner).getByRole("button", { name: "Close now" })).toBeFocused();
  await expect(closingPill(owner)).toHaveCount(0);
  await poll(other);
  await expect(importance(other)).not.toHaveAttribute("aria-disabled", "true");
});

test("I-05: the Owner adds a closing time, the pill says when, the clock passes it, and both sessions show the board closed; Reopen then clears the past time", async ({ board }) => {
  const owner = await board.open("maya.chen");
  const other = await board.open("tess.b");
  await openSettings(owner);

  await timing(owner).getByRole("button", { name: "Add a date" }).click();
  // Noon UTC on Nov 16 is 7 AM in New York, on the service's clock; an hour on is 8 AM.
  await timing(owner).getByLabel("Closing date", { exact: true }).fill("2026-11-16");
  await timing(owner).getByLabel("Closing time", { exact: true }).fill("08:00");
  await timing(owner).getByLabel("Closing time", { exact: true }).press("Enter");

  await expect(status(owner)).toHaveText("The board closes on Nov 16 at 8 AM EST.");
  await expect(timing(owner)).toContainText("EST");
  await expect(closingPill(owner)).toHaveText("Closes Nov 16 at 8 AM EST");

  board.clock.advance(HOUR);
  for (const page of [owner, other]) {
    await poll(page);
    await expect(closingPill(page)).toHaveText("Closed Nov 16");
  }
  await expect(importance(other)).toHaveAttribute("aria-disabled", "true");

  await timing(owner).getByRole("button", { name: "Reopen" }).click();
  await expect(closingPill(owner)).toHaveCount(0);
  await expect(timing(owner).getByRole("button", { name: "Add a date" })).toBeVisible();
  expect((await board.api("maya.chen").snapshot()).closing).toBeUndefined();
});

test("I-05: Add a date starts a week ahead and saves it at once; Remove clears it and the focus goes to Add a date", async ({ board }) => {
  const owner = await board.open("maya.chen");
  await openSettings(owner);

  await timing(owner).getByRole("button", { name: "Add a date" }).click();

  await expect(status(owner)).toHaveText(/^The board closes on [A-Z][a-z]{2} \d{1,2}(, \d{4})? at \d{1,2}(:\d{2})? [AP]M E[SD]T\.$/);
  await expect.poll(async () => (await board.api("maya.chen").snapshot()).closing?.closesAt).toBeTruthy();
  const closesAt = Date.parse((await board.api("maya.chen").snapshot()).closing.closesAt);
  const browserNow = await owner.evaluate(() => Date.now());
  expect(Math.abs(closesAt - browserNow - 7 * 24 * HOUR)).toBeLessThan(2 * HOUR);

  await timing(owner).getByRole("button", { name: "Remove the closing time" }).click();
  await expect(status(owner)).toHaveText("The closing time was removed.");
  await expect(timing(owner).getByRole("button", { name: "Add a date" })).toBeFocused();
  expect((await board.api("maya.chen").snapshot()).closing).toBeUndefined();
});

test("I-05: a time already past shows its sentence and saves nothing", async ({ board }) => {
  const owner = await board.open("maya.chen");
  await openSettings(owner);
  await timing(owner).getByRole("button", { name: "Add a date" }).click();
  await expect(status(owner)).toHaveText(/^The board closes on/);
  const before = (await board.api("maya.chen").snapshot()).closing.closesAt;

  await timing(owner).getByLabel("Closing date", { exact: true }).fill("2026-11-01");
  await timing(owner).getByLabel("Closing date", { exact: true }).press("Enter");

  await expect(timing(owner)).toContainText("Choose a time that hasn’t passed.");
  expect((await board.api("maya.chen").snapshot()).closing.closesAt).toBe(before);
  expect(board.errors.splice(0).every((error) => error.includes("400 (Bad Request)"))).toBe(true);
});

test("I-05: with Steelman unreachable, Close now says so and the board stays open", async ({ board }) => {
  const owner = await board.open("maya.chen");
  await owner.route("**/closed", (route) => route.abort("internetdisconnected"));
  await openSettings(owner);

  await timing(owner).getByRole("button", { name: "Close now" }).click();

  await expect(owner.locator(".sm-problem")).toContainText("Couldn’t reach Steelman. Try again.");
  await expect(timing(owner).getByRole("button", { name: "Close now" })).toBeVisible();
  await expect(closingPill(owner)).toHaveCount(0);
  expect((await board.api("maya.chen").snapshot()).board.closed).toBe(false);
});

test("I-05: an Editor is offered none of it", async ({ board }) => {
  await board.setRole("tess.b", "editor");
  const editor = await board.open("tess.b");
  await expect(editor.locator(".sm-head").getByRole("button", { name: "Settings" })).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Close now" })).toHaveCount(0);
  await expect(editor.getByRole("region", { name: "Timing" })).toHaveCount(0);
});

test("I-05, M-04: keyboard only, the Owner closes, reopens, adds a date, and removes it, reaching each control by name", async ({ board }) => {
  const owner = await board.open("maya.chen");
  const tabTo = async (target: Locator) => {
    await expect(target).toBeVisible();
    for (let presses = 0; presses < 200; presses++) {
      if (await target.evaluate((element) => element === document.activeElement)) return;
      await owner.keyboard.press("Tab");
    }
    throw new Error("Tab never reached the control");
  };

  await tabTo(owner.locator(".sm-head").getByRole("button", { name: "Settings" }));
  await owner.keyboard.press("Enter");
  await tabTo(timing(owner).getByRole("button", { name: "Close now" }));
  await owner.keyboard.press("Enter");
  await expect(timing(owner).getByRole("button", { name: "Reopen" })).toBeFocused();
  await owner.keyboard.press("Enter");
  await expect(timing(owner).getByRole("button", { name: "Close now" })).toBeFocused();
  await tabTo(timing(owner).getByRole("button", { name: "Add a date" }));
  await owner.keyboard.press("Enter");
  await expect(status(owner)).toHaveText(/^The board closes on/);
  await tabTo(timing(owner).getByRole("button", { name: "Remove the closing time" }));
  await owner.keyboard.press("Enter");
  await expect(timing(owner).getByRole("button", { name: "Add a date" })).toBeFocused();
});

for (const width of [1280, 375]) {
  for (const closed of [false, true]) {
    test(`I-05, M-04: the Settings panel passes an accessibility scan on ${closed ? "a closed" : "an open"} board at ${width} px`, async ({ board }) => {
      if (closed) await board.api("maya.chen").put("closed", {});
      else await board.api("maya.chen").put("closing", { closesAt: new Date(board.clock.now().getTime() + HOUR).toISOString() });
      const owner = await board.open("maya.chen", { width });
      await openSettings(owner);
      await expect(timing(owner)).toBeVisible();

      const results = await new AxeBuilder({ page: owner }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      expect(await owner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}
