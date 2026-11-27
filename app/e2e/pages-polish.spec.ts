// plans/build-plan.md, M3d-11, "A polish pass on Home, New steelman, Your
// account, and the privacy page" (E-03, L-04, M-13, M-15), at 1280 and 375 px.
// Four changes, each with its test here, and the rule-13 pass on the lines
// these pages say.
//
// 1. The pages change with a short crossfade and rise. A link between Home,
//    New steelman, Your account, and the privacy page still loads the page, and
//    the browser's own view transition draws the new page rising over a
//    picture of the old one, so nothing of the old page stays in the document.
//    Leaving a board or opening one plays no page transition, as M3d-9's deep
//    link plays nothing. Back from a board opened from the list, when its post
//    is off screen, now plays the same change inside the page: the board's
//    copy fades and the list rises (the case zoom-motion.spec.ts left "until
//    M3d-11's page transition").
// 2. Home shows skeleton posts in the list's own layout while it loads, and a
//    list post lifts a pixel on hover and settles as it's pressed.
// 3. Buttons share one press (a small scale on :active) and one busy state
//    (data-busy: still at first, then a slow pulse).
// 4. The rows on Your account enter on the tokens, in reading order.
//
// Under reduced motion nothing animates. The view transition's animations run
// on pseudo-elements, so they're read from document.getAnimations() at the
// transition's `ready`, by an init script on every page. Helpers are copied
// from zoom-motion.spec.ts and board-polish.spec.ts, not imported, so those
// files stay as they are.

import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Locator, Page, Route } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { importance, status } from "./support/screen.ts";
import { expect as siteExpect, signInByCode, test as siteTest } from "./support/sign-in.ts";

const WIDTHS = [1280, 375] as const;
const QUESTION = "Should our library open on Sundays?";
const LEAD = "Sunday is the only free day for many people who work weekdays.";
const LOADING = "Your steelmen are loading.";
const HOUR = 3_600_000;

const list = (page: Page): Locator => page.getByRole("list", { name: "Your steelmen" });
const posts = (page: Page): Locator => list(page).locator(":scope > li");
const questions = (page: Page): Locator => posts(page).getByRole("heading", { level: 2 });
const title = (page: Page): Locator => page.getByRole("heading", { level: 1 });
const back = (page: Page): Locator => page.getByRole("navigation", { name: "Back" }).getByRole("link");
const linkTo = (id: string) => `.sm-post h2 a[href="/b/${id}"]`;

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Waits until nothing on the page is animating, CSS and view transitions included, as hide-columns.spec.ts does. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.clock.runFor(40);
}

/** A timing token in ms (--sm-medium, --sm-slow), as the page reads it. */
function token(page: Page, name: "medium" | "slow" | "leave"): Promise<number> {
  return page.evaluate((name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(`--sm-${name}`).trim();
    const number = parseFloat(value);
    return value.endsWith("ms") || !value.endsWith("s") ? number : number * 1000;
  }, name);
}

/** Makes a board through the API as this person, and returns its ID. */
async function makeBoard(board: TestBoard, question: string): Promise<string> {
  const answer = (await board.api("jordan_w").post("../../boards", { question, options: ["Stay open", "Close at nine"], access: { general: "link", linkRole: "contributor" } })) as { board: string };
  return answer.board;
}

interface Noted {
  /** Whether this page arrived through a view transition. */
  transition: boolean;
  /** Once the transition's animations have started. */
  ready: boolean;
  finished: boolean;
  /** The header's view-transition-name on the page that left, as the transition took its picture: a picture of its own, so it stands still. */
  header: string | null;
  /** The view transition's own animations, on its pseudo-elements. */
  animations: { on: string; name: string; duration: number; delay: number; from: Record<string, string>; to: Record<string, string> }[];
  /** Every CSS entrance (sm-enter) an element of the page itself started while the page was shown. */
  entrances: string[];
}

/**
 * As an init script on every page: notes whether the page was revealed through a view transition and, at its `ready`,
 * which animations it plays, and every element of the page that starts the prototype's sm-enter itself.
 */
function watchPageChanges(): void {
  const noted: Noted = { transition: false, ready: false, finished: false, header: null, animations: [], entrances: [] };
  (window as unknown as { paged: Noted }).paged = noted;
  const values = (keyframe: Keyframe | undefined) => Object.fromEntries(Object.entries(keyframe ?? {}).flatMap(([key, value]) => (["opacity", "translate", "transform"].includes(key) ? [[key, String(value)]] : [])));
  // The leaving page notes its header's name as the transition starts; the arriving page draws its own header live,
  // after the transition's pictures are taken.
  // A document that may not use storage (a blank frame) has no page to note.
  const stored = (use: (storage: Storage) => string | null | void): string | null => {
    try {
      return use(window.sessionStorage) ?? null;
    } catch {
      return null;
    }
  };
  window.addEventListener("pageswap", (event) => {
    if (!(event as Event & { viewTransition: ViewTransition | null }).viewTransition) return;
    const header = document.querySelector("#steelman-study .sm-site");
    stored((storage) => storage.setItem("paged-header", header ? getComputedStyle(header).viewTransitionName : "none found"));
  });
  window.addEventListener("pagereveal", (event) => {
    const transition = (event as Event & { viewTransition: ViewTransition | null }).viewTransition;
    noted.transition = transition !== null;
    noted.header = stored((storage) => storage.getItem("paged-header"));
    stored((storage) => storage.removeItem("paged-header"));
    if (!transition) return;
    void transition.ready.then(() => {
      noted.animations = document
        .getAnimations()
        .filter((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement?.startsWith("::view-transition"))
        .map((animation) => {
          const effect = animation.effect as KeyframeEffect;
          const timing = effect.getTiming();
          const frames = effect.getKeyframes();
          return { on: effect.pseudoElement!, name: (animation as CSSAnimation).animationName, duration: Number(timing.duration), delay: Number(timing.delay), from: values(frames[0]), to: values(frames.at(-1)) };
        });
      noted.ready = true;
    }, () => (noted.ready = true));
    void transition.finished.then(() => (noted.finished = true));
  });
  document.addEventListener(
    "animationstart",
    (event) => {
      if (!event.pseudoElement && event.animationName === "sm-enter") noted.entrances.push(String((event.target as Element).className));
    },
    true,
  );
}

const paged = (page: Page): Promise<Noted> => page.evaluate(() => (window as unknown as { paged: Noted }).paged);

/** The page just changed through one view transition: the new page rises over the old one on --sm-medium and --sm-ease, and nothing else moves. */
async function expectOnePageTransition(page: Page): Promise<void> {
  await expect.poll(async () => (await paged(page)).ready, { message: "the page arrived through a view transition" }).toBe(true);
  const noted = await paged(page);
  expect(noted.transition).toBe(true);
  // The header is a picture of its own, so it isn't part of the page that rises.
  expect(noted.header, "the header is its own view-transition group").toBe("sm-site");
  expect(noted.animations.map((animation) => [animation.on, animation.name])).toEqual([["::view-transition-new(root)", "sm-enter"]]);
  const [rise] = noted.animations;
  expect(rise!.duration).toBe(await token(page, "medium"));
  expect(rise!.delay).toBe(0);
  expect(rise!.from.opacity).toBe("0");
  expect(rise!.from.translate).toMatch(/^0(px)? 4px$/);
  expect(rise!.to.opacity).toBe("1");
  await expect.poll(async () => (await paged(page)).finished).toBe(true);
  await settled(page);
  // One transition for the page: the page's own panels don't play their entrance on top of it.
  expect((await paged(page)).entrances).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.matches(":active-view-transition"))).toBe(false);
}

/** Where the page's main parts are drawn, in page pixels, by what they are. */
function places(page: Page): Promise<Record<string, { left: number; top: number; width: number; height: number }>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("header.sm-site, main, h1, .sm-post, .sm-create, .sm-rgroup, .sm-rrow, .sm-account-end, .sm-titlebar")].map((element, at) => {
        const { left, top, width, height } = element.getBoundingClientRect();
        return [`${at}:${element.tagName.toLowerCase()}.${element.classList[0] ?? ""}`, { left: left + window.scrollX, top: top + window.scrollY, width, height }];
      }),
    ),
  );
}

/** The page ends where a fresh load of the same address draws it, with nothing left in a style attribute. */
async function expectLayoutAsLoaded(board: TestBoard, page: Page, width: number): Promise<void> {
  const fresh = await board.open("jordan_w", { width, at: new URL(page.url()).pathname });
  await expect(title(fresh)).toBeVisible();
  await settled(fresh);
  const now = await places(page);
  const loaded = await places(fresh);
  expect(Object.keys(now)).toEqual(Object.keys(loaded));
  for (const [key, place] of Object.entries(now)) {
    for (const side of ["left", "top", "width", "height"] as const) expect(Math.abs(place[side] - loaded[key]![side]), `${key} ${side}`).toBeLessThanOrEqual(1);
  }
  expect(await page.locator("main [style], main[style], header.sm-site[style]").count()).toBe(0);
  await fresh.context().close();
}

/** Holds Home's read of the list (GET /api/boards, not a board and not New steelman's POST) until the test lets it go. */
function holdList(): { prepare(context: BrowserContext): Promise<unknown>; release(): Promise<void>; held: Promise<void> } {
  let route: Route | null = null;
  let arrived: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (arrived = resolve));
  return {
    prepare: (context) =>
      context.route(/\/api\/boards$/, async (request) => {
        if (request.request().method() !== "GET" || route) return request.fallback();
        route = request;
        arrived();
      }),
    held,
    async release() {
      await held;
      await route!.fallback();
    },
  };
}

/** Notes what the list skeleton's status region says at the moment it is put on the page, as an init script. */
function watchStatus(): void {
  new MutationObserver((changes, observer) => {
    for (const change of changes)
      for (const node of change.addedNodes) {
        const status = node instanceof HTMLElement ? (node.matches(".sm-feed-skeleton") ? node : node.querySelector(".sm-feed-skeleton"))?.querySelector("[role=status]") : null;
        if (!status) continue;
        (window as unknown as { firstStatus?: string }).firstStatus = status.textContent ?? "";
        observer.disconnect();
        return;
      }
  }).observe(document, { childList: true, subtree: true });
}

/** As an init script: notes every Web Animation started on a row of Your account, in the order they start. */
function recordRowEntrances(): void {
  const animate = Element.prototype.animate;
  const entered: { label: string; delay: number; duration: number; from: string; to: string; opacity: boolean }[] = [];
  (window as unknown as { entered: typeof entered }).entered = entered;
  Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
    const animation = animate.apply(this, args);
    if (this.matches(".sm-account .sm-rrow, .sm-account-end")) {
      const effect = animation.effect as KeyframeEffect;
      const frames = effect.getKeyframes();
      entered.push({
        label: this.matches(".sm-account-end") ? "end" : (this.querySelector(".sm-rrow-label")?.firstChild?.textContent ?? ""),
        delay: Number(effect.getTiming().delay),
        duration: Number(effect.getTiming().duration),
        from: String(frames[0]?.translate),
        to: String(frames.at(-1)?.translate),
        opacity: frames.some((frame) => "opacity" in frame),
      });
    }
    return animation;
  };
}

/** Counts every Web Animation each page in this browser session starts, from the moment it loads. */
const countFromLoad = (context: BrowserContext) =>
  context.addInitScript(() => {
    const animate = Element.prototype.animate;
    const counted = window as unknown as { animationsStarted: number };
    counted.animationsStarted = 0;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      counted.animationsStarted++;
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

interface Caught {
  on: string;
  keyframes: Record<string, string>[];
  duration: number;
}

/** Goes Back, and holds the Web Animations that start after it, paused, under `name`, as zoom-motion.spec.ts's actAndCatch does. */
function backAndCatch(page: Page, name: string): Promise<Caught[]> {
  return page.evaluate(async (name) => {
    const ours = () => document.getAnimations().filter((animation) => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition));
    const earlier = new Set(ours());
    window.history.back();
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
    return held.map((animation) => {
      const effect = animation.effect as KeyframeEffect;
      return {
        on: effect.target!.closest(".sm-closing-layer") ? "copy" : String(effect.target!.className),
        keyframes: effect.getKeyframes().map((keyframe) => Object.fromEntries(Object.entries(keyframe).flatMap(([key, value]) => (["offset", "easing", "composite", "computedOffset"].includes(key) ? [] : [[key, String(value)]])))),
        duration: Number(effect.getComputedTiming().duration),
      };
    });
  }, name);
}

/** Lets the held animations run to their end, and waits until no animation is left on the page. */
async function finish(page: Page, name: string): Promise<void> {
  await page.evaluate((name) => {
    for (const animation of (window as unknown as Record<string, Animation[]>)[name]!) if (animation.playState !== "idle") animation.finish();
  }, name);
  await settled(page);
}

/** Votes on the Sunday argument and waits until the service has it and nothing is waiting to send. */
async function vote(page: Page): Promise<void> {
  const answered = page.waitForResponse((response) => response.url().includes("/importance") && response.request().method() === "PUT");
  await importance(page, LEAD).getByRole("button", { name: "More important if true" }).click();
  await answered;
  await page.waitForResponse((response) => response.url().includes("/changes?"));
  await settled(page);
}

/** Holds the next request to the API path given, with this method, until the test answers it. */
function holdNext(page: Page, path: RegExp, method: string): Promise<Route> {
  return new Promise((resolve) => {
    void page.route(path, (route) => {
      if (route.request().method() !== method) return route.fallback();
      resolve(route);
    });
  });
}

/** The busy state's pulse on a button: when it starts and how long each beat takes; null when it doesn't pulse. */
function busyPulse(button: Locator): Promise<{ delay: number; duration: number; iterations: number; direction: string } | null> {
  return button.evaluate((element) => {
    const animation = element.getAnimations().find((each) => (each as CSSAnimation).animationName === "sm-busy");
    if (!animation) return null;
    const { delay, duration, iterations, direction } = animation.effect!.getTiming();
    return { delay: Number(delay), duration: Number(duration), iterations: Number(iterations), direction: String(direction) };
  });
}

const translateOf = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).translate);
const scaleOf = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).scale);

for (const width of WIDTHS) {
  // -------------------------------------------------------------------------------------------------------------
  // 1. The page transition (M-15, M-13).

  test(`E-03 L-04 M-13 M-15: at ${width} px, moving between Home, New steelman, and Your account plays one page transition, the new page rising over the old, and each ends at today's layout`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, at: "/", prepare: (context) => context.addInitScript(watchPageChanges) });
    await expect(list(page)).toBeVisible();
    // A page opened by its address plays nothing.
    expect((await paged(page)).transition).toBe(false);

    await page.getByRole("link", { name: "New steelman" }).click();
    await expect(title(page)).toHaveText("New steelman");
    await expectOnePageTransition(page);
    await expectLayoutAsLoaded(board, page, width);

    await page.getByRole("link", { name: "Your account" }).click();
    await expect(title(page)).toHaveText("Your account");
    await expectOnePageTransition(page);
    await expectLayoutAsLoaded(board, page, width);

    // The way back (M-13) changes the page the same way.
    await expect(back(page)).toHaveAccessibleName("Back to Your steelmen");
    await back(page).click();
    await expect(list(page)).toBeVisible();
    await expectOnePageTransition(page);
    await expectLayoutAsLoaded(board, page, width);
  });

  test(`M-13 M-15: at ${width} px, Your account and the privacy page change with the same transition, and Back plays it too`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, at: "/account", prepare: (context) => context.addInitScript(watchPageChanges) });
    await expect(title(page)).toHaveText("Your account");
    await page.getByRole("region", { name: "Your account" }).getByRole("link", { name: "Read" }).click();
    await expect(title(page)).toHaveText("Privacy");
    await expectOnePageTransition(page);

    await page.goBack();
    await expect(title(page)).toHaveText("Your account");
    await expectOnePageTransition(page);
  });

  test(`E-07 M-15: at ${width} px, leaving a board or opening one by a page load plays no page transition`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, prepare: (context) => context.addInitScript(watchPageChanges) });
    await page.getByRole("link", { name: "New steelman" }).last().click();
    await expect(title(page)).toHaveText("New steelman");
    await settled(page);
    expect((await paged(page)).transition).toBe(false);
    // Arriving without the transition, the sheet still plays its own entrance.
    expect((await paged(page)).entrances.some((name) => name.includes("sm-create"))).toBe(true);

    await page.getByRole("textbox", { name: "Question" }).fill("Should our school start an hour later?");
    await page.getByRole("textbox", { name: "Option 1" }).fill("Start later");
    await page.getByRole("textbox", { name: "Option 2" }).fill("Keep the time");
    await page.getByRole("button", { name: "Create steelman" }).click();
    await expect(title(page)).toHaveText("Should our school start an hour later?");
    await settled(page);
    expect((await paged(page)).transition).toBe(false);
  });

  test(`E-07 M-13 M-15: at ${width} px, Back from a board opened from the list, when its post is off screen, plays the ordinary page transition: the board's copy fades and the list rises`, async ({ board }) => {
    board.clock.advance(60_000);
    for (let n = 1; n <= 12; n++) await makeBoard(board, `Should the library add a branch number ${n}?`);
    const page = await board.open("jordan_w", { width, at: "/" });
    await expect(posts(page)).toHaveCount(13);
    await settled(page);
    await page.locator(linkTo(board.demo.board)).click();
    await expect(title(page)).toHaveText(QUESTION);
    await settled(page);
    board.clock.advance(HOUR);
    await vote(page);

    await countShrinks(page);
    // The copy's fade is CSS, so it's noted the moment the copy is marked to fade.
    await page.evaluate(() => {
      new MutationObserver((changes, observer) => {
        for (const change of changes) {
          const layer = change.target as HTMLElement;
          if (!layer.matches?.(".sm-closing-layer.sm-closing-fade")) continue;
          const animation = layer.getAnimations().find((each) => each instanceof CSSAnimation) as CSSAnimation | undefined;
          (window as unknown as { faded: unknown }).faded = { name: animation?.animationName, duration: Number(animation?.effect?.getTiming().duration) };
          observer.disconnect();
        }
      }).observe(document.getElementById("steelman-study")!, { subtree: true, attributes: true, attributeFilter: ["class"] });
    });
    const rise = await backAndCatch(page, "rise");
    await expect(page).toHaveURL(/\/$/);
    expect(rise.map((caught) => caught.on)).toEqual(["sm-home sm-home-alone"]);
    expect(rise[0]!.duration).toBe(await token(page, "medium"));
    expect(rise[0]!.keyframes[0]!.translate).toMatch(/^0(px)? 4px$/);
    expect(rise[0]!.keyframes.at(-1)!.translate).toMatch(/^0(px)?( 0(px)?)?$/);
    expect(await page.evaluate(() => (window as unknown as { faded: unknown }).faded)).toEqual({ name: "sm-page-out", duration: await token(page, "medium") });
    await finish(page, "rise");

    // Nothing shrank, the copy is gone, and the list ends where it is drawn without motion, still scrolled as it was.
    expect(await page.evaluate(() => (window as unknown as { shrinksStarted: number }).shrinksStarted)).toBe(0);
    await expect(page.locator(".sm-closing-layer")).toHaveCount(0);
    await expect(questions(page).first()).toHaveText(QUESTION);
    await expect(posts(page).first()).not.toBeInViewport();
    expect(await page.locator(".sm-home").getAttribute("style")).toBeNull();
  });

  // -------------------------------------------------------------------------------------------------------------
  // 2. Home's skeleton posts and the list's hover lift (E-03).

  test(`E-03 M-15: at ${width} px, while the list loads, Home shows skeleton posts in the list's own layout with one status sentence, and then the posts`, async ({ board }) => {
    const hold = holdList();
    const page = await board.open("jordan_w", { width, at: "/", prepare: (context) => Promise.all([hold.prepare(context), context.addInitScript(watchStatus)]) });
    await hold.held;
    const skeleton = page.locator(".sm-feed-skeleton");
    await expect(skeleton).toBeVisible();

    // Twice --sm-slow before it fades in on --sm-medium, as the board's skeleton waits (M3d-10).
    const timing = await skeleton.locator(".sm-feed-skeleton-posts").evaluate((element) => {
      const animation = element.getAnimations().find((each) => (each as CSSAnimation).animationName === "sm-skeleton-in");
      const { delay, duration } = animation?.effect?.getTiming() ?? {};
      return { delay, duration };
    });
    expect(timing).toEqual({ delay: 840, duration: 200 });
    await expect(page.getByRole("status").filter({ hasText: LOADING })).toHaveCount(1);
    await expect(page.getByRole("status").filter({ hasText: LOADING })).toHaveText(LOADING);
    expect(await page.evaluate(() => (window as unknown as { firstStatus?: string }).firstStatus)).toBe("");
    await expect(skeleton.locator(".sm-feed-skeleton-posts")).toHaveAttribute("aria-busy", "true");
    await expect(skeleton.locator(".sm-feed-skeleton-posts")).toHaveAttribute("aria-hidden", "true");
    expect(await page.locator("[aria-busy]").count()).toBe(1);
    await expect(page.getByRole("heading")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    // Nothing in it is the list, a post, or a question the list's code looks for.
    await expect(list(page)).toHaveCount(0);
    expect(await page.locator(".sm-post, .sm-feed-list, .sm-thumb, h2, #sm-feed-title").count()).toBe(0);
    const skeletonPosts = skeleton.locator(".sm-feed-skeleton-post");
    await expect(skeletonPosts).toHaveCount(3);
    await expect(skeleton.locator(".sm-feed-skeleton-thumb").filter({ visible: true })).toHaveCount(width === 1280 ? 3 : 0);
    const placeholder = await skeletonPosts.first().boundingBox();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expectNoAxeViolations(page);

    await hold.release();
    await expect(questions(page)).toHaveText([QUESTION]);
    await expect(skeleton).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: LOADING })).toHaveCount(0);
    // The post stands where its placeholder stood.
    const post = (await posts(page).first().boundingBox())!;
    expect(Math.abs(post.x - placeholder!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(post.y - placeholder!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(post.width - placeholder!.width)).toBeLessThanOrEqual(1);
  });

  test(`E-03 M-15: at ${width} px, a list post lifts 3 px under the pointer and settles as it's pressed, and its place in the list doesn't change`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, at: "/" });
    await expect(list(page)).toBeVisible();
    await settled(page);
    const post = posts(page).first();
    const resting = await post.evaluate((element) => ({ translate: getComputedStyle(element).translate, shadow: getComputedStyle(element).boxShadow, top: (element as HTMLElement).offsetTop }));
    expect(resting.translate).toBe("none");

    await post.hover({ position: { x: 12, y: 12 } });
    await settled(page);
    expect(await translateOf(post)).toBe("0px -3px");
    const lifted = await post.evaluate((element) => ({ shadow: getComputedStyle(element).boxShadow, top: (element as HTMLElement).offsetTop }));
    expect(lifted.shadow).not.toBe(resting.shadow);
    expect(lifted.top).toBe(resting.top);

    await page.mouse.down();
    await settled(page);
    expect(await translateOf(post)).toMatch(/^(none|0px)$/);
    expect(await post.evaluate((element) => (element as HTMLElement).offsetTop)).toBe(resting.top);
    // Let go, and the board opens, as a click does.
    await page.mouse.up();
    await expect(title(page)).toHaveText(QUESTION);
  });

  // -------------------------------------------------------------------------------------------------------------
  // 3. One press and one busy state for buttons (M-15).

  test(`M-15: at ${width} px, buttons share one press: a pressed button scales down a little and comes back as it's let go`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, at: "/" });
    await expect(list(page)).toBeVisible();
    await settled(page);
    // A button is let go away from itself, so it does nothing; a link is let go on itself, and opens its page.
    const pressAndLetGo = async (button: Locator, away = true) => {
      expect(await scaleOf(button)).toBe("none");
      const layout = () => button.evaluate((element) => ({ left: (element as HTMLElement).offsetLeft, top: (element as HTMLElement).offsetTop, width: (element as HTMLElement).offsetWidth }));
      const before = await layout();
      await button.hover();
      await page.mouse.down();
      await settled(page);
      expect(await scaleOf(button)).toBe("0.97");
      // Its place in the layout stays where it was.
      expect(await layout()).toEqual(before);
      if (!away) return page.mouse.up();
      await page.mouse.move(2, 2);
      await page.mouse.up();
      await settled(page);
      expect(await scaleOf(button)).toBe("none");
    };
    await pressAndLetGo(page.getByRole("link", { name: "New steelman" }), false);
    await expect(title(page)).toHaveText("New steelman");

    await page.goto("/account");
    await expect(title(page)).toHaveText("Your account");
    await settled(page);
    await pressAndLetGo(page.getByRole("button", { name: "Download" }));
    await pressAndLetGo(page.getByRole("button", { name: "Sign out" }));

    await page.goto("/new");
    await expect(title(page)).toHaveText("New steelman");
    await settled(page);
    await pressAndLetGo(page.getByRole("button", { name: "Create steelman" }));
    await expect(page).toHaveURL(/\/new$/);
    // New steelman's + Option, and the remove-option button it brings, press the same way.
    const addOption = page.getByRole("button", { name: "Option", exact: true });
    await pressAndLetGo(addOption);
    await expect(page.getByRole("textbox", { name: "Option 3" })).toHaveCount(0);
    await addOption.click();
    await settled(page);
    await pressAndLetGo(page.getByRole("button", { name: "Remove option 3" }));
    await expect(page.getByRole("textbox", { name: "Option 3" })).toHaveCount(1);
  });

  test(`M-15: at ${width} px, Create steelman shows the shared busy state while the board is made, still at first and then a slow pulse, and it ends with the answer`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, at: "/new" });
    await expect(title(page)).toHaveText("New steelman");
    await page.getByRole("textbox", { name: "Question" }).fill("Should our school start an hour later?");
    await page.getByRole("textbox", { name: "Option 1" }).fill("Start later");
    await page.getByRole("textbox", { name: "Option 2" }).fill("Keep the time");
    const create = page.getByRole("button", { name: "Create steelman" });
    const held = holdNext(page, /\/api\/boards$/, "POST");

    await create.click();
    const route = await held;
    await expect(create).toBeDisabled();
    await expect(create).toHaveAttribute("data-busy", "");
    // It keeps its colour rather than the disabled look; the pulse's delay keeps it from changing yet.
    expect(await create.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    // An answer within twice --sm-slow shows nothing but the waiting cursor, as Primer shows no indicator for a wait
    // under about a second; then the button pulses gently until the answer.
    expect(await busyPulse(create)).toEqual({ delay: 2 * (await token(page, "slow")), duration: 2 * (await token(page, "slow")), iterations: Infinity, direction: "alternate" });
    expect(await create.evaluate((element) => getComputedStyle(element).cursor)).toBe("progress");

    await route.abort("internetdisconnected");
    // The line itself is new-steelman.spec.ts's to hold.
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("alert")).not.toHaveText("");
    await expect(create).toBeEnabled();
    await expect(create).not.toHaveAttribute("data-busy");
    expect(await busyPulse(create)).toBeNull();
  });

  test(`L-04 M-15: at ${width} px, Download, Sign out, and Delete account show the same busy state, end it on a failure, and say so in a full sentence`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, at: "/account" });
    await expect(title(page)).toHaveText("Your account");
    await settled(page);

    const download = page.getByRole("button", { name: "Download" });
    const reading = holdNext(page, /\/api\/account\/data$/, "GET");
    await download.click();
    await (async () => {
      const route = await reading;
      await expect(download).toHaveAttribute("data-busy", "");
      await expect(download).toBeDisabled();
      expect(await busyPulse(download)).not.toBeNull();
      await route.abort("internetdisconnected");
    })();
    await expect(page.locator("#sm-status")).toHaveText("Steelman couldn’t download your data. Try again.");
    await expect(download).not.toHaveAttribute("data-busy");
    await expect(download).toBeEnabled();

    const signOut = page.getByRole("button", { name: "Sign out" });
    const leaving = holdNext(page, /\/api\/auth\/sign-out$/, "POST");
    await signOut.click();
    await (async () => {
      const route = await leaving;
      await expect(signOut).toHaveAttribute("data-busy", "");
      await expect(signOut).toBeDisabled();
      expect(await busyPulse(signOut)).not.toBeNull();
      await route.abort("internetdisconnected");
    })();
    await expect(page.locator("#sm-status")).toHaveText("Steelman couldn’t sign you out. Try again.");
    await expect(signOut).not.toHaveAttribute("data-busy");
    // The cursor goes back to Sign out once it can be pressed again.
    await expect(signOut).toBeFocused();

    await page.getByRole("button", { name: "Delete account" }).click();
    const form = page.getByRole("group", { name: "Delete your account?" });
    await form.getByRole("textbox").fill("jordan_w");
    const remove = form.getByRole("button", { name: "Delete account" });
    const deleting = holdNext(page, /\/api\/account\/delete$/, "POST");
    await remove.click();
    const route = await deleting;
    await expect(remove).toHaveAttribute("data-busy", "");
    await expect(remove).toBeDisabled();
    await route.abort("internetdisconnected");
    await expect(form.locator(".sm-field-error")).toHaveText("Steelman couldn’t delete your account, so nothing was deleted. Try again.");
    await expect(remove).toBeEnabled();
    await expect(remove).not.toHaveAttribute("data-busy");
  });

  // -------------------------------------------------------------------------------------------------------------
  // 4. Your account's rows enter on the tokens (L-04).

  test(`L-04 M-15: at ${width} px, the rows on Your account rise into place on --sm-medium, one after another in reading order, and end at today's layout`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, at: "/", prepare: (context) => context.addInitScript(recordRowEntrances) });
    await page.goto("/account");
    await expect(title(page)).toHaveText("Your account");
    await expect(page.locator(".sm-rrow", { hasText: "Tour" })).toBeVisible();
    await settled(page);

    const entered = await page.evaluate(() => (window as unknown as { entered: { label: string; delay: number; duration: number; from: string; to: string; opacity: boolean }[] }).entered);
    // Every row, and the foot with Sign out and Delete account, once each.
    expect(entered.map((row) => row.label).sort()).toEqual(["Privacy notice", "Tour", "Username", "Your data", "end"].sort());
    const medium = await token(page, "medium");
    for (const row of entered) {
      expect(row.duration, row.label).toBe(medium);
      expect(row.from, row.label).toMatch(/^0(px)? 4px$/);
      expect(row.to, row.label).toMatch(/^0(px)?( 0(px)?)?$/);
      // A rise without a fade, so the rows' words are never drawn half there.
      expect(row.opacity, row.label).toBe(false);
    }
    // Rows that arrive together start 20 ms apart, top to bottom; a row that arrives later (the tour's, once the list
    // is read) starts a turn of its own at 0.
    const order = ["Username", "Tour", "Your data", "Privacy notice", "end"];
    const batches: (typeof entered)[] = [];
    for (const row of entered) {
      if (row.delay === 0) batches.push([]);
      batches.at(-1)!.push(row);
    }
    // The rows drawn with the page arrive together, so at least Username, Your data, Privacy notice, and the foot share
    // one staggered turn; without the stagger, every row would be a turn of its own.
    expect(Math.max(...batches.map((batch) => batch.length)), "rows drawn together share one staggered turn").toBeGreaterThanOrEqual(4);
    for (const batch of batches) {
      expect(batch.map((row) => row.delay)).toEqual(batch.map((_, turn) => turn * 20));
      expect(batch.map((row) => row.label)).toEqual([...batch].sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)).map((row) => row.label));
    }
    expect(await page.locator(".sm-account [style]").count()).toBe(0);

    const still = await board.open("jordan_w", { width, at: "/" });
    await still.emulateMedia({ reducedMotion: "reduce" });
    await still.goto("/account");
    await expect(still.locator(".sm-rrow", { hasText: "Tour" })).toBeVisible();
    await settled(still);
    expect(await places(page)).toEqual(await places(still));
  });

  // -------------------------------------------------------------------------------------------------------------
  // Reduced motion, and the accessibility scan.

  test(`M-15: at ${width} px, under reduced motion nothing on these pages animates: no page transition, no skeleton, no row, no press, and no busy pulse`, async ({ board }) => {
    const hold = holdList();
    const page = await board.open("jordan_w", { width, at: "/new", prepare: (context) => Promise.all([hold.prepare(context), context.addInitScript(watchPageChanges), countFromLoad(context)]) });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await hold.held;
    await expect(page.locator(".sm-feed-skeleton")).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await hold.release();
    await expect(list(page)).toBeVisible();
    await posts(page).first().hover();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

    await page.getByRole("link", { name: "New steelman" }).click();
    await expect(title(page)).toHaveText("New steelman");
    expect((await paged(page)).transition).toBe(false);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

    await page.getByRole("link", { name: "Your account" }).click();
    await expect(title(page)).toHaveText("Your account");
    await expect(page.locator(".sm-rrow", { hasText: "Tour" })).toBeVisible();
    expect((await paged(page)).transition).toBe(false);
    await page.getByRole("button", { name: "Download" }).hover();
    await page.mouse.down();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await page.mouse.move(2, 2);
    await page.mouse.up();

    const leaving = holdNext(page, /\/api\/auth\/sign-out$/, "POST");
    await page.getByRole("button", { name: "Sign out" }).click();
    const route = await leaving;
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveAttribute("data-busy", "");
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await route.abort("internetdisconnected");
    await expect(page.locator("#sm-status")).toHaveText("Steelman couldn’t sign you out. Try again.");
    expect(await started(page)).toBe(0);
  });

  test(`E-03 L-04 M-13 M-04: at ${width} px, Home, New steelman, Your account with Delete account open, and the privacy page pass an accessibility scan once the motion settles`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, at: "/" });
    await expect(list(page)).toBeVisible();
    await settled(page);
    await expectNoAxeViolations(page);

    await page.getByRole("link", { name: "New steelman" }).click();
    await expect(title(page)).toHaveText("New steelman");
    await settled(page);
    await expectNoAxeViolations(page);

    await page.getByRole("link", { name: "Your account" }).click();
    await expect(title(page)).toHaveText("Your account");
    await settled(page);
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Delete account" }).click();
    await settled(page);
    await expectNoAxeViolations(page);

    await page.getByRole("region", { name: "Your account" }).getByRole("link", { name: "Read" }).click();
    await expect(title(page)).toHaveText("Privacy");
    await settled(page);
    await expectNoAxeViolations(page);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// The rule-13 pass: the lines on these pages that were fragments now say who does what.

test("L-04: when Download your data fails, Your account says so in a full sentence", async ({ board }) => {
  const page = await board.open("jordan_w", { at: "/account" });
  await expect(title(page)).toHaveText("Your account");
  await page.route(/\/api\/account\/data$/, (route) => route.abort("internetdisconnected"));
  await page.getByRole("button", { name: "Download" }).click();
  await expect(status(page)).toHaveText("Steelman couldn’t download your data. Try again.");
});

siteTest("L-04 M-15: changing your email says a failure and too many wrong codes in full sentences, its row rises with the others, and Send a new code shows the busy state", async ({ site }) => {
  const page = await site.browse();
  await signInByCode(site, page, "ana.lu@school.example.edu", "ana_lu");
  await page.context().addInitScript(recordRowEntrances);
  await page.goto("/account");
  const card = page.getByRole("region", { name: "Your account" });

  // The Email row rises as the other rows do: on --sm-medium, from 4 px, with no fade.
  await siteExpect.poll(() => page.evaluate(() => (window as unknown as { entered: { label: string }[] }).entered.map((row) => row.label))).toContain("Email");
  const emailRow = (await page.evaluate(() => (window as unknown as { entered: { label: string; duration: number; from: string; opacity: boolean }[] }).entered)).find((row) => row.label === "Email")!;
  siteExpect(emailRow.duration).toBe(await token(page, "medium"));
  siteExpect(emailRow.from).toMatch(/^0(px)? 4px$/);
  siteExpect(emailRow.opacity).toBe(false);

  await card.locator(".sm-rrow", { hasText: "Email" }).first().getByRole("button", { name: "Change" }).click();
  await card.getByLabel("New email").fill("ana.lu@home.example.org");
  const error = card.locator(".sm-field-error");

  // The service answers with an error: the line says what didn't happen, without blaming the connection.
  await page.route(/\/api\/auth\/email-otp\/request-email-change$/, (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await card.getByRole("button", { name: "Send code" }).click();
  await siteExpect(error).toHaveText("Steelman couldn’t send the code. Try again.");
  await page.unroute(/\/api\/auth\/email-otp\/request-email-change$/);

  await card.getByRole("button", { name: "Send code" }).click();
  const confirm = card.getByRole("group", { name: "Confirm your new email" });
  await siteExpect(confirm).toBeVisible();
  const wrong = site.codeFor("ana.lu@home.example.org") === "000000" ? "111111" : "000000";
  await page.route(/\/api\/auth\/email-otp\/change-email$/, (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await confirm.getByLabel("Code").fill(wrong);
  await confirm.getByRole("button", { name: "Change email" }).click();
  await siteExpect(error).toHaveText("Steelman couldn’t change your email. Try again.");
  await page.unroute(/\/api\/auth\/email-otp\/change-email$/);
  for (let tries = 0; tries < 5; tries++) {
    await confirm.getByLabel("Code").fill(wrong);
    await confirm.getByRole("button", { name: "Change email" }).click();
    await siteExpect(error).not.toHaveText("");
  }
  await siteExpect(error).toHaveText("You entered a wrong code too many times. Send a new code.");

  // While a new code is on its way, Send a new code shows the busy state; Change email waits too, but isn't the one working.
  const resend = confirm.getByRole("button", { name: "Send a new code" });
  const sending = holdNext(page, /\/api\/auth\/email-otp\/request-email-change$/, "POST");
  await resend.click();
  const route = await sending;
  await siteExpect(resend).toHaveAttribute("data-busy", "");
  await siteExpect(resend).toBeDisabled();
  await siteExpect(confirm.getByRole("button", { name: "Change email" })).toBeDisabled();
  await siteExpect(confirm.getByRole("button", { name: "Change email" })).not.toHaveAttribute("data-busy");
  await route.fallback();
  await siteExpect(resend).not.toHaveAttribute("data-busy");
  await siteExpect(resend).toBeEnabled();
});
