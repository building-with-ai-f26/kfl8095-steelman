// M3a-1, a way back from every screen (M-13): the builder, Nov 22, "there is
// no navigation back from settings to the screen you were looking at without
// using the browser." The prototype's back link (sm-profile-back), worded as
// GOV.UK's Back link advises for anything but a simple journey: "Back to"
// where it goes (plans/reviews/m3-design-audit.md). A real link in a Back
// landmark at the top of Your account and the privacy page; New steelman's
// own Cancel goes back the same way, so it keeps one way back, not two.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";

const QUESTION = "Should our library open on Sundays?";
const back = (page: Page) => page.getByRole("navigation", { name: "Back" }).getByRole("link");

test("M3a-1, M-13: from a board, Your account leads back to that board, at the version that was open", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.locator(".sm-card .sm-claim").first().click();
  await expect(page).toHaveURL(/\/v\//);
  const at = new URL(page.url()).pathname;

  await page.getByRole("link", { name: "Your account" }).click();
  await expect(back(page)).toHaveText(`Back to ${QUESTION}`);
  await back(page).click();
  await expect(page).toHaveURL(at);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
});

test("M3a-1, M-13: a reload of Your account keeps where it leads back to", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.getByRole("link", { name: "Your account" }).click();
  await page.reload();
  await expect(back(page)).toHaveText(`Back to ${QUESTION}`);
});

test("M3a-1, M-13: from the list, and when opened from a typed address, the way back is Your steelmen", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.goto("/");
  await page.getByRole("link", { name: "Your account" }).click();
  await expect(back(page)).toHaveText("Back to Your steelmen");
  await back(page).click();
  await expect(page).toHaveURL("/");

  const fresh = await board.open("maya.chen", { at: "/account" });
  await expect(back(fresh)).toHaveText("Back to Your steelmen");
  await expect(back(fresh)).toHaveAttribute("href", "/");
});

test("M3a-1, M-13: the privacy page leads back to Your account, and New steelman's Cancel back to the board", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.getByRole("link", { name: "Your account" }).click();
  await page.getByRole("link", { name: "Read" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy");
  await expect(back(page)).toHaveText("Back to Your account");
  await back(page).click();
  await expect(page).toHaveURL("/account");

  await page.goto(`/b/${board.demo.board}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  await page.getByRole("link", { name: "New steelman" }).click();
  await expect(back(page)).toHaveCount(0);
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page).toHaveURL(`/b/${board.demo.board}`);
});

test("M3a-1, M-13: a long question runs to … on one line on a phone, and the link's text is still the whole name", async ({ board }) => {
  const page = await board.open("maya.chen", { width: 375 });
  // From the privacy page, which isn't a place of its own, so leaving it doesn't replace what's set here.
  await page.goto("/privacy");
  await page.evaluate(() => sessionStorage.setItem("steelman-place", JSON.stringify({ path: "/b/x", name: "Should every public library in the county open on Sundays and on public holidays too?" })));
  await page.goto("/account");
  const name = "Back to Should every public library in the county open on Sundays and on public holidays too?";
  await expect(back(page)).toHaveText(name);
  await expect(back(page)).toHaveAccessibleName(name);
  // Cut by the stylesheet, on one line: the text is wider than the space it's drawn in.
  const span = back(page).locator("span");
  expect(await span.evaluate((element) => [getComputedStyle(element).textOverflow, element.scrollWidth > element.clientWidth])).toEqual(["ellipsis", true]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll").toBe(true);
});

test("M3a-1, M-13: only a path on this site is followed back", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.goto("/privacy");
  for (const path of ["//evil.example/", "/\\evil.example/", "https://evil.example/"]) {
    await page.goto("/privacy");
    await page.evaluate((path) => {
      for (const key of Object.keys(sessionStorage)) if (key.startsWith("steelman-place") || key.startsWith("steelman-back:")) sessionStorage.removeItem(key);
      sessionStorage.setItem("steelman-place", JSON.stringify({ path, name: "Elsewhere" }));
    }, path);
    await page.goto("/account");
    await expect(back(page), path).toHaveText("Back to Your steelmen");
    await expect(back(page), path).toHaveAttribute("href", "/");
  }
});

test("M3a-1, M-13: the screens with nothing else to do have a way on: not found, and no access", async ({ board }) => {
  const missing = await board.open("maya.chen", { at: "/b/no-such-board", missingBoards: true });
  await expect(missing.getByRole("link", { name: "Go to Your steelmen" })).toHaveAttribute("href", "/");

  const theirs = (await board.api("tess.b").post("../../boards", { question: "Should the café open early?", options: ["Yes, at seven", "No, at nine"], access: { general: "invited", linkRole: "contributor" } })) as { board: string };
  const shut = await board.open("maya.chen", { at: `/b/${theirs.board}`, closedBoards: true });
  await expect(shut.getByText("You don’t have access to this steelman.")).toBeVisible();
  await expect(shut.getByRole("link", { name: "Go to Your steelmen" })).toHaveAttribute("href", "/");
});

for (const width of [1280, 375]) {
  test(`M3a-1, M-04: Your account with its back link passes an accessibility scan, at ${width} px`, async ({ board }) => {
    const page = await board.open("maya.chen", { width });
    await page.getByRole("link", { name: "Your account" }).click();
    await expect(back(page)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test("M3a-1, M-13: switching to another test account forgets the last one's way back", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.getByRole("link", { name: "Your account" }).click();
  await expect(back(page)).toHaveText(`Back to ${QUESTION}`);
  await page.getByRole("combobox", { name: "Acting as" }).selectOption({ label: "tess.b" });
  await page.waitForLoadState("load");
  await expect(back(page)).toHaveText("Back to Your steelmen");
});
