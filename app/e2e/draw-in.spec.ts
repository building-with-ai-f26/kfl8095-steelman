// plans/build-plan.md, M3d-23, "A board draws itself when it opens" (M-15,
// A-01, E-07), at 1280 and 375 px. When a board opens by link, on a reload, or
// from the list once its zoom ends, the question rises in first, the wires
// draw down from it, the option headers rise in and their columns fade in,
// and the cards rise in by row and then by column. Every part of it is a Web
// Animation that play() starts with the ID "sm-draw-in", all in one go, with
// delays, so a test can tell it from the board's other motion, and every one
// ends within a second. Update, Strongest case and back, a poll, the
// reader's own changes, and Forward start none of it. A link to a
// version or to a comment starts none of it, so the ring shows at once. Under
// reduced motion nothing starts. A press during the drawing counts, and the
// drawing ends at once, as it does for a key or a tour. A press during the
// list's zoom means the drawing never starts.
//
// Web Animations run on the page's own timeline, which Playwright's clock
// doesn't move. The helpers here record each animate() call from the moment
// the page loads, as zoom-motion.spec.ts's countFromLoad() counts them. They
// are written here, not imported, so the other spec files stay as they are.
// A test that has to act during the drawing holds it from the moment it's
// created (hold()), so the drawing is still there however late the page
// answers.

import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { find, importance, pill, poll } from "./support/screen.ts";

const WIDTHS = [1280, 375] as const;
const QUESTION = "Should our library open on Sundays?";
const LEAD = "Sunday is the only free day for many people who work weekdays.";
const FAMILY = "Families could visit together on the one day nobody has school or work.";
const DRAW_IN = "sm-draw-in";

interface Started {
  /** The animation's ID: "sm-draw-in" for the opening's drawing. */
  id: string;
  /** What it plays on: question, wires, header, column, card, surface, or the element's class. */
  on: string;
  /** The page timeline's time when it was started, in ms. */
  at: number;
  delay: number;
  duration: number;
  /** Its first keyframe, without the timing keys. */
  from: Record<string, string>;
}

/** Records every Web Animation each page in this browser session starts, from the moment it loads. */
const record = (context: BrowserContext) =>
  context.addInitScript(() => {
    const animate = Element.prototype.animate;
    const seen = window as unknown as { started: unknown[]; drawing: Animation[]; grows: Animation[]; holdDrawIn?: boolean; holdGrow?: boolean };
    seen.started = [];
    seen.drawing = [];
    seen.grows = [];
    const on = (element: Element): string => {
      if (element.matches(".sm-head")) return "question";
      if (element.matches("svg.sm-links")) return "wires";
      if (element.matches(".sm-column-head, .sm-col-hidden, .sm-add-option-col")) return "header";
      if (element.matches(".sm-column")) return "column";
      if (element.matches(".sm-card[data-card]")) return "card";
      if (element.matches(".sm-surface")) return "surface";
      return String(element.getAttribute("class"));
    };
    Element.prototype.animate = function (this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
      const animation = animate.call(this, keyframes, options);
      const timing = typeof options === "object" ? options : { duration: options };
      const first = Array.isArray(keyframes) ? (keyframes[0] ?? {}) : {};
      seen.started.push({
        id: animation.id,
        on: on(this),
        at: Number(document.timeline.currentTime),
        delay: Number(timing.delay ?? 0),
        duration: Number(timing.duration ?? 0),
        from: Object.fromEntries(Object.entries(first).flatMap(([key, value]) => (["offset", "easing", "composite"].includes(key) ? [] : [[key, String(value)]]))),
      });
      if (animation.id === "sm-draw-in") {
        seen.drawing.push(animation);
        if (seen.holdDrawIn) animation.pause();
      }
      if (this.matches(".sm-surface")) {
        seen.grows.push(animation);
        // Held just short of its end, so the board can be pressed at its own size while the zoom still plays.
        if (seen.holdGrow) {
          animation.pause();
          animation.currentTime = Number(timing.duration ?? 0) - 1;
        }
      }
      return animation;
    };
  });

/** Every animation the page has started since it loaded, or since forget(). */
const started = (page: Page): Promise<Started[]> => page.evaluate(() => (window as unknown as { started: Started[] }).started);
/** The ones that draw the board in. */
const drawing = async (page: Page): Promise<Started[]> => (await started(page)).filter((animation) => animation.id === DRAW_IN);
/** Forgets what the page has started so far. */
const forget = (page: Page) => page.evaluate(() => ((window as unknown as { started: unknown[] }).started = []));
/** How many of the drawing's animations are still running. */
const stillDrawing = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { drawing: Animation[] }).drawing.filter((animation) => animation.playState === "running" || animation.playState === "paused").length);

/** Records as record() does, and holds the drawing from the moment it's created, so a test can act during it however long it takes. */
const hold = async (context: BrowserContext) => {
  await record(context);
  await context.addInitScript(() => ((window as unknown as { holdDrawIn: boolean }).holdDrawIn = true));
};
/** Records as record() does, and holds the list's zoom just short of its end. */
const holdZoom = async (context: BrowserContext) => {
  await record(context);
  await context.addInitScript(() => ((window as unknown as { holdGrow: boolean }).holdGrow = true));
};

/** Waits until nothing on the page is animating, CSS included, as zoom-motion.spec.ts does. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.clock.runFor(40);
}

/** --sm-slow, in ms, as the page reads it. */
function slow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--sm-slow").trim();
    const number = parseFloat(value);
    return value.endsWith("ms") || !value.endsWith("s") ? number : number * 1000;
  });
}

/** The cards on screen: those with a size. */
function cardsShown(page: Page): Promise<number> {
  return page.evaluate(() => [...document.querySelectorAll(".sm-card[data-card]")].filter((card) => card.getBoundingClientRect().width > 0).length);
}

interface Place {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The question, every column, header, row and card on screen, on the page itself (independent of scrolling). */
function places(page: Page): Promise<Record<string, Place>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>(".sm-head, .sm-board > .sm-column, .sm-column-head, [data-node], .sm-card[data-card]")].flatMap((element, n) => {
        const { left, top, width, height } = element.getBoundingClientRect();
        if (!width && !height) return [];
        const key = element.dataset.node !== undefined ? `node:${element.dataset.node}` : element.dataset.card !== undefined ? `card:${element.dataset.card}` : `${element.className.split(" ")[0]}:${n}`;
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

/** The board as it's drawn without motion, in a browser of its own. */
async function still(board: TestBoard, width: number): Promise<Page> {
  const page = await board.open("jordan_w", { width, at: "/privacy" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/b/${board.demo.board}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  await settled(page);
  return page;
}

/** Checks one opening's drawing: its order, its timing, and that it ends within a second. */
async function expectDrawn(page: Page): Promise<void> {
  const drawn = await drawing(page);
  const kinds = drawn.map((animation) => animation.on);
  expect(kinds[0]).toBe("question");
  expect(kinds).toContain("wires");
  expect(kinds).toContain("header");
  expect(kinds).toContain("column");
  // Every card on screen rises in, and nothing else does.
  expect(kinds.filter((kind) => kind === "card")).toHaveLength(await cardsShown(page));
  expect(kinds.every((kind) => ["question", "wires", "header", "column", "card"].includes(kind))).toBe(true);
  // All of it starts in one go, each part with its own delay, on --sm-slow.
  expect(new Set(drawn.map((animation) => animation.at)).size).toBe(1);
  const duration = await slow(page);
  for (const animation of drawn) expect(animation.duration).toBe(duration);
  const first = (kind: string) => Math.min(...drawn.filter((animation) => animation.on === kind).map((animation) => animation.delay));
  const last = (kind: string) => Math.max(...drawn.filter((animation) => animation.on === kind).map((animation) => animation.delay));
  expect(first("question")).toBe(0);
  expect(first("wires")).toBeGreaterThan(first("question"));
  expect(first("header")).toBeGreaterThan(first("wires"));
  expect(first("card")).toBeGreaterThan(last("header"));
  expect(last("card")).toBeLessThanOrEqual(600);
  // Every animation ends within a second of the opening.
  for (const animation of drawn) expect(animation.delay + animation.duration).toBeLessThanOrEqual(1000);
  // The cards and the question rise 8 px as they fade in; the wires fade in.
  const card = drawn.find((animation) => animation.on === "card")!;
  expect(card.from.transform).toBe("translateY(8px)");
  expect(card.from.opacity).toBe("0");
  expect(drawn.find((animation) => animation.on === "column")!.from).toEqual({ opacity: "0" });
  // Like every part, the wires move only their transform and opacity.
  expect(drawn.find((animation) => animation.on === "wires")!.from).toEqual({ opacity: "0" });
  for (const animation of drawn) expect(Object.keys(animation.from).every((key) => key === "transform" || key === "opacity")).toBe(true);
}

for (const width of WIDTHS) {
  test(`M-15 A-01: at ${width} px, a board opened by its link draws itself in order, every animation ends within a second, and it ends at its own layout`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, prepare: record });
    await expectDrawn(page);
    await settled(page);
    expect(near(await places(page), await places(await still(board, width)), 1)).toEqual([]);
    for (const selector of [".sm-surface", ".sm-scene", ".sm-head", "svg.sm-links"]) expect(await page.locator(selector).getAttribute("style")).toBeNull();
  });

  test(`M-15 A-01: at ${width} px, a reload draws the board again`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, prepare: record });
    await settled(page);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    await expectDrawn(page);
    await settled(page);
  });

  test(`M-15 A-01 E-07: at ${width} px, a board opened from the list draws itself once its zoom ends`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, prepare: record });
    await page.goto("/");
    await expect(page.getByRole("list", { name: "Your steelmen" })).toBeVisible();
    await settled(page);
    await forget(page);
    await page.locator(`.sm-post h2 a[href="/b/${board.demo.board}"]`).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    await page.waitForFunction(() => (window as unknown as { started: { id: string }[] }).started.some((animation) => animation.id === "sm-draw-in"));
    const all = await started(page);
    const grow = all.find((animation) => animation.on === "surface")!;
    expect(grow).toBeDefined();
    // The drawing starts only once the zoom has ended.
    for (const animation of await drawing(page)) expect(animation.at).toBeGreaterThanOrEqual(grow.at + grow.duration - 1);
    await expectDrawn(page);
    await settled(page);
    expect(near(await places(page), await places(await still(board, width)), 1)).toEqual([]);
  });

  test(`M-15 E-07: at ${width} px, a board brought back by Forward doesn't draw itself again, and opening it from the list again draws it`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, prepare: record });
    await page.goto("/");
    await expect(page.getByRole("list", { name: "Your steelmen" })).toBeVisible();
    await page.locator(`.sm-post h2 a[href="/b/${board.demo.board}"]`).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    await page.waitForFunction(() => (window as unknown as { started: { id: string }[] }).started.some((animation) => animation.id === "sm-draw-in"));
    await settled(page);
    await page.goBack();
    await expect(page.getByRole("list", { name: "Your steelmen" })).toBeVisible();
    await settled(page);
    await forget(page);
    await page.goForward();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    await page.clock.runFor(200);
    await settled(page);
    expect(await drawing(page)).toEqual([]);
    // Opened from the list again, it draws itself again.
    await page.goBack();
    await expect(page.getByRole("list", { name: "Your steelmen" })).toBeVisible();
    await settled(page);
    await forget(page);
    await page.locator(`.sm-post h2 a[href="/b/${board.demo.board}"]`).click();
    await page.waitForFunction(() => (window as unknown as { started: { id: string }[] }).started.some((animation) => animation.id === "sm-draw-in"));
    await settled(page);
  });

  test(`M-15 E-07: at ${width} px, Update, Strongest case and back, a poll, and the reader's own vote don't draw the board again`, async ({ board }) => {
    const family = await find(board, FAMILY);
    const page = await board.open("jordan_w", { width, prepare: record });
    await settled(page);
    await forget(page);
    // Someone else's change arrives with a poll and waits for Update.
    await board.api("tess.b").delete(`versions/${family.version}`);
    await poll(page);
    await expect(pill(page)).toContainText("1 change");
    await pill(page).getByRole("button", { name: "Update" }).click();
    await settled(page);
    await poll(page);
    const view = page.getByRole("group", { name: "View" });
    await view.getByRole("button", { name: "Strongest case", exact: true }).click();
    await settled(page);
    await view.getByRole("button", { name: "Board", exact: true }).click();
    await settled(page);
    const up = importance(page, LEAD).getByRole("button", { name: "More important if true" });
    await up.click();
    await expect(up).toHaveAttribute("aria-pressed", "true");
    await settled(page);
    expect(await drawing(page)).toEqual([]);
  });

  test(`M-15 A-01: at ${width} px, a link to a version and a link to a comment draw nothing and ring at once`, async ({ board }) => {
    const lead = await find(board, LEAD);
    const versionLink = await board.open("jordan_w", { width, prepare: record, at: `/b/${board.demo.board}/v/${lead.version}` });
    await expect(versionLink.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    expect(await versionLink.locator(`.sm-card[data-card="${lead.version}"]`).evaluate((card) => card.classList.contains("sm-arrived"))).toBe(true);
    await settled(versionLink);
    expect(await drawing(versionLink)).toEqual([]);

    const comment = board.ids.itemId();
    await board.api("lin.zhao").post("comments", { id: comment, body: "The library's own survey says the same.", versionId: lead.version });
    const commentLink = await board.open("jordan_w", { width, prepare: record, at: `/b/${board.demo.board}/c/${comment}` });
    await expect(commentLink.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    expect(await commentLink.locator(`.sm-card[data-card="${lead.version}"]`).evaluate((card) => card.classList.contains("sm-arrived"))).toBe(true);
    await settled(commentLink);
    expect(await drawing(commentLink)).toEqual([]);
  });

  test(`M-15: at ${width} px, under reduced motion nothing plays as a board opens, and turning it on during the drawing ends the drawing`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, prepare: record, at: "/privacy" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await forget(page);
    await page.goto(`/b/${board.demo.board}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    await page.clock.runFor(200);
    expect(await started(page)).toEqual([]);
    expect(await page.evaluate(() => document.getAnimations().filter((animation) => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition)).length)).toBe(0);

    // A board drawing itself, held from its start, stops drawing as soon as reduced motion is turned on.
    const drawn = await board.open("jordan_w", { width, prepare: hold });
    expect(await stillDrawing(drawn)).toBeGreaterThan(0);
    await drawn.emulateMedia({ reducedMotion: "reduce" });
    await drawn.waitForFunction(() => (window as unknown as { drawing: Animation[] }).drawing.every((animation) => animation.playState === "finished" || animation.playState === "idle"));
    await settled(drawn);
  });

  test(`M-15 A-01: at ${width} px, a vote pressed during the drawing counts, the button holds still under the pointer, and the board stands at its own layout at once`, async ({ board }) => {
    const lead = await find(board, LEAD);
    // The drawing is held from its start, so the press is certain to come during it.
    const page = await board.open("jordan_w", { width, prepare: hold });
    expect(await stillDrawing(page)).toBeGreaterThan(0);
    const answered = page.waitForResponse((response) => response.url().includes("/importance") && response.request().method() === "PUT");
    const up = importance(page, LEAD).getByRole("button", { name: "More important if true" });
    await up.scrollIntoViewIfNeeded();
    const box = (await up.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // As the pointer goes down, every other part finishes, and the parts around the button hold where they are until
    // the click, so the button doesn't move under the pointer.
    const held = await up.evaluate((button) =>
      (window as unknown as { drawing: Animation[] }).drawing
        .filter((animation) => animation.playState === "paused")
        .map((animation) => (animation.effect as KeyframeEffect).target!.contains(button)),
    );
    expect(held.length).toBeGreaterThan(0);
    expect(held.every(Boolean)).toBe(true);
    const now = (await up.boundingBox())!;
    expect(Math.abs(now.x - box.x) + Math.abs(now.y - box.y)).toBeLessThan(0.5);
    await page.mouse.up();
    expect((await answered).ok()).toBe(true);
    await expect(up).toHaveAttribute("aria-pressed", "true");
    expect(await stillDrawing(page)).toBe(0);
    // The service holds the vote.
    const snapshot = (await board.api("jordan_w").snapshot()) as { arguments: { id: string; myVote: 1 | -1 | null }[] };
    expect(snapshot.arguments.find((argument) => argument.id === lead.argument)?.myVote).toBe(1);
    await settled(page);
    expect(near(await places(page), await places(await still(board, width)), 1)).toEqual([]);
  });

  test(`M-15 A-01: at ${width} px, a key pressed during the drawing ends it at once`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, prepare: hold });
    expect(await stillDrawing(page)).toBeGreaterThan(0);
    await page.keyboard.press("Tab");
    expect(await stillDrawing(page)).toBe(0);
    await settled(page);
    expect(near(await places(page), await places(await still(board, width)), 1)).toEqual([]);
  });

  test(`M-15 A-01: at ${width} px, a tour that opens on a board drawing itself ends the drawing`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, prepare: hold, at: `/b/${board.demo.board}?tour` });
    await expect(page.locator(".sm-tour")).toBeVisible();
    expect((await drawing(page)).length).toBeGreaterThan(0);
    expect(await stillDrawing(page)).toBe(0);
  });

  test(`M-15 E-07: at ${width} px, while the list's zoom plays the board's parts wait hidden, and a vote pressed then means the board never draws itself`, async ({ board }) => {
    const page = await board.open("jordan_w", { width, prepare: holdZoom });
    await page.goto("/");
    await expect(page.getByRole("list", { name: "Your steelmen" })).toBeVisible();
    await settled(page);
    await forget(page);
    await page.locator(`.sm-post h2 a[href="/b/${board.demo.board}"]`).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    expect(await page.evaluate(() => (window as unknown as { grows: Animation[] }).grows.filter((animation) => animation.playState === "paused").length)).toBe(1);
    // Only the canvas grows: the question and the cards wait unseen for the drawing.
    expect(await page.locator(".sm-head").evaluate((head) => getComputedStyle(head).opacity)).toBe("0");
    expect(await page.locator(".sm-board > .sm-column").first().evaluate((column) => getComputedStyle(column).opacity)).toBe("0");
    const answered = page.waitForResponse((response) => response.url().includes("/importance") && response.request().method() === "PUT");
    const up = importance(page, LEAD).getByRole("button", { name: "More important if true" });
    await up.click();
    expect((await answered).ok()).toBe(true);
    await expect(up).toHaveAttribute("aria-pressed", "true");
    // The press shows the board at once, and the drawing never starts, even once the zoom ends.
    expect(await page.locator(".sm-head").evaluate((head) => getComputedStyle(head).opacity)).toBe("1");
    await page.evaluate(() => (window as unknown as { grows: Animation[] }).grows.forEach((animation) => animation.finish()));
    await page.clock.runFor(200);
    await settled(page);
    expect(await drawing(page)).toEqual([]);
    expect(await page.locator(".sm-surface").getAttribute("data-drawing")).toBeNull();
  });
}
