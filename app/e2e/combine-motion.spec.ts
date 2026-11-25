// plans/build-plan.md, M3d-7, "Combining and separating settle in place"
// (A-10, J-05, M-15), at 1280 and 375 px, as the builder answered question 7
// on Nov 24: cards move only on Update. So the absorbed wording fades out
// where it was, on an inert copy of its card, at --sm-medium; a stack whose
// count changed settles with one scale on --sm-settle; a row that appears,
// as a separated wording's does, fades in and rises 8 px at its place in the
// same column; and the rows below take their places at once, as they do
// today, with no flip() on them. No card crosses rows or columns. Undo on the
// bar and Undo in History play the same motion back. Every animation ends in
// the layout the app draws without motion, which a reload draws too.
//
// Web Animations run on the page's own timeline, which Playwright's clock
// doesn't move, so the tests catch each new animation the moment it starts,
// hold it paused, and set its time themselves, as cards-arrive-leave.spec.ts
// does. Its helpers are copied here, because existing test files stay as
// they are.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { TICK_MS, expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { column, find, pill, poll, row, rows, short, status } from "./support/screen.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const SHIFT = "Shift workers can only come on Sundays.";
const STUDY = "Students need a quiet place to study before Monday exams.";
const FAMILY = "Families could visit together on the one day nobody has school or work.";
const YES = [LEAD, STUDY, FAMILY];
const WIDTHS = [1280, 375] as const;
const UNDO_MS = 10_000;

/** The new row's entrance, as the prototype's render(..., 'added') plays it. */
const ENTRANCE = [
  { transform: "translateY(8px)", opacity: "0", offset: 0 },
  { transform: "none", opacity: "1", offset: 1 },
];
/** The copy's fade, at --sm-medium. */
const FADE = [
  { opacity: "1", offset: 0 },
  { opacity: "0", offset: 1 },
];
/** The stack count's one scale, from the prototype's hover size back to its own. */
const SETTLE = [
  { scale: "1.12", offset: 0 },
  { scale: "1", offset: 1 },
];

interface Place {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Every row and card on screen, by "node:" or "card:" and its ID, on the page itself (independent of scrolling). */
function places(page: Page): Promise<Record<string, Place>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-node], .sm-card[data-card]")].flatMap((element) => {
        const { left, top, width, height } = element.getBoundingClientRect();
        if (!width && !height) return [];
        const key = element.dataset.node !== undefined ? `node:${element.dataset.node}` : `card:${element.dataset.card}`;
        return [[key, { left: left + window.scrollX, top: top + window.scrollY, width, height }]];
      }),
    ),
  );
}

function near(a: Record<string, Place>, b: Record<string, Place>, within: number): string[] {
  const problems = Object.keys(a).length === Object.keys(b).length ? [] : [`${Object.keys(a).length} rows and cards, not ${Object.keys(b).length}`];
  for (const [id, place] of Object.entries(a)) {
    const other = b[id];
    if (!other) problems.push(`${id} is missing`);
    else if ((["left", "top", "width", "height"] as const).some((side) => Math.abs(place[side] - other[side]) > within)) problems.push(`${id} is at ${JSON.stringify(place)}, not ${JSON.stringify(other)}`);
  }
  return problems;
}

/** Opens the board for one person; on a phone the window is 600 px tall, as in shuffle-update.spec.ts. */
async function open(board: TestBoard, person: "maya.chen" | "tess.b", width: number): Promise<Page> {
  const page = await board.open(person, { width });
  if (width < 640) await page.setViewportSize({ width, height: 600 });
  await showYes(page, width);
  return page;
}

/** On a phone only one side shows: Yes, where every row these tests move is. */
async function showYes(page: Page, width: number): Promise<void> {
  if (width < 640) await page.getByRole("tab", { name: /^Yes/ }).click();
  await page.evaluate(() => document.fonts.ready);
}

/** Lets the Undo bar's ten seconds pass, so that the board is drawn as a reload draws it, without the bar. */
async function barGone(page: Page): Promise<void> {
  await page.clock.runFor(UNDO_MS + 1_000);
  await expect(page.locator(".sm-undo")).toHaveCount(0);
}

/** Reloads the page and waits for the board to be drawn again. */
async function reload(page: Page, width: number): Promise<void> {
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should our library open on Sundays?");
  await showYes(page, width);
}

/** Stops the page's clock half a second on, so that the Undo bar's ten seconds and the copy's backstop wait for the test. */
async function holdClock(page: Page): Promise<void> {
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
}

interface Caught {
  /** What it plays on: "copy" (in the settling layer), "count:<row>", "row:<row>", "card:<version>", or "other:<class>". */
  on: string;
  keyframes: { transform?: string; opacity?: string; scale?: string; offset: number }[];
  duration: number;
  easing: string;
}

/** One animate() call the page made, as the recorder saw it: what it plays on, its keyframes, and where it was drawn. */
interface Started {
  on: string;
  keyframes: string;
  at: Place;
}

interface Recorded {
  smLabel?: (element: Element) => string;
  smStarted: Started[];
  [held: string]: unknown;
}

/**
 * Records every animate() call the page makes from now on, with what it plays on, named as Caught names it, so that an
 * animation which starts in a later frame or task than the ones a test caught still shows. Installing it twice keeps
 * the first.
 */
async function record(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as Recorded;
    if (w.smLabel) return;
    w.smStarted = [];
    w.smLabel = (element) => {
      if (element.closest(".sm-settling-layer")) return "copy";
      if (element.matches(".sm-stack-count")) return `count:${element.closest<HTMLElement>("[data-node]")?.dataset.node}`;
      if (element.matches("[data-node]")) return `row:${(element as HTMLElement).dataset.node}`;
      if (element.matches(".sm-card[data-card]")) return `card:${(element as HTMLElement).dataset.card}`;
      return `other:${element.className}`;
    };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      const { left, top, width, height } = this.getBoundingClientRect();
      w.smStarted.push({ on: w.smLabel!(this), keyframes: JSON.stringify(args[0] ?? null), at: { left: left + window.scrollX, top: top + window.scrollY, width, height } });
      return animate.apply(this, args);
    };
  });
}

/**
 * Clicks the first element that matches the selector and whose text starts with `text`, in the page itself, and holds
 * the Web Animations that start after it, paused, under `name`. A combine shows only once the service has it, so this
 * waits up to 15 s of the page's own timeline, which Playwright's clock doesn't hold. finish() later checks that no
 * animation started after the click beyond the ones held here.
 */
async function clickAndCatch(page: Page, name: string, selector: string, text?: string): Promise<Caught[]> {
  await record(page);
  return page.evaluate(
    async ({ name, selector, text }) => {
      const w = window as unknown as Recorded;
      const ours = () => document.getAnimations().filter((animation) => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition));
      const earlier = new Set(ours());
      const target = [...document.querySelectorAll<HTMLElement>(selector)].find((element) => text === undefined || element.textContent?.trim().startsWith(text));
      if (!target) throw new Error(`Nothing matches ${selector} ${text ?? ""}`);
      w[`${name}:from`] = w.smStarted.length;
      target.click();
      let held: Animation[] = [];
      const start = document.timeline.currentTime as number;
      while (!held.length && (document.timeline.currentTime as number) - start < 15_000) {
        await new Promise((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = resolve;
          channel.port2.postMessage(null);
        });
        held = ours().filter((animation) => !earlier.has(animation));
      }
      for (const animation of held) animation.pause();
      w[name] = held;
      w[`${name}:on`] = held.map((animation) => w.smLabel!((animation.effect as KeyframeEffect).target!));
      return held.map((animation) => {
        const effect = animation.effect as KeyframeEffect;
        return {
          on: w.smLabel!(effect.target!),
          keyframes: effect.getKeyframes().map((keyframe) => ({
            ...(keyframe.transform !== undefined ? { transform: String(keyframe.transform) } : {}),
            ...(keyframe.opacity !== undefined ? { opacity: String(keyframe.opacity) } : {}),
            ...(keyframe.scale !== undefined ? { scale: String(keyframe.scale) } : {}),
            offset: keyframe.computedOffset,
          })),
          duration: Number(effect.getComputedTiming().duration),
          easing: String(effect.getTiming().easing),
        };
      });
    },
    { name, selector, text },
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

/**
 * Lets the held animations run to their end, and waits until no Web Animation is left on the page. Then every animation
 * that started after the click, in any frame or task, must be one that was held: it answers what each played on.
 */
async function finish(page: Page, name: string): Promise<string[]> {
  await page.evaluate((name) => {
    for (const animation of (window as unknown as Record<string, Animation[]>)[name]!) if (animation.playState !== "idle") animation.finish();
  }, name);
  await settled(page);
  const { started, held } = await page.evaluate((name) => {
    const w = window as unknown as Recorded;
    return { started: w.smStarted.slice(w[`${name}:from`] as number).map((s) => s.on), held: w[`${name}:on`] as string[] };
  }, name);
  expect([...started].sort(), `what started after ${name}'s click`).toEqual([...held].sort());
  return started;
}

/** Clicks, catches what starts, and lets it all run to its end. */
async function clickAndFinish(page: Page, name: string, selector: string, text: string): Promise<void> {
  await clickAndCatch(page, name, selector, text);
  await finish(page, name);
}

/** Waits until nothing on the page is animating, CSS included. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.clock.runFor(40);
}

/** Counts every Web Animation the page starts from now on, so that one which starts and ends between two checks still counts. */
async function countAnimations(page: Page): Promise<void> {
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    const counted = window as unknown as { animationsStarted: number };
    counted.animationsStarted = 0;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      counted.animationsStarted++;
      return animate.apply(this, args);
    };
  });
}

function animationsStarted(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { animationsStarted: number }).animationsStarted);
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Where each wire ends against where its row's card is drawn now, from shuffle-update.spec.ts. */
function wireProblems(page: Page, within: number): Promise<string[]> {
  return page.evaluate((within) => {
    const scene = document.querySelector(".sm-scene")!.getBoundingClientRect();
    const rel = (element: Element) => {
      const b = element.getBoundingClientRect();
      return { x: b.left - scene.left, y: b.top - scene.top, w: b.width, h: b.height };
    };
    const end = (d: string) => {
      let at = { x: 0, y: 0 };
      for (const [, command, args] of d.matchAll(/([MLHV])([^MLHV]*)/g)) {
        const n = args!.trim().split(/[\s,]+/).map(Number);
        if (command === "M" || command === "L") at = { x: n[0]!, y: n[1]! };
        if (command === "H") at = { ...at, x: n[0]! };
        if (command === "V") at = { ...at, y: n[0]! };
      }
      return at;
    };
    const drawn = new Map([...document.querySelectorAll(".sm-links path")].map((path) => [path.getAttribute("data-to") ?? "", end(path.getAttribute("d") ?? "")]));
    const problems: string[] = [];
    for (const column of document.querySelectorAll<HTMLElement>(".sm-board .sm-column")) {
      if (column.offsetParent === null || !column.dataset.option) continue;
      for (const node of column.querySelectorAll<HTMLElement>("[data-node]")) {
        const card = rel(node.querySelector(".sm-card")!);
        const wrap = node.querySelector(".sm-card-wrap");
        const want = { x: wrap ? Math.max(card.x, rel(wrap).x) : card.x, y: card.y + 16 };
        const at = drawn.get(`row:${node.dataset.node}`);
        if (!at) problems.push(`no wire to row ${node.dataset.node}`);
        else if (Math.abs(at.x - want.x) > within || Math.abs(at.y - want.y) > within) problems.push(`row ${node.dataset.node}'s wire ends at ${JSON.stringify(at)}, not ${JSON.stringify(want)}`);
      }
    }
    return problems;
  }, within);
}

/** History beside the board narrows it, so it closes before the layout is compared with a reload's. */
async function closeHistoryAndReload(page: Page, width: number): Promise<void> {
  if (await page.getByRole("dialog", { name: "History" }).isVisible()) await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "History" })).toBeHidden();
  await settled(page);
  const after = await places(page);
  await reload(page, width);
  expect(near(await places(page), after, 1)).toEqual([]);
}

const dialog = (page: Page) => page.getByRole("dialog");
const cardOf = (page: Page, wording: string): Locator => page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
const here = (page: Page, wording: string) => page.getByRole("button", { name: `Combine here: same point as “${short(wording)}”` });

async function chooseFromMenu(page: Page, wording: string, item: string): Promise<void> {
  await cardOf(page, wording).getByRole("button", { name: "Options for this version" }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: item }).click();
}

/** Combines a wording into another argument by "Combine with another argument" and "Combine here", up to the dialog. */
async function askCombine(page: Page, wording: string, into: string): Promise<void> {
  await cardOf(page, wording).getByRole("button", { name: "Combine with another argument" }).click();
  await here(page, into).click();
  await expect(dialog(page).getByRole("button", { name: "Combine" })).toBeVisible();
}

/** What the copy in the settling layer is: hidden, inert, with nothing that names a row or card, and no wording a lookup finds. */
function settlingLayer(page: Page) {
  return page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>(".sm-scene > .sm-settling-layer")!;
    return {
      hidden: layer.getAttribute("aria-hidden"),
      inert: layer.inert,
      copies: layer.childElementCount,
      named: layer.querySelectorAll("[id], [data-card], [data-node], [aria-label], .sm-claim").length,
    };
  });
}

/** Every caught keyframe that moves sideways, or along a row, which no animation here may do. */
function sideways(caught: Caught[]): string[] {
  return caught.flatMap((c) => c.keyframes.filter((k) => k.transform !== undefined && !/^(none|translateY\(-?\d+(\.\d+)?px\))$/.test(k.transform)).map((k) => `${c.on}: ${k.transform}`));
}

const sorted = (caught: Caught[]) => caught.map((c) => c.on).sort();
/** What each caught animation plays on, how, and for how long, in a fixed order, to compare two ways of doing one thing. */
const shape = (caught: Caught[]) => caught.map(({ on, keyframes, duration }) => ({ on, keyframes, duration })).sort((a, b) => a.on.localeCompare(b.on));

for (const width of WIDTHS) {
  test(`A-10 M-15: at ${width} px, combining an argument's last wording fades a copy of it out where it was, settles the kept stack's count with one scale, moves no row, and ends at a reload's layout`, async ({ board }) => {
    const page = await open(board, "maya.chen", width);
    const study = await find(board, STUDY);
    const family = await find(board, FAMILY);
    const was = (await places(page))[`card:${study.version}`]!;
    await askCombine(page, STUDY, FAMILY);
    await holdClock(page);

    const caught = await clickAndCatch(page, "combine", '[role="dialog"] button', "Combine");

    // The row closes and the rows below take their places at once, as today.
    expect(await rows(page, "Yes")).toEqual([LEAD, FAMILY]);
    await expect(status(page)).toHaveText("The arguments are combined. Undo is available for ten seconds.");
    await expect(page.locator(".sm-undo").getByRole("button", { name: "Undo" })).toBeFocused();
    // One fade on the copy and one scale on the kept stack's count, and nothing on any row or card the board draws.
    expect(sorted(caught)).toEqual(["copy", `count:${family.argument}`].sort());
    expect(caught.find((c) => c.on === "copy")).toMatchObject({ keyframes: FADE, duration: 200 });
    expect(caught.find((c) => c.on.startsWith("count:"))).toMatchObject({ keyframes: SETTLE, duration: 420 });
    expect(caught.find((c) => c.on.startsWith("count:"))!.easing).toMatch(/^linear\(/);
    expect(sideways(caught)).toEqual([]);
    expect(await settlingLayer(page)).toEqual({ hidden: "true", inert: true, copies: 1, named: 0 });
    await expect(cardOf(page, STUDY)).toHaveCount(0);

    // Its first frame is the card where it was, at full strength, drawn over the row that took its place.
    await frameAt(page, "combine", 0);
    const first = await page.locator(".sm-settling-layer > *").evaluate((copy: HTMLElement) => {
      const { left, top, width, height } = copy.getBoundingClientRect();
      // The layer skips the cursor, so for this one look it takes it, to find what's drawn on top where the copy is.
      const layer = copy.parentElement!;
      layer.inert = false;
      layer.style.pointerEvents = "auto";
      try {
        const hits = document.elementsFromPoint(left + width / 2, top + Math.min(height / 2, 20));
        const card = hits.findIndex((hit) => hit.closest(".sm-board .sm-card[data-card]"));
        const mine = hits.findIndex((hit) => layer.contains(hit));
        return { left: left + window.scrollX, top: top + window.scrollY, width, height, opacity: getComputedStyle(copy).opacity, over: mine >= 0 && (card < 0 || mine < card) };
      } finally {
        layer.inert = true;
        layer.style.pointerEvents = "";
      }
    });
    for (const side of ["left", "top", "width", "height"] as const) expect(Math.abs(first[side] - was[side]), side).toBeLessThanOrEqual(1);
    expect(first.over).toBe(true);
    expect(first.opacity).toBe("1");

    await finish(page, "combine");
    expect(await settlingLayer(page)).toMatchObject({ copies: 0 });
    await expect(row(page, FAMILY).getByRole("button", { name: "Compare 2 wordings of this argument" })).toBeVisible();
    await barGone(page);
    const after = await places(page);
    await reload(page, width);
    expect(near(await places(page), after, 1)).toEqual([]);
  });

  test(`A-10 M-15: at ${width} px, combining one of two wordings by the menu and the keyboard animates the same as by a drag, and moves nothing across rows or columns`, async ({ board }) => {
    const page = await open(board, "maya.chen", width);
    const lead = await find(board, LEAD);
    const study = await find(board, STUDY);
    const before = await places(page);

    // By the keyboard: the ⋯ menu's Combine…, then Enter on Combine here, which has the cursor.
    await chooseFromMenu(page, LEAD, "Combine…");
    await expect(here(page, STUDY)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog(page).getByRole("button", { name: "Combine" })).toBeFocused();
    await holdClock(page);
    const byKeys = await clickAndCatch(page, "keys", '[role="dialog"] button', "Combine");
    expect(await rows(page, "Yes")).toEqual([SHIFT, STUDY, FAMILY]);
    // The copy fades where the wording was, both stacks whose count changed settle, and nothing moves sideways.
    expect(byKeys.filter((c) => c.on === "copy")).toHaveLength(1);
    expect(byKeys.filter((c) => c.on.startsWith("count:")).map((c) => c.on).sort()).toEqual([`count:${lead.argument}`, `count:${study.argument}`].sort());
    expect(byKeys.filter((c) => c.on.startsWith("row:"))).toEqual([]);
    expect(sideways(byKeys)).toEqual([]);
    // The rows below the kept one take their places at once: nothing plays on them.
    const family = await find(board, FAMILY);
    const below = (on: string) => on.includes(family.argument) || on.includes(family.version);
    expect(byKeys.filter((c) => below(c.on))).toEqual([]);
    // Nor in any later frame: finish() checks that nothing started beyond what was caught.
    expect((await finish(page, "keys")).filter(below)).toEqual([]);
    const combined = await places(page);

    // Undone on the bar, so that the drag starts from the same board.
    await clickAndFinish(page, "undo", ".sm-undo button", "Undo");
    await expect(status(page)).toHaveText("The wording is back where it was.");
    expect(near(await places(page), before, 1)).toEqual([]);

    // By a drag of the card's merge handle onto the other argument.
    await cardOf(page, LEAD).getByRole("button", { name: "Combine with another argument" }).dragTo(row(page, STUDY));
    await expect(dialog(page)).toHaveAccessibleName("Combine this wording with that argument?");
    await holdClock(page);
    const byDrag = await clickAndCatch(page, "drag", '[role="dialog"] button', "Combine");
    expect(shape(byDrag)).toEqual(shape(byKeys));
    await finish(page, "drag");
    expect(near(await places(page), combined, 1)).toEqual([]);
    await barGone(page);
    const after = await places(page);
    await reload(page, width);
    expect(near(await places(page), after, 1)).toEqual([]);
  });

  test(`A-10 M-15: at ${width} px, separating fades the new row in and rises it 8 px at its place in the same column, settles the stack's count, and the rows below take their places at once while the wires follow`, async ({ board }) => {
    const page = await open(board, "maya.chen", width);
    const lead = await find(board, LEAD);
    await chooseFromMenu(page, LEAD, "Separate…");
    await expect(dialog(page)).toHaveAccessibleName("Make this wording its own argument?");
    await holdClock(page);

    const caught = await clickAndCatch(page, "separate", '[role="dialog"] button', "Separate");

    expect(await rows(page, "Yes")).toEqual([SHIFT, STUDY, FAMILY, LEAD]);
    await expect(status(page)).toHaveText("The wording is now its own argument, at the end of this option. Undo is available for ten seconds.");
    const made = await find(board, LEAD);
    expect(made.argument).not.toBe(lead.argument);
    // The row it left settles its count, and the new row rises in. No copy fades: the wording rises in its new row.
    expect(sorted(caught)).toEqual([`count:${lead.argument}`, `row:${made.argument}`].sort());
    expect(await settlingLayer(page)).toMatchObject({ copies: 0 });
    expect(caught.find((c) => c.on === `row:${made.argument}`)).toMatchObject({ keyframes: ENTRANCE, duration: 200 });
    expect(caught.find((c) => c.on === `count:${lead.argument}`)).toMatchObject({ keyframes: SETTLE, duration: 420 });
    expect(sideways(caught)).toEqual([]);

    // In its first frame the new row is clear and 8 px below its place, in the Yes column; halfway, the wires follow it.
    await frameAt(page, "separate", 0);
    const first = await page.locator(`[data-node="${made.argument}"]`).evaluate((node) => ({ opacity: getComputedStyle(node).opacity, column: node.closest<HTMLElement>(".sm-column")?.getAttribute("aria-label") }));
    expect(first).toEqual({ opacity: "0", column: "Yes" });
    await frameAt(page, "separate", 100);
    expect(await wireProblems(page, 1.5)).toEqual([]);

    await finish(page, "separate");
    expect(await wireProblems(page, 1.5)).toEqual([]);
    await barGone(page);
    const after = await places(page);
    await reload(page, width);
    expect(near(await places(page), after, 1)).toEqual([]);
  });

  test(`J-05 A-10 M-15: at ${width} px, Undo on the bar plays a combine and a separation back in place and ends at the earlier layout`, async ({ board }) => {
    const page = await open(board, "maya.chen", width);
    const study = await find(board, STUDY);
    const family = await find(board, FAMILY);
    const lead = await find(board, LEAD);
    const before = await places(page);

    await askCombine(page, STUDY, FAMILY);
    await holdClock(page);
    await clickAndFinish(page, "combine", '[role="dialog"] button', "Combine");
    const back = await clickAndCatch(page, "back", ".sm-undo button", "Undo");
    // The row comes back, rising in at its place, and the stack it left settles its count.
    expect(sorted(back)).toEqual([`count:${family.argument}`, `row:${study.argument}`].sort());
    expect(back.find((c) => c.on === `row:${study.argument}`)).toMatchObject({ keyframes: ENTRANCE, duration: 200 });
    expect(sideways(back)).toEqual([]);
    await finish(page, "back");
    await expect(status(page)).toHaveText("The wording is back where it was.");
    expect(await rows(page, "Yes")).toEqual(YES);
    expect(near(await places(page), before, 1)).toEqual([]);

    await chooseFromMenu(page, LEAD, "Separate…");
    await holdClock(page);
    await clickAndFinish(page, "separate", '[role="dialog"] button', "Separate");
    const made = await find(board, LEAD);
    const undone = await clickAndCatch(page, "unseparate", ".sm-undo button", "Undo");
    // The new row's copy fades where it was, the wording rises back in as its row's lead, and that row's count settles.
    expect(sorted(undone)).toEqual(["copy", `card:${lead.version}`, `count:${lead.argument}`].sort());
    expect(undone.find((c) => c.on === `card:${lead.version}`)).toMatchObject({ keyframes: ENTRANCE, duration: 200 });
    expect(sideways(undone)).toEqual([]);
    await expect(page.locator(`[data-node="${made.argument}"]`)).toHaveCount(0);
    await expect(cardOf(page, LEAD)).toHaveCount(1);
    await finish(page, "unseparate");
    expect(await rows(page, "Yes")).toEqual(YES);
    expect(near(await places(page), before, 1)).toEqual([]);
    await expect(cardOf(page, LEAD).getByRole("button", { name: LEAD })).toBeFocused();
  });

  test(`J-05 A-10 M-15: at ${width} px, Undo in History plays a combine back exactly as Undo on the bar does, and ends at a reload's layout`, async ({ board }) => {
    const page = await open(board, "maya.chen", width);
    const study = await find(board, STUDY);
    const family = await find(board, FAMILY);
    await askCombine(page, STUDY, FAMILY);
    await holdClock(page);
    await clickAndFinish(page, "combine", '[role="dialog"] button', "Combine");
    const bar = await clickAndCatch(page, "bar", ".sm-undo button", "Undo");
    await finish(page, "bar");

    // The same combine again, whose bar goes after its ten seconds, so that only History can undo it.
    await askCombine(page, STUDY, FAMILY);
    await clickAndFinish(page, "again", '[role="dialog"] button', "Combine");
    await barGone(page);
    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByRole("dialog", { name: "History" })).toBeVisible();
    await settled(page);

    const back = await clickAndCatch(page, "rollback", '[role="dialog"] button', "Undo");
    expect(sorted(back)).toEqual([`count:${family.argument}`, `row:${study.argument}`].sort());
    expect(shape(back)).toEqual(shape(bar));
    expect(back.find((c) => c.on === `row:${study.argument}`)).toMatchObject({ keyframes: ENTRANCE, duration: 200 });
    expect(sideways(back)).toEqual([]);
    await finish(page, "rollback");
    await expect(status(page)).toHaveText("The wording is back where it was.");
    expect(await rows(page, "Yes")).toEqual(YES);
    await closeHistoryAndReload(page, width);
  });

  test(`J-05 A-10 M-15: at ${width} px, Undo in History plays a separation back exactly as Undo on the bar does, and ends at a reload's layout`, async ({ board }) => {
    const page = await open(board, "maya.chen", width);
    const lead = await find(board, LEAD);
    await chooseFromMenu(page, LEAD, "Separate…");
    await holdClock(page);
    await clickAndFinish(page, "separate", '[role="dialog"] button', "Separate");
    const bar = await clickAndCatch(page, "bar", ".sm-undo button", "Undo");
    await finish(page, "bar");
    expect(await rows(page, "Yes")).toEqual(YES);

    // The same separation again, whose bar goes after its ten seconds, so that only History can undo it.
    await chooseFromMenu(page, LEAD, "Separate…");
    await clickAndFinish(page, "again", '[role="dialog"] button', "Separate");
    const made = await find(board, LEAD);
    expect(made.argument).not.toBe(lead.argument);
    await barGone(page);
    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByRole("dialog", { name: "History" })).toBeVisible();
    await settled(page);

    // The new row's copy fades where it was, the wording rises back in as its row's lead, and that row's count settles.
    const back = await clickAndCatch(page, "rollback", '[role="dialog"] button', "Undo");
    expect(sorted(back)).toEqual(["copy", `card:${lead.version}`, `count:${lead.argument}`].sort());
    expect(shape(back)).toEqual(shape(bar));
    expect(back.find((c) => c.on === `card:${lead.version}`)).toMatchObject({ keyframes: ENTRANCE, duration: 200 });
    expect(sideways(back)).toEqual([]);
    await finish(page, "rollback");
    await expect(status(page)).toHaveText("The wording is back where it was.");
    await expect(page.locator(`[data-node="${made.argument}"]`)).toHaveCount(0);
    expect(await rows(page, "Yes")).toEqual(YES);
    await closeHistoryAndReload(page, width);
  });

  test(`A-10 M-15: at ${width} px, combining an argument's last wording while an earlier combine's Undo bar shows above it fades the copy where the card was last drawn`, async ({ board }) => {
    const page = await open(board, "maya.chen", width);
    await askCombine(page, LEAD, STUDY);
    await holdClock(page);
    await clickAndFinish(page, "first", '[role="dialog"] button', "Combine");
    expect(await rows(page, "Yes")).toEqual([SHIFT, STUDY, FAMILY]);
    // The bar sits under the row the wording joined, so the card below it moves up once the bar goes.
    const barTop = await page.locator(".sm-undo").evaluate((bar) => bar.getBoundingClientRect().top);
    expect(barTop).toBeLessThan(await cardOf(page, FAMILY).evaluate((card) => card.getBoundingClientRect().top));

    await askCombine(page, FAMILY, STUDY);
    // Where the card is drawn after each change to the page, until it's gone.
    await page.evaluate((wording) => {
      const w = window as unknown as { smLastDrawn?: Place };
      const note = () => {
        const card = [...document.querySelectorAll(".sm-board .sm-card[data-card]")].find((card) => card.querySelector(".sm-claim")?.textContent?.includes(wording));
        if (!card) return;
        const { left, top, width, height } = card.getBoundingClientRect();
        if (width || height) w.smLastDrawn = { left: left + window.scrollX, top: top + window.scrollY, width, height };
      };
      note();
      new MutationObserver(note).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    }, FAMILY);
    const caught = await clickAndCatch(page, "second", '[role="dialog"] button', "Combine");
    expect(sorted(caught)).toContain("copy");
    await expect(page.locator(".sm-undo")).toHaveCount(1);
    await frameAt(page, "second", 0);
    const copy = await page.locator(".sm-settling-layer > *").evaluate((copy) => {
      const { left, top, width, height } = copy.getBoundingClientRect();
      return { left: left + window.scrollX, top: top + window.scrollY, width, height };
    });
    const last = (await page.evaluate(() => (window as unknown as { smLastDrawn?: Place }).smLastDrawn))!;
    for (const side of ["left", "top", "width", "height"] as const) expect(Math.abs(copy[side] - last[side]), side).toBeLessThanOrEqual(1);
    await finish(page, "second");
    expect(await rows(page, "Yes")).toEqual([SHIFT, STUDY]);
    await barGone(page);
    const after = await places(page);
    await reload(page, width);
    expect(near(await places(page), after, 1)).toEqual([]);
  });

  test(`A-10 J-05 M-04 M-15: at ${width} px, the board passes an accessibility scan once a combine and a separation have settled`, async ({ board }) => {
    const page = await open(board, "maya.chen", width);
    await askCombine(page, STUDY, FAMILY);
    await dialog(page).getByRole("button", { name: "Combine" }).click();
    await expect(page.locator(".sm-undo")).toBeVisible();
    await settled(page);
    expect(await settlingLayer(page)).toMatchObject({ copies: 0 });
    await expectNoAxeViolations(page);

    await chooseFromMenu(page, LEAD, "Separate…");
    await dialog(page).getByRole("button", { name: "Separate" }).click();
    await expect(page.locator(".sm-undo")).toContainText("You made the wording its own argument.");
    await settled(page);
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });

  test(`A-10 J-05 M-15: at ${width} px with reduced motion, combining, separating, Undo, and History's Undo start no animation and draw no copy`, async ({ board }) => {
    const page = await open(board, "maya.chen", width);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await countAnimations(page);
    const none = async () => (await page.evaluate(() => document.getAnimations().length)) + (await animationsStarted(page)) + (await settlingLayer(page)).copies;

    await askCombine(page, STUDY, FAMILY);
    await dialog(page).getByRole("button", { name: "Combine" }).click();
    await expect(status(page)).toHaveText("The arguments are combined. Undo is available for ten seconds.");
    expect(await none()).toBe(0);
    await page.locator(".sm-undo").getByRole("button", { name: "Undo" }).click();
    await expect(status(page)).toHaveText("The wording is back where it was.");
    expect(await none()).toBe(0);

    await chooseFromMenu(page, LEAD, "Separate…");
    await dialog(page).getByRole("button", { name: "Separate" }).click();
    await expect(page.locator(".sm-undo")).toContainText("You made the wording its own argument.");
    expect(await none()).toBe(0);
    await page.locator(".sm-undo").getByRole("button", { name: "Undo" }).click();
    await expect(status(page)).toHaveText("The wording is back where it was.");
    expect(await none()).toBe(0);
    expect(await rows(page, "Yes")).toEqual(YES);

    const study = await find(board, STUDY);
    const family = await find(board, FAMILY);
    await board.api("maya.chen").post(`versions/${study.version}/combine`, { into: family.argument });
    await reload(page, width);
    await countAnimations(page);
    await page.getByRole("button", { name: "History" }).click();
    await page.getByRole("dialog", { name: "History" }).getByRole("listitem").nth(0).getByRole("button", { name: /^Undo/ }).click();
    await expect(status(page)).toHaveText("The wording is back where it was.");
    expect(await none()).toBe(0);
  });

  for (const [wording, into, said] of [
    [LEAD, STUDY, "The wording now sits with the other argument’s wordings."],
    [STUDY, FAMILY, "The arguments are combined."],
  ] as const) {
    test(`A-10 M-02 M-15: at ${width} px, a combine of ${wording === LEAD ? "one of two wordings" : "an argument's last wording"} confirmed while Update's shuffle is starting settles from the shuffled screen and ends at the layout a reload draws`, async ({ board }) => {
      const page = await open(board, "maya.chen", width);
      const family = await find(board, FAMILY);
      // Others' votes wait for Update: FAMILY would move to the top.
      for (const person of ["omar_h", "lin.zhao", "tess.b"] as const) await board.api(person).put(`arguments/${family.argument}/importance`, { value: 1 });
      board.clock.advance(TICK_MS);
      await poll(page);
      await expect(pill(page)).toBeVisible();
      await chooseFromMenu(page, wording, "Combine…");
      await here(page, into).click();
      await expect(dialog(page).getByRole("button", { name: "Combine" })).toBeVisible();
      await record(page);

      // Combine, then Update before the service has answered. The shuffle's moves are finished as soon as they start,
      // so that the wording's card is drawn where Update put it before the combine shows.
      await page.evaluate(async (wording) => {
        const w = window as unknown as Recorded & { smFrom: number; smShuffled?: Place };
        w.smFrom = w.smStarted.length;
        [...document.querySelectorAll<HTMLElement>('[role="dialog"] button')].find((button) => button.textContent?.trim() === "Combine")!.click();
        [...document.querySelectorAll<HTMLElement>(".sm-fresh button")].find((button) => button.textContent?.includes("Update"))!.click();
        const ours = () => document.getAnimations().filter((animation) => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition));
        const start = document.timeline.currentTime as number;
        while (!w.smStarted.slice(w.smFrom).some((s) => s.keyframes.includes("translate(")) && (document.timeline.currentTime as number) - start < 15_000) {
          await new Promise((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = resolve;
            channel.port2.postMessage(null);
          });
        }
        for (const animation of ours()) animation.finish();
        const card = [...document.querySelectorAll(".sm-board .sm-card[data-card]")].find((card) => card.querySelector(".sm-claim")?.textContent?.includes(wording));
        const box = card?.getBoundingClientRect();
        if (box && (box.width || box.height)) w.smShuffled = { left: box.left + window.scrollX, top: box.top + window.scrollY, width: box.width, height: box.height };
      }, wording);
      await expect(status(page)).toHaveText(`${said} Undo is available for ten seconds.`);
      await settled(page);

      // The shuffle's moves started before the combine showed, and the combine's own motion came after, so the two met.
      const { order, copies, shuffled } = await page.evaluate(() => {
        const w = window as unknown as Recorded & { smFrom: number; smShuffled?: Place };
        const started = w.smStarted.slice(w.smFrom);
        const settles = (s: Started) => s.on === "copy" || s.on.startsWith("count:") || s.keyframes.includes("translateY(8px)");
        return {
          order: started.map((s) => (s.keyframes.includes("translate(") ? "flip" : settles(s) ? "settle" : "other")),
          copies: started.filter((s) => s.on === "copy").map((s) => s.at),
          shuffled: w.smShuffled ?? null,
        };
      });
      expect(order.indexOf("flip")).toBeGreaterThanOrEqual(0);
      expect(order.indexOf("settle")).toBeGreaterThan(order.indexOf("flip"));
      // A copy, if one fades, starts where the card was drawn after the shuffle, never where it was before Update. Its
      // height is left out: the card is measured here while it still shows the combine's picking state.
      if (!shuffled) expect(copies).toEqual([]);
      for (const copy of copies) for (const side of ["left", "top", "width"] as const) expect(Math.abs(copy[side] - shuffled![side]), side).toBeLessThanOrEqual(1);
      expect(await settlingLayer(page)).toMatchObject({ copies: 0 });
      expect(await wireProblems(page, 1.5)).toEqual([]);
      await barGone(page);
      const after = await places(page);
      await reload(page, width);
      expect(near(await places(page), after, 1)).toEqual([]);
    });
  }
}

test("A-10 M-02 M-15: someone else's combine starts no animation and draws no copy, before or after the poll", async ({ board }) => {
  const page = await open(board, "maya.chen", 1280);
  const study = await find(board, STUDY);
  const family = await find(board, FAMILY);
  await settled(page);
  await countAnimations(page);
  await board.setRole("omar_h", "editor");
  await board.api("omar_h").post(`versions/${study.version}/combine`, { into: family.argument });
  await board.api("omar_h").post(`versions/${(await find(board, SHIFT)).version}/separate`, { argumentId: board.ids.itemId() });
  await poll(page);
  await expect(pill(page)).toBeVisible();
  expect(await animationsStarted(page)).toBe(0);
  expect(await settlingLayer(page)).toMatchObject({ copies: 0 });
  expect(await column(page, "Yes").locator(".sm-idea").count()).toBeGreaterThanOrEqual(3);
});
