// plans/build-plan.md, M3d-9, "Board and Strongest case zoom, and a board
// opens from its miniature" (E-07, E-01, M-15), at 1280 and 375 px. The View
// switch scales the scene from the card nearest the middle of the window, as
// the prototype's zoomTo() does (docs/prototype/source/steelman-refined.html).
// A board opened from Your steelmen grows out of its post's miniature, as the
// prototype's growFrom() does, and the wordmark or Back shrinks a copy of it
// into the miniature again, as its shrinkInto() does, once the list it holds
// in memory is drawn. On a phone the miniature isn't drawn, so the post
// itself is what the board grows from and shrinks into. A reload and a deep
// link play nothing, and neither does anything under reduced motion.
//
// Web Animations run on the page's own timeline, which Playwright's clock
// doesn't move, so the tests catch each new animation the moment it starts,
// hold it paused, and set its time themselves, as hide-columns.spec.ts does.
// Its helpers are copied here, not imported, so that file stays as it is.

import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { importance, pill, status } from "./support/screen.ts";

const WIDTHS = [1280, 375] as const;
const QUESTION = "Should our library open on Sundays?";
const CAFE = "Should the café stay open late?";
const LEAD = "Sunday is the only free day for many people who work weekdays.";
const HOUR = 3_600_000;

const list = (page: Page): Locator => page.getByRole("list", { name: "Your steelmen" });
const posts = (page: Page): Locator => list(page).locator(":scope > li");
const questions = (page: Page): Locator => posts(page).getByRole("heading", { level: 2 });
const view = (page: Page, name: "Board" | "Strongest case"): Locator => page.getByRole("group", { name: "View" }).getByRole("button", { name, exact: true });
const wordmark = (page: Page): Locator => page.getByRole("link", { name: /Your steelmen/ });
const SWITCH_TO_CASE = '.sm-zoom button[aria-label="Strongest case"]';
const SWITCH_TO_BOARD = '.sm-zoom button[aria-label="Board"]';
const linkTo = (id: string) => `.sm-post h2 a[href="/b/${id}"]`;

/** A test account's browser on the home page. */
async function home(board: TestBoard, width: number, prepare?: (context: BrowserContext) => Promise<unknown>): Promise<Page> {
  const page = await board.open("jordan_w", { width, ...(prepare ? { prepare } : {}) });
  await page.goto("/");
  await expect(list(page)).toBeVisible();
  await settled(page);
  return page;
}

/** Makes a board through the API as this person, and returns its ID. */
async function makeBoard(board: TestBoard, question: string): Promise<string> {
  const answer = (await board.api("jordan_w").post("../../boards", { question, options: ["Stay open", "Close at nine"], access: { general: "link", linkRole: "contributor" } })) as { board: string };
  return answer.board;
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Waits until nothing on the page is animating, CSS included, as hide-columns.spec.ts does. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.clock.runFor(40);
}

interface Place {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The question, every column, row and card on screen, by what it is and its ID, on the page itself (independent of scrolling). */
function places(page: Page): Promise<Record<string, Place>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>(".sm-head, .sm-board > .sm-column, [data-node], .sm-card[data-card]")].flatMap((element) => {
        const { left, top, width, height } = element.getBoundingClientRect();
        if (!width && !height) return [];
        const key = element.dataset.node !== undefined ? `node:${element.dataset.node}` : element.dataset.card !== undefined ? `card:${element.dataset.card}` : `${element.className.split(" ")[0]}:${element.dataset.option ?? ""}`;
        return [[key, { left: left + window.scrollX, top: top + window.scrollY, width, height }]];
      }),
    ),
  );
}

function near(a: Record<string, Place>, b: Record<string, Place>, within: number): string[] {
  const problems = Object.keys(a).length === Object.keys(b).length ? [] : [`${Object.keys(a).length} places, not ${Object.keys(b).length}`];
  for (const [id, place] of Object.entries(a)) {
    const other = b[id];
    if (!other) problems.push(`${id} is missing`);
    else if ((["left", "top", "width", "height"] as const).some((side) => Math.abs(place[side] - other[side]) > within)) problems.push(`${id} is at ${JSON.stringify(place)}, not ${JSON.stringify(other)}`);
  }
  return problems;
}

/** How far apart two rects are, side by side: the largest difference of left, top and width. */
function apart(a: Place, b: Place): number {
  return Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width));
}

/** Where an element is drawn now, in the window's pixels, with any transform on it or its ancestors. */
function rectOf(page: Page, selector: string): Promise<Place> {
  return page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Nothing matches ${selector}`);
    const { left, top, width, height } = element.getBoundingClientRect();
    return { left, top, width, height };
  }, selector);
}

/** The post's miniature, where it's drawn, or the post itself where the miniature isn't drawn (on a phone). */
function miniature(page: Page, id: string): Promise<Place> {
  return page.evaluate((id) => {
    const post = document.querySelector(`.sm-post h2 a[href="/b/${id}"]`)?.closest(".sm-post");
    if (!post) throw new Error(`No post for ${id}`);
    const thumb = post.querySelector(".sm-thumb")!.getBoundingClientRect();
    const { left, top, width, height } = thumb.width ? thumb : post.getBoundingClientRect();
    return { left, top, width, height };
  }, id);
}

/** The card nearest the middle of the window, as the prototype's centerCard() finds it, and where it's drawn. */
function centredCard(page: Page): Promise<{ id: string; rect: Place }> {
  return page.evaluate(() => {
    const middle = window.innerHeight / 2;
    let best: { id: string; rect: DOMRect; distance: number } | null = null;
    for (const card of document.querySelectorAll<HTMLElement>(".sm-card[data-card]")) {
      const rect = card.getBoundingClientRect();
      if (!rect.width) continue;
      const distance = Math.abs(rect.top + rect.height / 2 - middle);
      if (!best || distance < best.distance) best = { id: card.dataset.card!, rect, distance };
    }
    if (!best) throw new Error("No card on screen");
    const { left, top, width, height } = best.rect;
    return { id: best.id, rect: { left, top, width, height } };
  });
}

/** How much of an element of this height an inset() clip leaves showing: "inset(0px 0px calc(100% - 152px) round 6px)". */
function shownHeight(clip: string, height: number): number {
  const fromTop = /calc\(100% - ([\d.]+)px\)/.exec(clip);
  if (fromTop) return parseFloat(fromTop[1]!);
  const sides = (/inset\(([^)]*?)(?: round [^)]*)?\)/.exec(clip)?.[1] ?? "").trim().split(/\s+/).map(parseFloat);
  return height - (sides.length >= 3 ? sides[2]! : sides[0]!);
}

/** --sm-slow, in ms, as the page reads it. */
function slow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--sm-slow").trim();
    const number = parseFloat(value);
    return value.endsWith("ms") || !value.endsWith("s") ? number : number * 1000;
  });
}

interface Caught {
  /** "scene", "surface", or "copy" (the board's copy shrinking into the list), else the element's class. */
  on: string;
  keyframes: Record<string, string>[];
  duration: number;
}

/**
 * Clicks the element in the page itself, or goes Back, and holds the Web Animations that start after it, paused, under
 * `name`, before any has run more than a few ms, as hide-columns.spec.ts's clickAndCatch does.
 */
function actAndCatch(page: Page, name: string, action: { click: string } | "back"): Promise<Caught[]> {
  return page.evaluate(
    async ({ name, action }) => {
      const ours = () => document.getAnimations().filter((animation) => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition));
      const earlier = new Set(ours());
      if (action === "back") window.history.back();
      else {
        const target = document.querySelector<HTMLElement>(action.click);
        if (!target) throw new Error(`Nothing matches ${action.click}`);
        target.click();
      }
      let held: Animation[] = [];
      const start = document.timeline.currentTime as number;
      while (!held.length && (document.timeline.currentTime as number) - start < 5_000) {
        await new Promise((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = resolve;
          channel.port2.postMessage(null);
        });
        held = ours().filter((animation) => !earlier.has(animation));
      }
      for (const animation of held) animation.pause();
      (window as unknown as Record<string, Animation[]>)[name] = held;
      const on = (element: Element): string => {
        if (element.closest(".sm-closing-layer")) return "copy";
        if (element.matches(".sm-scene")) return "scene";
        if (element.matches(".sm-surface")) return "surface";
        return element.className;
      };
      return held.map((animation) => {
        const effect = animation.effect as KeyframeEffect;
        return {
          on: on(effect.target!),
          keyframes: effect.getKeyframes().map((keyframe) =>
            Object.fromEntries(Object.entries(keyframe).flatMap(([key, value]) => (["offset", "easing", "composite", "computedOffset"].includes(key) ? [] : [[key, String(value)]]))),
          ),
          duration: Number(effect.getComputedTiming().duration),
        };
      });
    },
    { name, action },
  );
}

/** Sets every held animation to the same moment, and lets the wires catch up with it. */
async function frameAt(page: Page, name: string, ms: number): Promise<void> {
  await page.evaluate(
    ({ name, ms }) => {
      for (const animation of (window as unknown as Record<string, Animation[]>)[name]!) if (animation.playState !== "idle") animation.currentTime = ms;
    },
    { name, ms },
  );
  await page.clock.runFor(40);
}

/** Lets the held animations run to their end, and waits until no Web Animation is left on the page. */
async function finish(page: Page, name: string): Promise<void> {
  await page.evaluate((name) => {
    for (const animation of (window as unknown as Record<string, Animation[]>)[name]!) if (animation.playState !== "idle") animation.finish();
  }, name);
  await settled(page);
}

/** Counts every Web Animation the page starts from now on. */
async function countAnimations(page: Page): Promise<void> {
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    const counted = window as unknown as { animationsStarted: number };
    counted.animationsStarted = 0;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      // A board drawing itself as it opens (M3d-23) isn't a grow or a shrink, so it isn't counted.
      const options = args[1];
      if (!(typeof options === "object" && options?.id === "sm-draw-in")) counted.animationsStarted++;
      return animate.apply(this, args);
    };
  });
}

/** Counts every Web Animation each page in this browser session starts, from the moment it loads. */
const countFromLoad = (context: BrowserContext) =>
  context.addInitScript(() => {
    const animate = Element.prototype.animate;
    const counted = window as unknown as { animationsStarted: number };
    counted.animationsStarted = 0;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      // A board drawing itself as it opens (M3d-23) isn't a grow or a shrink, so it isn't counted.
      const options = args[1];
      if (!(typeof options === "object" && options?.id === "sm-draw-in")) counted.animationsStarted++;
      return animate.apply(this, args);
    };
  });

const started = (page: Page) => page.evaluate(() => (window as unknown as { animationsStarted: number }).animationsStarted);

/** Counts the Web Animations the page starts from now on on the board's surface or its copy: a grow or a shrink. */
async function countShrinks(page: Page): Promise<void> {
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    const counted = window as unknown as { shrinksStarted: number };
    counted.shrinksStarted = 0;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      if (this.closest(".sm-closing-layer, .sm-surface")) counted.shrinksStarted++;
      return animate.apply(this, args);
    };
  });
}

const shrinksStarted = (page: Page) => page.evaluate(() => (window as unknown as { shrinksStarted: number }).shrinksStarted);

/** A few frames after a catch, how many Web Animations other than the held ones run: none, if the action started only those. */
async function othersThan(page: Page, name: string): Promise<number> {
  await page.clock.runFor(40);
  return page.evaluate(
    (name) =>
      document
        .getAnimations()
        .filter((animation) => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition) && !(window as unknown as Record<string, Animation[]>)[name]!.includes(animation)).length,
    name,
  );
}

/** Votes on the Sunday argument and waits until the service has it and nothing is waiting to send. */
async function vote(page: Page): Promise<void> {
  const answered = page.waitForResponse((response) => response.url().includes("/importance") && response.request().method() === "PUT");
  await importance(page, LEAD).getByRole("button", { name: "More important if true" }).click();
  await answered;
  await page.waitForResponse((response) => response.url().includes("/changes?"));
  await settled(page);
}

for (const width of WIDTHS) {
  test(`E-01 M-15: at ${width} px, the View switch scales the scene from the centred card in one animation on --sm-slow, and each view ends at its own layout`, async ({ board }) => {
    const page = await board.open("jordan_w", { width });
    await settled(page);
    const centre = await centredCard(page);

    const toCase = await actAndCatch(page, "case", { click: SWITCH_TO_CASE });
    expect(toCase.map((caught) => caught.on)).toEqual(["scene"]);
    expect(await othersThan(page, "case")).toBe(0);
    expect(toCase[0]!.duration).toBe(await slow(page));
    expect(toCase[0]!.keyframes[0]!.transform).toMatch(/scale\(/);
    expect(toCase[0]!.keyframes.at(-1)!.transform).toBe("none");
    // At its first frame the centred card is drawn in Strongest case where it was on the board.
    await frameAt(page, "case", 0);
    expect(apart(await rectOf(page, `.sm-card[data-card="${centre.id}"]`), centre.rect)).toBeLessThan(1.5);
    await finish(page, "case");
    await expect(view(page, "Strongest case")).toHaveAttribute("aria-pressed", "true");
    expect(await page.locator(".sm-scene").getAttribute("style")).toBeNull();

    // The same switch with no motion, on a second page, is today's layout.
    const still = await board.open("jordan_w", { width });
    await still.emulateMedia({ reducedMotion: "reduce" });
    await view(still, "Strongest case").click();
    await settled(still);
    expect(near(await places(page), await places(still), 1)).toEqual([]);

    const toBoard = await actAndCatch(page, "board", { click: SWITCH_TO_BOARD });
    expect(toBoard.map((caught) => caught.on)).toEqual(["scene"]);
    expect(await othersThan(page, "board")).toBe(0);
    await finish(page, "board");
    const fresh = await board.open("jordan_w", { width });
    await settled(fresh);
    expect(near(await places(page), await places(fresh), 1)).toEqual([]);
    expect(await page.locator(".sm-scene").getAttribute("style")).toBeNull();
  });

  test(`E-07 M-15: at ${width} px, a board opened from the list grows out of its post's miniature, and Back shrinks it into the miniature again`, async ({ board }) => {
    const page = await home(board, width);
    const from = await miniature(page, board.demo.board);

    const grow = await actAndCatch(page, "grow", { click: linkTo(board.demo.board) });
    expect(grow.map((caught) => caught.on)).toEqual(["surface"]);
    expect(await othersThan(page, "grow")).toBe(0);
    expect(grow[0]!.duration).toBe(await slow(page));
    await expect(page).toHaveURL(new RegExp(`/b/${board.demo.board}$`));
    // The first frame covers the miniature, cut to its height; the last is the board as it's drawn.
    await frameAt(page, "grow", 0);
    const first = await rectOf(page, ".sm-surface");
    expect(apart(first, from)).toBeLessThan(1.5);
    const surfaceSize = await page.locator(".sm-surface").evaluate((surface: HTMLElement) => ({ width: surface.offsetWidth, height: surface.offsetHeight }));
    expect(Math.abs(shownHeight(grow[0]!.keyframes[0]!.clipPath ?? "", surfaceSize.height) * (first.width / surfaceSize.width) - from.height)).toBeLessThan(1.5);
    expect(grow[0]!.keyframes.at(-1)!.transform).toBe("none");
    await finish(page, "grow");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    expect(await page.locator(".sm-surface").getAttribute("style")).toBeNull();
    const deepLink = await board.open("jordan_w", { width });
    await settled(deepLink);
    expect(near(await places(page), await places(deepLink), 1)).toEqual([]);

    const shrink = await actAndCatch(page, "shrink", "back");
    expect(shrink.map((caught) => caught.on)).toEqual(["copy"]);
    expect(await othersThan(page, "shrink")).toBe(0);
    expect(shrink[0]!.duration).toBe(await slow(page));
    await expect(page).toHaveURL(/\/$/);
    await expect(questions(page)).toHaveText([QUESTION]);
    const into = await miniature(page, board.demo.board);
    // Just before its end the copy covers the miniature.
    await frameAt(page, "shrink", shrink[0]!.duration - 0.01);
    expect(apart(await rectOf(page, ".sm-closing-layer > *"), into)).toBeLessThan(1.5);
    await finish(page, "shrink");
    await expect(page.locator(".sm-closing-layer > *")).toHaveCount(0);
    // The cursor goes back to the post's question, as a photo closed into its grid leaves it on its thumbnail.
    await expect(page.locator(linkTo(board.demo.board))).toBeFocused();
  });

  test(`E-07 M-15: at ${width} px, after a vote, Back shrinks the board into its post's new place at the top of the list`, async ({ board }) => {
    board.clock.advance(HOUR);
    await makeBoard(board, CAFE);
    const page = await home(board, width);
    await expect(questions(page)).toHaveText([CAFE, QUESTION]);
    await page.locator(linkTo(board.demo.board)).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    await settled(page);
    board.clock.advance(HOUR);
    await vote(page);

    const shrink = await actAndCatch(page, "shrink", "back");
    expect(shrink.map((caught) => caught.on)).toEqual(["copy"]);
    expect(await othersThan(page, "shrink")).toBe(0);
    await expect(questions(page)).toHaveText([QUESTION, CAFE]);
    const into = await miniature(page, board.demo.board);
    expect(into).toEqual(await page.evaluate(() => {
      const post = document.querySelector(".sm-feed-list > li")!;
      const thumb = post.querySelector(".sm-thumb")!.getBoundingClientRect();
      const { left, top, width, height } = thumb.width ? thumb : post.getBoundingClientRect();
      return { left, top, width, height };
    }));
    await frameAt(page, "shrink", shrink[0]!.duration - 0.01);
    expect(apart(await rectOf(page, ".sm-closing-layer > *"), into)).toBeLessThan(1.5);
    await finish(page, "shrink");
    await expect(page.locator(".sm-closing-layer > *")).toHaveCount(0);
  });

  // The page transition this case plays comes with M3d-11; this test checks only that nothing shrinks.
  test(`E-07 M-15: at ${width} px, when the post is off screen, Back changes the page with no motion and shrinks nothing, until M3d-11's page transition`, async ({ board }) => {
    board.clock.advance(60_000);
    for (let n = 1; n <= 12; n++) await makeBoard(board, `Should the library add a branch number ${n}?`);
    const page = await home(board, width);
    await expect(posts(page)).toHaveCount(13);
    await expect(questions(page).last()).toHaveText(QUESTION);
    // The oldest board is the last post; the click scrolls it into view.
    await page.locator(linkTo(board.demo.board)).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    await settled(page);
    board.clock.advance(HOUR);
    await vote(page);

    await countShrinks(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(questions(page).first()).toHaveText(QUESTION);
    // The list is back where it was scrolled, so the post, now at the top, is off screen.
    await expect(posts(page).first()).not.toBeInViewport();
    await settled(page);
    expect(await shrinksStarted(page)).toBe(0);
    await expect(page.locator(".sm-closing-layer > *")).toHaveCount(0);
  });

  test(`E-07: at ${width} px, the browser's own Back and Forward still work, and a reload and a deep link grow and shrink nothing`, async ({ board }) => {
    // A deep link.
    const page = await board.open("jordan_w", { width, prepare: countFromLoad });
    await settled(page);
    expect(await started(page)).toBe(0);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    await settled(page);
    expect(await started(page)).toBe(0);
    // Opened by its link, the board didn't come from the list, so the wordmark leads there with no motion.
    await wordmark(page).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(questions(page)).toHaveText([QUESTION]);
    await settled(page);
    expect(await started(page)).toBe(0);

    await page.locator(linkTo(board.demo.board)).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    await settled(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(questions(page)).toHaveText([QUESTION]);
    await settled(page);
    // Forward opens the board with no miniature clicked, so nothing grows.
    await countAnimations(page);
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/b/${board.demo.board}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    await settled(page);
    expect(await started(page)).toBe(0);
    // The wordmark goes back to the list it came from, as Back does.
    await wordmark(page).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(questions(page)).toHaveText([QUESTION]);
    await page.goForward();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    // A reload of the board opened from the list plays nothing either.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    await settled(page);
    expect(await started(page)).toBe(0);
  });

  test(`E-01: at ${width} px, Escape on Strongest case returns to Board with the cursor on the View switch, and Escape on Board stays`, async ({ board }) => {
    const page = await board.open("jordan_w", { width });
    await view(page, "Strongest case").click();
    await expect(view(page, "Strongest case")).toHaveAttribute("aria-pressed", "true");
    await settled(page);

    await page.keyboard.press("Escape");
    await expect(view(page, "Board")).toHaveAttribute("aria-pressed", "true");
    await expect(view(page, "Board")).toBeFocused();
    await expect(status(page)).toHaveText("Board.");
    await settled(page);

    await page.keyboard.press("Escape");
    await expect(view(page, "Board")).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(new RegExp(`/b/${board.demo.board}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  });

  test(`E-01 M-15: at ${width} px, choosing an argument in Strongest case zooms from its card`, async ({ board }) => {
    const page = await board.open("jordan_w", { width });
    await view(page, "Strongest case").click();
    await expect(view(page, "Strongest case")).toHaveAttribute("aria-pressed", "true");
    await settled(page);
    // An argument other than the centred one, so that the zoom is seen to start from the card chosen.
    const centre = await centredCard(page);
    const ids = await page.locator(".sm-case-card[data-card]").evaluateAll((cards) => cards.map((card) => (card as HTMLElement).dataset.card!));
    const chosen = ids.filter((id) => id !== centre.id).at(-1)!;
    const from = await rectOf(page, `.sm-case-card[data-card="${chosen}"]`);

    const back = await actAndCatch(page, "chosen", { click: `.sm-case-card[data-card="${chosen}"] .sm-claim-button` });
    expect(back.map((caught) => caught.on)).toEqual(["scene"]);
    expect(await othersThan(page, "chosen")).toBe(0);
    // At its first frame the chosen argument's card on the board is drawn where its card was in Strongest case.
    await frameAt(page, "chosen", 0);
    expect(apart(await rectOf(page, `.sm-card[data-card="${chosen}"]`), from)).toBeLessThan(1.5);
    await finish(page, "chosen");
    await expect(view(page, "Board")).toHaveAttribute("aria-pressed", "true");
  });

  test(`E-01: at ${width} px, Escape in a field on Strongest case stays on Strongest case`, async ({ board }) => {
    const page = await board.open("jordan_w", { width });
    await view(page, "Strongest case").click();
    await expect(view(page, "Strongest case")).toHaveAttribute("aria-pressed", "true");
    await settled(page);
    const field = page.getByRole("combobox", { name: "Acting as" });
    await field.focus();

    await page.keyboard.press("Escape");
    await expect(field).toBeFocused();
    await expect(view(page, "Strongest case")).toHaveAttribute("aria-pressed", "true");
  });

  test(`M-15: at ${width} px, under reduced motion, the View switch, opening a board from the list, and Back start no animation`, async ({ board }) => {
    const page = await home(board, width);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await countAnimations(page);

    await page.locator(linkTo(board.demo.board)).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    await view(page, "Strongest case").click();
    await expect(view(page, "Strongest case")).toHaveAttribute("aria-pressed", "true");
    await view(page, "Board").click();
    await expect(view(page, "Board")).toHaveAttribute("aria-pressed", "true");
    await page.goBack();
    await expect(questions(page)).toHaveText([QUESTION]);

    expect(await page.evaluate(() => document.getAnimations().filter((animation) => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition)).length)).toBe(0);
    expect(await started(page)).toBe(0);
    await expect(page.locator(".sm-closing-layer > *")).toHaveCount(0);
  });

  test(`E-07 E-01 M-04: at ${width} px, the board, Strongest case, and the list pass an accessibility scan once the motion settles`, async ({ board }) => {
    const page = await home(board, width);
    await page.locator(linkTo(board.demo.board)).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    await settled(page);
    await expectNoAxeViolations(page);

    await view(page, "Strongest case").click();
    await settled(page);
    await expectNoAxeViolations(page);
    await view(page, "Board").click();
    await settled(page);

    await page.goBack();
    await expect(questions(page)).toHaveText([QUESTION]);
    await settled(page);
    await expectNoAxeViolations(page);
  });
}

test("E-01: Escape that closes the share panel in Strongest case leaves the view, and the next Escape returns to Board", async ({ board }) => {
  const page = await board.open("maya.chen");
  await view(page, "Strongest case").click();
  await settled(page);
  const share = page.getByRole("button", { name: /^(Anyone with the link|Invited only)$/ });
  await share.click();
  await expect(share).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Escape");
  await expect(share).toHaveAttribute("aria-expanded", "false");
  await expect(view(page, "Strongest case")).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Escape");
  await expect(view(page, "Board")).toHaveAttribute("aria-pressed", "true");
  await expect(view(page, "Board")).toBeFocused();
});

test("E-07 M-02: leaving a board opened from the list with actions waiting still brings up the leave prompt, by the wordmark or by Back", async ({ board }) => {
  const page = await home(board, 1280);
  await page.locator(linkTo(board.demo.board)).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  await page.context().setOffline(true);
  await importance(page, LEAD).getByRole("button", { name: "More important if true" }).click();
  await expect(pill(page)).toHaveText("Offline · 1 waiting to send");
  const asked: string[] = [];
  page.on("dialog", async (dialog) => {
    asked.push(dialog.type());
    await dialog.dismiss();
  });

  await wordmark(page).click();
  await expect.poll(() => asked).toEqual(["beforeunload"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  await expect(pill(page)).toHaveText("Offline · 1 waiting to send");

  await page.evaluate(() => window.history.back());
  await expect.poll(() => asked).toEqual(["beforeunload", "beforeunload"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  await expect(page).toHaveURL(new RegExp(`/b/${board.demo.board}$`));
  await expect(pill(page)).toHaveText("Offline · 1 waiting to send");
});
