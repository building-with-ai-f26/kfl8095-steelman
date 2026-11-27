// Searching and sorting Your steelmen, with comment counts (M3d-13; E-03,
// E-04, E-05). A "Search steelmen" field filters the list by question and
// option text as you type, in the browser, so no search text reaches the
// service or PostHog. A Sort menu offers Recently updated, Newest, and Needs
// help, and the sort survives Back. Each post shows its open comment count.
// Posts a filter or a sort keeps slide to their new places, and posts it
// drops fade out; under reduced motion nothing moves. The layout copies
// GitHub's repository search with its Sort menu.

import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import { TEST_POSTHOG, expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";

const WIDTHS = [1280, 375] as const;
const HOUR = 3_600_000;
const LIBRARY = "Should our library open on Sundays?";
const CAFE = "Should the café stay open late?";
const GYM = "Should the gym open at six?";

const list = (page: Page): Locator => page.getByRole("list", { name: "Your steelmen" });
const posts = (page: Page): Locator => list(page).locator(":scope > li");
const questions = (page: Page): Locator => posts(page).getByRole("heading", { level: 2 });
const search = (page: Page): Locator => page.getByRole("searchbox", { name: "Search steelmen" });
/** The Sort button, whose name is the word Sort and then the chosen sort, as "Sort Newest". */
const sortButton = (page: Page): Locator => page.getByRole("button", { name: /^Sort\b/ });
const sortMenu = (page: Page): Locator => page.getByRole("menu", { name: "Sort steelmen" });

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Waits until nothing on the page is animating, as pages-polish.spec.ts does. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.clock.runFor(40);
}

/** Makes a board through the API as this person, and returns its ID. */
async function makeBoard(board: TestBoard, question: string): Promise<string> {
  const answer = (await board.api("maya.chen").post("../../boards", { question, options: ["Stay open", "Close at nine"], access: { general: "link", linkRole: "contributor" } })) as { board: string };
  return answer.board;
}

/**
 * Three boards for Maya. The café is made an hour in and the gym two hours in, both with no arguments yet, so both
 * need help. A vote moves the library up three hours in, and a comment moves the café up four hours in. Recently
 * updated is then café, library, gym; Newest is gym, café, library; and Needs help is café, gym, library.
 */
async function threeBoards(board: TestBoard): Promise<{ cafe: string; gym: string }> {
  board.clock.advance(HOUR);
  const cafe = await makeBoard(board, CAFE);
  board.clock.advance(HOUR);
  const gym = await makeBoard(board, GYM);
  board.clock.advance(HOUR);
  const snapshot = await board.api("tess.b").snapshot();
  await board.api("tess.b").put(`arguments/${snapshot.arguments[0].id}/importance`, { value: 1 });
  board.clock.advance(HOUR);
  await board.api("maya.chen").post(`../${cafe}/comments`, { id: board.ids.itemId(), body: "Who would staff the late shift?" });
  return { cafe, gym };
}

async function home(board: TestBoard, width: number, prepare?: (context: BrowserContext) => Promise<unknown>): Promise<Page> {
  const page = await board.open("maya.chen", { width, at: "/", ...(prepare ? { prepare } : {}) });
  await expect(list(page)).toBeVisible();
  await settled(page);
  return page;
}

/**
 * Runs before the page's own scripts: notes the question of every post of the list that's given a move (an animation
 * with a transform), so a test can tell that nothing moved even after the moves have ended.
 */
function recordPostMoves(): void {
  const moves: string[] = [];
  (window as unknown as { __postMoves: string[] }).__postMoves = moves;
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
    const frames = Array.isArray(keyframes) ? keyframes : keyframes ? [keyframes] : [];
    if (this.matches(".sm-feed-list > .sm-post") && frames.some((frame) => "transform" in frame)) moves.push(this.querySelector("h2")?.textContent ?? "");
    return animate.call(this, keyframes, options);
  };
}

/** The posts given a move since the page started, or since the record was last emptied. */
async function postMoves(page: Page): Promise<string[]> {
  return page.evaluate(() => [...(window as unknown as { __postMoves: string[] }).__postMoves]);
}

async function sortBy(page: Page, label: string): Promise<void> {
  await sortButton(page).click();
  await sortMenu(page).getByRole("menuitemradio", { name: label }).click();
  await expect(sortMenu(page)).toHaveCount(0);
}

for (const width of WIDTHS) {
  test(`E-03, E-05: at ${width} px, typing filters the list by question and option text, and with no match the page says so and Clear search brings every post back`, async ({ board }) => {
    await threeBoards(board);
    const page = await home(board, width);
    await expect(questions(page)).toHaveText([CAFE, LIBRARY, GYM]);
    await expect(search(page)).toHaveAttribute("placeholder", "Search steelmen");
    await expect(search(page)).toHaveClass(/ph-no-capture/);

    // The question, whatever its case.
    await search(page).fill("CAFÉ");
    await expect(questions(page)).toHaveText([CAFE]);
    await expect(page.getByRole("status").filter({ hasText: "1 steelman matches that search." })).toHaveCount(1);
    // An option's name.
    await search(page).fill("close at");
    await expect(questions(page)).toHaveText([CAFE, GYM]);
    await expect(page.getByRole("status").filter({ hasText: "2 steelmen match that search." })).toHaveCount(1);

    await search(page).fill("museum");
    await expect(posts(page)).toHaveCount(0);
    const none = page.locator(".sm-feed-nomatch");
    await expect(none).toContainText("No steelmen match that search.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await settled(page);
    await expectNoAxeViolations(page);

    await none.getByRole("button", { name: "Clear search" }).click();
    await expect(questions(page)).toHaveText([CAFE, LIBRARY, GYM]);
    await expect(search(page)).toHaveValue("");
    await expect(search(page)).toBeFocused();
    await expect(none).toHaveCount(0);
    await settled(page);
    expect(await page.locator("main [style], main[style]").count()).toBe(0);
    expect(board.errors).toEqual([]);
  });

  test(`E-03: at ${width} px, each post shows its open comment count with the speech-bubble icon, outside its options`, async ({ board }) => {
    await threeBoards(board);
    const page = await home(board, width);
    const cafe = posts(page).filter({ hasText: CAFE });
    const count = cafe.locator(".sm-post-foot .sm-post-comments");
    await expect(count).toHaveText("1 comment");
    await expect(count).toHaveAttribute("title", "1 comment");
    await expect(count.locator("svg.lucide-message-square")).toHaveCount(1);
    await expect(posts(page).filter({ hasText: LIBRARY }).locator(".sm-post-comments")).toHaveText("0 comments");
    await expect(cafe.getByRole("list", { name: "Options and how many arguments each has" }).getByRole("listitem")).toHaveText(["Stay open0", "Close at nine0"]);
    // The count is above the post's covering link, so its tooltip shows.
    const covered = await count.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest(".sm-post-comments") === element;
    });
    expect(covered).toBe(true);
  });

  test(`E-04: at ${width} px, the Sort menu orders the posts by Recently updated, Newest, and Needs help, and the sort survives Back`, async ({ board }) => {
    const { cafe } = await threeBoards(board);
    const page = await home(board, width);
    await expect(questions(page)).toHaveText([CAFE, LIBRARY, GYM]);
    // The button shows the chosen sort after the word Sort, as GitHub's Sort button shows its value.
    await expect(sortButton(page)).toHaveAccessibleName("Sort Recently updated");
    await expect(sortButton(page).locator(".sm-feed-sort-value")).toHaveText("Recently updated");

    await sortButton(page).click();
    const items = sortMenu(page).getByRole("menuitemradio");
    await expect(items).toHaveText([/^Recently updated/, /^Newest/, /^Needs help/]);
    await expect(items.nth(0)).toHaveAttribute("aria-checked", "true");
    await expect(items.nth(1)).toHaveAttribute("aria-checked", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await settled(page);
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");

    await sortBy(page, "Newest");
    await expect(questions(page)).toHaveText([GYM, CAFE, LIBRARY]);
    await expect(page.getByRole("status").filter({ hasText: "The newest steelmen come first." })).toHaveCount(1);
    await expect(sortButton(page)).toHaveAccessibleName("Sort Newest");
    await sortBy(page, "Needs help");
    await expect(questions(page)).toHaveText([CAFE, GYM, LIBRARY]);
    await expect(sortButton(page)).toHaveAccessibleName("Sort Needs help");
    await expect(page.getByRole("status").filter({ hasText: "Steelmen with an option under two arguments come first." })).toHaveCount(1);
    await sortBy(page, "Newest");
    await settled(page);

    // Opened inside the page, and back again.
    await posts(page).filter({ hasText: CAFE }).getByRole("link", { name: CAFE }).click();
    await expect(page).toHaveURL(new RegExp(`/b/${cafe}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(CAFE);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(questions(page)).toHaveText([GYM, CAFE, LIBRARY]);
    // A reader who comes back sees why the order is what it is.
    await expect(sortButton(page)).toHaveAccessibleName("Sort Newest");
    await sortButton(page).click();
    await expect(sortMenu(page).getByRole("menuitemradio", { name: /^Newest/ })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");

    // Opened by loading its page, and back again.
    await page.goto(`/b/${board.demo.board}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(LIBRARY);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(questions(page)).toHaveText([GYM, CAFE, LIBRARY]);

    // Recently updated is the default again, and leaves the address as it was.
    await expect(sortButton(page)).toHaveAccessibleName("Sort Newest");
    await sortBy(page, "Recently updated");
    await expect(questions(page)).toHaveText([CAFE, LIBRARY, GYM]);
    await expect(sortButton(page)).toHaveAccessibleName("Sort Recently updated");
    await expect(page).toHaveURL(/\/$/);
  });

  test(`E-03, E-04, E-05: at ${width} px, the search and the Sort menu work by keyboard alone`, async ({ board }) => {
    await threeBoards(board);
    const page = await home(board, width);

    for (let tab = 0; tab < 20 && !(await search(page).evaluate((element) => element === document.activeElement)); tab++) await page.keyboard.press("Tab");
    await expect(search(page)).toBeFocused();
    // The field's own edge carries the ring, as Share's invite field does (M3d-10).
    const ring = await page.locator(".sm-search").evaluate((element) => ({ style: getComputedStyle(element).outlineStyle, width: getComputedStyle(element).outlineWidth, offset: getComputedStyle(element).outlineOffset }));
    expect(ring).toEqual({ style: "solid", width: "2px", offset: "1px" });
    await page.keyboard.type("gym");
    await expect(questions(page)).toHaveText([GYM]);
    for (let letter = 0; letter < "gym".length; letter++) await page.keyboard.press("Backspace");
    await expect(questions(page)).toHaveText([CAFE, LIBRARY, GYM]);

    await page.keyboard.press("Tab");
    await expect(sortButton(page)).toBeFocused();
    await expect(sortButton(page)).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(sortMenu(page)).toBeVisible();
    await expect(sortButton(page)).toHaveAttribute("aria-expanded", "true");
    // The cursor starts on the chosen sort, and the arrow keys, Home, and End move it.
    const item = (name: RegExp) => sortMenu(page).getByRole("menuitemradio", { name });
    await expect(item(/^Recently updated/)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(item(/^Newest/)).toBeFocused();
    await page.keyboard.press("End");
    await expect(item(/^Needs help/)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(item(/^Recently updated/)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(item(/^Needs help/)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(item(/^Recently updated/)).toBeFocused();
    // Escape closes it and puts the cursor back on Sort, and nothing changes.
    await page.keyboard.press("Escape");
    await expect(sortMenu(page)).toHaveCount(0);
    await expect(sortButton(page)).toBeFocused();
    await expect(questions(page)).toHaveText([CAFE, LIBRARY, GYM]);

    // The down arrow opens it too; Enter chooses, closes it, and puts the cursor back on Sort.
    await page.keyboard.press("ArrowDown");
    await expect(item(/^Recently updated/)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(sortMenu(page)).toHaveCount(0);
    await expect(sortButton(page)).toBeFocused();
    await expect(questions(page)).toHaveText([GYM, CAFE, LIBRARY]);

    // Tab closes it as well and goes on from Sort to the first post's question, as the ARIA menu button pattern has it.
    await page.keyboard.press("Space");
    await expect(sortMenu(page)).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(sortMenu(page)).toHaveCount(0);
    await expect(questions(page).first().getByRole("link")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(sortButton(page)).toBeFocused();
  });

  test(`M-15, E-04, E-05: at ${width} px, posts a filter or a sort keeps slide to their new places, posts it drops fade out, and nothing is left behind`, async ({ board }) => {
    const { gym } = await threeBoards(board);
    // Every move a post is given, from the page's start, so a move that has already ended still counts.
    const page = await board.open("maya.chen", { width, at: "/", prepare: (context) => context.addInitScript(recordPostMoves) });
    await expect(list(page)).toBeVisible();
    await expect(questions(page)).toHaveText([CAFE, LIBRARY, GYM]);
    // A list drawn the first time doesn't move.
    expect(await postMoves(page)).toEqual([]);
    await settled(page);

    await sortBy(page, "Newest");
    const moved = await page.evaluate(() => document.getAnimations().filter((animation) => (animation.effect as KeyframeEffect | null)?.target?.matches(".sm-feed-list > .sm-post")).length);
    expect(moved).toBeGreaterThan(0);
    expect((await postMoves(page)).length).toBeGreaterThan(0);
    await settled(page);

    await search(page).fill("gym");
    // The copies are hidden from screen readers and the cursor, and aren't posts of the list. Both are read in the
    // same frame that finds them, before their fade ends.
    await page.waitForFunction(() => {
      const copies = [...document.querySelectorAll(".sm-post-leaving")];
      return copies.length === 2 && copies.every((copy) => copy.closest("[aria-hidden=true]") && copy.closest("[inert]") && !copy.closest(".sm-feed-list") && !copy.querySelector("a[href]"));
    });
    const leaving = page.locator(".sm-post-leaving");
    await expect(questions(page)).toHaveText([GYM]);
    await settled(page);
    await expect(leaving).toHaveCount(0);
    expect(await page.locator("main [style], main[style]").count()).toBe(0);

    // Posts a search brings back fade in where they stand.
    await search(page).fill("");
    await expect(questions(page)).toHaveText([GYM, CAFE, LIBRARY]);
    await settled(page);
    expect(await page.locator("main [style], main[style]").count()).toBe(0);
    await expectNoAxeViolations(page);

    // Back from a board opened here, and the fresh read of the list that follows, move nothing. A comment made while
    // the board is open moves the gym to the top of Recently updated and changes its count, so the fresh read changes
    // the order, and nothing slides to it.
    await sortBy(page, "Recently updated");
    await expect(questions(page)).toHaveText([CAFE, LIBRARY, GYM]);
    await settled(page);
    await page.evaluate(() => void ((window as unknown as { __postMoves: string[] }).__postMoves.length = 0));
    await posts(page).filter({ hasText: CAFE }).getByRole("link", { name: CAFE }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(CAFE);
    board.clock.advance(HOUR);
    await board.api("maya.chen").post(`../${gym}/comments`, { id: board.ids.itemId(), body: "Who would open the doors?" });
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(list(page)).toBeVisible();
    expect(await postMoves(page)).toEqual([]);
    await expect(questions(page)).toHaveText([GYM, CAFE, LIBRARY]);
    await expect(posts(page).filter({ hasText: GYM }).locator(".sm-post-comments")).toHaveText("1 comment");
    expect(await postMoves(page)).toEqual([]);
    await settled(page);
    expect(await postMoves(page)).toEqual([]);
  });

  test(`M-15, E-04, E-05: at ${width} px, under reduced motion a filter or a sort moves nothing and leaves no copy`, async ({ board }) => {
    await threeBoards(board);
    const page = await board.open("maya.chen", { width, at: "/" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(list(page)).toBeVisible();

    await sortButton(page).click();
    await sortMenu(page).getByRole("menuitemradio", { name: /^Newest/ }).click();
    await expect(questions(page)).toHaveText([GYM, CAFE, LIBRARY]);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await search(page).fill("gym");
    await expect(questions(page)).toHaveText([GYM]);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(page.locator(".sm-post-leaving")).toHaveCount(0);
  });
}

/** Stands in for PostHog's script: notes every call made to it, as analytics.spec.ts does. */
const RECORDER = `(() => {
  const queued = window.posthog;
  const calls = (window.__posthogCalls = []);
  for (const [key, options] of queued._i) calls.push(["init", key, options]);
  for (const call of queued) calls.push(call);
  window.posthog = new Proxy({ __loaded: true }, { get: (target, name) => (name in target ? target[name] : (...args) => void calls.push([name, ...args])) });
})();`;

test.describe("with a PostHog key", () => {
  test.use({ analytics: true });

  test("E-05, M-08: with the PostHog recorder on, nothing sent holds the search text", async ({ board }) => {
    await threeBoards(board);
    const sent: string[] = [];
    const page = await home(board, 1280, async (context) => {
      await context.route(`${TEST_POSTHOG.host}/**`, (route) => {
        sent.push(route.request().url(), route.request().postData() ?? "");
        return route.fulfill({ contentType: "text/javascript", body: RECORDER });
      });
      context.on("request", (request) => {
        if (new URL(request.url()).pathname.startsWith("/api/")) sent.push(request.url(), request.postData() ?? "");
      });
    });
    await page.waitForFunction(() => Array.isArray((window as unknown as { __posthogCalls?: unknown }).__posthogCalls));

    // Text found nowhere else on the page, so finding it anywhere means the search sent it.
    const typed = "Zebracrossing";
    await search(page).pressSequentially(typed);
    await expect(page.locator(".sm-feed-nomatch")).toBeVisible();
    await search(page).press("Enter");
    await sortBy(page, "Newest");
    // Something the app does send, to show the recorder is listening: a board opened and closed again.
    await search(page).fill("gym");
    await posts(page).first().getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(GYM);
    await page.goBack();
    await expect(list(page)).toBeVisible();
    await search(page).fill(typed);
    await page.clock.runFor(1000);

    const calls = await page.evaluate(() => (window as unknown as { __posthogCalls: unknown[] }).__posthogCalls);
    expect(calls.length).toBeGreaterThan(1);
    expect(JSON.stringify(calls).toLowerCase()).not.toContain(typed.toLowerCase());
    expect(sent.length).toBeGreaterThan(0);
    for (const each of sent) expect(each.toLowerCase()).not.toContain(typed.toLowerCase());
    // Nor the address, the history entry, or the browser's storage.
    const kept = await page.evaluate(() => JSON.stringify([location.href, history.state, { ...sessionStorage }, { ...localStorage }]));
    expect(kept.toLowerCase()).not.toContain(typed.toLowerCase());
  });
});
