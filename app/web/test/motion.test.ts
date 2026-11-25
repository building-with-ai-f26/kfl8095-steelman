/// <reference types="node" />
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { build } from "vite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { captureRects, duration, flip, play, reducedMotion } from "../src/board/motion.ts";

// The motion system (M3d-2, M-15): play(), which starts nothing under reduced
// motion, and flip(), which moves each element from where it was to where it
// is now and ends in exactly the final layout. The first tests run in Node on
// fake elements whose drawn place includes half of any running move, so a
// "mid-flight" rect is easy to state. The last ones run the same module in
// Playwright's Chromium, as web/test/app-icon.test.ts does, so the browser's
// own getBoundingClientRect, Web Animations, and linear() easing are checked.

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const TOKENS: Record<string, string> = {
  "--sm-medium": "200ms",
  "--sm-slow": "420ms",
  "--sm-ease": "cubic-bezier(.2,.7,.2,1)",
  "--sm-settle": "linear(0, .5, 1.04, 1)",
  "--sm-lift": "0 6px 14px #00000029",
  "--sm-leave": "160ms",
  "--sm-fold": "0.22s",
};

class FakeAnimation {
  playState = "running";
  readonly finished: Promise<FakeAnimation>;
  private settle!: { resolve(value: FakeAnimation): void; reject(reason: unknown): void };
  constructor(
    readonly element: FakeElement,
    readonly keyframes: Keyframe[],
    readonly options: KeyframeAnimationOptions,
  ) {
    this.finished = new Promise((resolve, reject) => (this.settle = { resolve, reject }));
  }
  cancel() {
    if (this.playState !== "running") return;
    this.playState = "idle";
    this.settle.reject(new Error("AbortError"));
  }
  finish() {
    this.playState = "finished";
    this.settle.resolve(this);
  }
  /** The x and y the first frame's transform starts at. */
  get from(): { x: number; y: number } {
    const match = String(this.keyframes[0]?.transform ?? "").match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 };
  }
}

class FakeElement {
  readonly animations: FakeAnimation[] = [];
  boxShadow = "none";
  /** A row's own card, which is what `:scope > .sm-card-wrap > .sm-card` finds. */
  face: FakeElement | null = null;
  constructor(
    public layout: Box,
    readonly dataset: Record<string, string> = {},
    readonly parentElement: FakeElement | null = null,
  ) {
    if (parentElement && dataset.card !== undefined) parentElement.face = this;
  }
  matches(selector: string) {
    if (selector !== ".sm-card") throw new Error(`The fake can't match ${selector}`);
    return this.dataset.card !== undefined;
  }
  querySelector(selector: string) {
    if (selector !== ":scope > .sm-card-wrap > .sm-card") throw new Error(`The fake can't find ${selector}`);
    return this.face;
  }
  animate(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    const animation = new FakeAnimation(this, keyframes, options);
    this.animations.push(animation);
    return animation;
  }
  get running(): FakeAnimation[] {
    return this.animations.filter((animation) => animation.playState === "running");
  }
  /** Where it's drawn: its layout moved by half of every running move on it and on its ancestors. */
  getBoundingClientRect(): Box {
    const { x, y } = this.shift();
    return { ...this.layout, left: this.layout.left + x, top: this.layout.top + y };
  }
  private shift(): { x: number; y: number } {
    const carried = this.parentElement?.shift() ?? { x: 0, y: 0 };
    return this.running.reduce((at, animation) => ({ x: at.x + animation.from.x / 2, y: at.y + animation.from.y / 2 }), carried);
  }
}

/** A board whose querySelectorAll gives its elements in document order, and remembers the selector it was asked for. */
function scene(elements: FakeElement[]) {
  const asked: string[] = [];
  const root = {
    querySelectorAll(selector: string) {
      asked.push(selector);
      return elements;
    },
  };
  return { root: root as unknown as Element, asked };
}

const row = (id: string, top: number, left = 0) => new FakeElement({ left, top, width: 300, height: 80 }, { node: id });
const card = (id: string, parent: FakeElement) => new FakeElement({ ...parent.layout, top: parent.layout.top + 4, height: 72 }, { card: id }, parent);
const flown = (element: FakeElement) => element.running;
const asElements = (elements: FakeElement[]) => elements as unknown as Element[];

let reduce = false;
let supported = true;
beforeEach(() => {
  reduce = false;
  supported = true;
  vi.stubGlobal("window", {
    matchMedia: (query: string) => ({ matches: reduce && query.includes("prefers-reduced-motion: reduce") }),
    getComputedStyle: (element: FakeElement) => ({ getPropertyValue: (name: string) => TOKENS[name] ?? "", boxShadow: element.boxShadow ?? "none" }),
  });
  vi.stubGlobal("CSS", { supports: () => supported });
});
afterEach(() => vi.unstubAllGlobals());

test("M-15: play() returns null and starts nothing under reduced motion", () => {
  const element = new FakeElement({ left: 0, top: 0, width: 10, height: 10 });
  reduce = true;
  expect(reducedMotion()).toBe(true);
  expect(play(element as unknown as Element, [{ opacity: 0 }, { opacity: 1 }])).toBeNull();
  expect(element.animations).toHaveLength(0);

  // flip() goes through play(), so it starts nothing either.
  const a = row("a", 0);
  const before = captureRects(scene([a]).root);
  a.layout = { ...a.layout, top: 200 };
  flip(before, scene([a]).root);
  expect(a.animations).toHaveLength(0);

  // Without the setting, play() starts one animation, at --sm-medium on --sm-ease unless told otherwise.
  reduce = false;
  expect(reducedMotion()).toBe(false);
  const animation = play(element as unknown as Element, [{ opacity: 0 }, { opacity: 1 }]) as unknown as FakeAnimation;
  expect(element.animations).toEqual([animation]);
  expect(animation.options).toMatchObject({ duration: 200, easing: "cubic-bezier(.2,.7,.2,1)" });
});

test("M-15: flip() gives each moved element a transform from its old offset to none, and an element that didn't move gets no animation", () => {
  const a = row("a", 0);
  const b = row("b", 100);
  const c = row("c", 200);
  const inA = card("va", a);
  const { root, asked } = scene([a, inA, b, c]);
  const before = captureRects(root);
  expect(asked).toEqual(["[data-node], .sm-card[data-card]"]);

  // a and b swap; c stays; a's card travels with a.
  a.layout = { ...a.layout, top: 100 };
  inA.layout = { ...inA.layout, top: 104 };
  b.layout = { ...b.layout, top: 0 };
  const { arrivals, animations } = flip(before, root);

  expect(arrivals).toEqual([]);
  expect(flown(a)).toHaveLength(1);
  expect(flown(a)[0]!.keyframes).toEqual([{ transform: "translate(0px, -100px)" }, { transform: "none" }]);
  expect(flown(b)[0]!.keyframes).toEqual([{ transform: "translate(0px, 100px)" }, { transform: "none" }]);
  // The settle curve, at --sm-slow, holding its start while it waits its turn, and never holding its end.
  expect(flown(a)[0]!.options).toMatchObject({ duration: 420, easing: "linear(0, .5, 1.04, 1)", fill: "backwards" });
  expect(flown(c)).toHaveLength(0);
  // The card moves with its row, so it needs no move of its own: it would travel twice as far.
  expect(flown(inA)).toHaveLength(0);
  expect(animations).toHaveLength(2);
});

test("M-15: a card that moves within its moving row is moved only by the difference", () => {
  const a = row("a", 0);
  const inA = card("va", a);
  const { root } = scene([a, inA]);
  const before = captureRects(root);
  a.layout = { ...a.layout, top: 100 };
  inA.layout = { ...inA.layout, left: 30, top: 114 };
  flip(before, root);
  expect(flown(inA)[0]!.keyframes[0]).toEqual({ transform: "translate(-30px, -10px)" });
});

test("M-15: a second flip() during the first one cancels the earlier animation and ends at the new rects", () => {
  const a = row("a", 0);
  const b = row("b", 100);
  const { root } = scene([a, b]);
  const first = captureRects(root);
  a.layout = { ...a.layout, top: 100 };
  b.layout = { ...b.layout, top: 0 };
  flip(first, root);
  const [earlier] = flown(a);
  // Halfway there, a is drawn at 50.
  expect(a.getBoundingClientRect().top).toBe(50);

  // Another change: a goes back to the top while it's still moving.
  const second = captureRects(root);
  a.layout = { ...a.layout, top: 0 };
  b.layout = { ...b.layout, top: 100 };
  flip(second, root);

  expect(earlier!.playState).toBe("idle");
  // The new move starts where a was drawn (50), measured from where it now is (0), and ends at none.
  expect(flown(a)).toHaveLength(1);
  expect(flown(a)[0]!.keyframes).toEqual([{ transform: "translate(0px, 50px)" }, { transform: "none" }]);
  for (const element of [a, b]) for (const animation of element.running) animation.finish();
  expect(a.getBoundingClientRect().top).toBe(0);
  expect(b.getBoundingClientRect().top).toBe(100);
});

test("M-15: new elements are returned as arrivals, and hidden ones are neither moved nor arrivals", () => {
  const a = row("a", 0);
  const hidden = row("hidden", 0);
  hidden.layout = { left: 0, top: 0, width: 0, height: 0 };
  const before = captureRects(scene([a, hidden]).root);

  const added = row("added", 100);
  const addedCard = card("vadded", added);
  a.layout = { ...a.layout, top: 0 };
  const { arrivals } = flip(before, scene([a, added, addedCard, hidden]).root);
  expect(arrivals).toEqual(asElements([added, addedCard]));
  expect(added.animations).toHaveLength(0);
  expect(hidden.animations).toHaveLength(0);
});

test("M-15: an element React made anew under the same row or card ID moves from the old one's place", () => {
  const before = captureRects(scene([row("a", 0)]).root);
  const remade = row("a", 120);
  const { arrivals } = flip(before, scene([remade]).root);
  expect(arrivals).toEqual([]);
  expect(flown(remade)[0]!.keyframes[0]).toEqual({ transform: "translate(0px, -120px)" });
});

test("M-15: the stagger follows reading order", () => {
  // In document order: the left column's rows, then the right column's. Reading order is top to bottom, and left to
  // right along a line, so both columns start together.
  const left1 = row("l1", 100, 0);
  const left2 = row("l2", 300, 0);
  const still = row("still", 500, 0);
  const right1 = row("r1", 100, 600);
  const { root } = scene([left1, left2, still, right1]);
  const before = captureRects(root);
  left1.layout = { ...left1.layout, top: 300 };
  left2.layout = { ...left2.layout, top: 100 };
  right1.layout = { ...right1.layout, top: 200 };
  flip(before, root);

  const delay = (element: FakeElement) => flown(element)[0]!.options.delay;
  // At their new places: left2 at 100, right1 at 200, left1 at 300. The row that stayed takes no turn.
  expect([delay(left2), delay(right1), delay(left1)]).toEqual([0, 20, 40]);
  expect(flown(still)).toHaveLength(0);

  // A caller can choose its own stagger.
  const x = row("x", 0);
  const y = row("y", 100);
  const two = scene([x, y]).root;
  const again = captureRects(two);
  x.layout = { ...x.layout, top: 100 };
  y.layout = { ...y.layout, top: 0 };
  flip(again, two, { stagger: 45 });
  expect([delay(y), delay(x)]).toEqual([0, 45]);
});

test("M-15: a long board's stagger stops growing, so the last row doesn't wait more than a quarter second", () => {
  const rows = Array.from({ length: 40 }, (_, at) => row(`r${at}`, at * 100));
  const { root } = scene(rows);
  const before = captureRects(root);
  for (const element of rows) element.layout = { ...element.layout, top: 4100 - element.layout.top };
  flip(before, root);
  const delays = rows.map((element) => Number(flown(element)[0]!.options.delay));
  expect(Math.max(...delays)).toBeLessThanOrEqual(240);
});

test("M-15: with lift, a card that moves on its own starts in --sm-lift and is set down in its own shadow", () => {
  const a = row("a", 0);
  const inA = card("va", a);
  inA.boxShadow = "0 1px 2px #0000001a";
  const { root } = scene([a, inA]);
  const before = captureRects(root);
  inA.layout = { ...inA.layout, left: 40 };
  const { animations } = flip(before, root, { lift: true });
  expect(flown(a)).toHaveLength(0);
  expect(flown(inA).map((animation) => animation.keyframes)).toEqual([
    [{ transform: "translate(-40px, 0px)" }, { transform: "none" }],
    [{ boxShadow: "0 6px 14px #00000029" }, { boxShadow: "0 1px 2px #0000001a" }],
  ]);
  // The shadow keeps the move's timing, so the card is set down as it lands.
  expect(flown(inA)[1]!.options).toEqual(flown(inA)[0]!.options);
  expect(animations).toHaveLength(2);
});

test("M-15: with lift, a row that moves lifts its card, not the whole row", () => {
  const a = row("a", 0);
  const b = row("b", 100);
  const inA = card("va", a);
  const inB = card("vb", b);
  inA.boxShadow = "0 1px 2px #0000001a";
  const { root } = scene([a, inA, b, inB]);
  const before = captureRects(root);
  a.layout = { ...a.layout, top: 100 };
  inA.layout = { ...inA.layout, top: 104 };
  b.layout = { ...b.layout, top: 0 };
  inB.layout = { ...inB.layout, top: 4 };
  const { animations } = flip(before, root, { lift: true });

  // The row moves with a transform only, and its card, which doesn't move within it, wears the shadow.
  expect(flown(a).map((animation) => animation.keyframes)).toEqual([[{ transform: "translate(0px, -100px)" }, { transform: "none" }]]);
  expect(flown(inA).map((animation) => animation.keyframes)).toEqual([[{ boxShadow: "0 6px 14px #00000029" }, { boxShadow: "0 1px 2px #0000001a" }]]);
  expect(flown(inA)[0]!.options).toEqual(flown(a)[0]!.options);
  expect(animations).toHaveLength(4);

  // A second flip() cancels the lift with the move, and the card that now moves within its row lifts once.
  const again = captureRects(root);
  inA.layout = { ...inA.layout, left: 30 };
  flip(again, root, { lift: true });
  expect(animations.every((animation) => (animation as unknown as FakeAnimation).playState === "idle")).toBe(true);
  expect(flown(a)).toHaveLength(1);
  expect(flown(inA).filter((animation) => "boxShadow" in animation.keyframes[0]!)).toHaveLength(1);
});

test("M-15: the settle curve falls back to the ease in a browser that can't read linear()", () => {
  supported = false;
  const a = row("a", 0);
  const { root } = scene([a]);
  const before = captureRects(root);
  a.layout = { ...a.layout, top: 80 };
  flip(before, root);
  expect(flown(a)[0]!.options.easing).toBe("cubic-bezier(.2,.7,.2,1)");
});

test("M-15: the timing tokens are read in milliseconds, with today's values when a token is missing", () => {
  const root = new FakeElement({ left: 0, top: 0, width: 0, height: 0 }) as unknown as Element;
  expect(duration("leave", root)).toBe(160);
  expect(duration("fold", root)).toBe(220);
  // Not in the fake stylesheet: the value the app used before the token.
  expect(duration("ring", root)).toBe(1400);
  expect(duration("fast", root)).toBe(120);
});

describe("in a browser", () => {
  let browser: Browser | undefined;
  let bundle = "";
  let tokens = "";

  beforeAll(async () => {
    // The module as the browser runs it, exposed as window.motion.
    const output = await build({
      configFile: false,
      logLevel: "warn",
      build: { write: false, minify: false, lib: { entry: join(import.meta.dirname, "../src/board/motion.ts"), formats: ["iife"], name: "motion" } },
    });
    const outputs = Array.isArray(output) ? output : [output];
    bundle = outputs.flatMap((result) => ("output" in result ? result.output : [])).find((chunk) => chunk.type === "chunk")?.code ?? "";
    tokens = await readFile(join(import.meta.dirname, "../../../docs/design/tokens.css"), "utf8");
    browser = await chromium.launch();
  }, 120_000);
  afterAll(async () => {
    await browser?.close();
  });

  /** A column of four rows, each holding a card, on a page with the app's tokens and the motion module. */
  async function column(reducedMotion: "reduce" | "no-preference" = "no-preference"): Promise<Page> {
    const page = await browser!.newPage({ reducedMotion });
    const rows = ["a", "b", "c", "d"].map((id) => `<section data-node="${id}"><div class="sm-card-wrap"><article class="sm-card" data-card="v${id}">${id}</article></div></section>`).join("");
    await page.setContent(`<style>${tokens} body{margin:0} section{height:80px;padding:4px} .sm-card{height:70px;box-shadow:var(--sm-shadow)}</style><main>${rows}</main>`);
    await page.addScriptTag({ content: bundle });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    (page as Page & { errors?: string[] }).errors = errors;
    return page;
  }

  /**
   * Reverses the rows, flips with lift, and reports each animation's target and first frame, and the animations
   * running. With `pauseAt`, every animation is then paused that many ms in, in the same step, so that the next
   * reversal starts mid-flight however slow the machine is.
   */
  const reverse = (page: Page, pauseAt?: number) =>
    page.evaluate((pauseAt) => {
      const motion = (window as unknown as { motion: typeof import("../src/board/motion.ts") }).motion;
      const main = document.querySelector("main")!;
      const before = motion.captureRects(main);
      main.replaceChildren(...[...main.children].reverse());
      const { animations } = motion.flip(before, main, { lift: true });
      const running = document.getAnimations().length;
      if (pauseAt !== undefined)
        for (const animation of document.getAnimations()) {
          animation.pause();
          animation.currentTime = pauseAt;
        }
      return {
        count: animations.length,
        running,
        first: animations.map((animation) => {
          const effect = animation.effect as KeyframeEffect;
          const target = effect.target as HTMLElement;
          const [frame] = effect.getKeyframes();
          return {
            id: target.dataset.node ?? target.dataset.card,
            card: target.classList.contains("sm-card"),
            transform: frame!.transform,
            boxShadow: frame!.boxShadow,
            easing: effect.getTiming().easing,
          };
        }),
      };
    }, pauseAt);

  const tops = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-node]")].map((element) => [element.dataset.node, element.getBoundingClientRect().top]));

  test("M-15: in Chromium, flip() moves each row from its old place with the settle curve and ends at the final layout", async () => {
    const page = await column();
    const flipped = await reverse(page);
    // Four rows reversed: every row moves, no card moves on its own, and each row's card wears the lift.
    expect(flipped.count).toBe(8);
    expect(flipped.running).toBe(8);
    const moves = flipped.first.filter((animation) => !animation.card);
    const lifts = flipped.first.filter((animation) => animation.card);
    expect(moves.map((move) => move.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(moves.every((move) => move.boxShadow === undefined)).toBe(true);
    expect(moves.find((move) => move.id === "a")).toMatchObject({ transform: "translate(0px, -264px)" });
    expect(lifts.map((lift) => lift.id).sort()).toEqual(["va", "vb", "vc", "vd"]);
    expect(lifts.every((lift) => lift.transform === undefined && Boolean(lift.boxShadow))).toBe(true);
    expect(flipped.first.every((animation) => String(animation.easing).includes("linear("))).toBe(true);
    await page.evaluate(() => Promise.allSettled(document.getAnimations().map((animation) => animation.finished)));
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(await tops(page)).toEqual([
      ["d", 0],
      ["c", 88],
      ["b", 176],
      ["a", 264],
    ]);
    expect((page as Page & { errors?: string[] }).errors).toEqual([]);
    await page.close();
  }, 60_000);

  test("M-15: in Chromium, a second flip() mid-flight cancels the first, raises no error, and ends at the new layout", async () => {
    const page = await column();
    // The first reversal is held 150 ms in, partway to its end.
    const first = await reverse(page, 150);
    expect(first.running).toBe(8);
    const second = await reverse(page);
    expect(second.running).toBe(8);
    // Row a was partway down when the second reversal began, so its move back starts from where it was drawn: neither
    // its old place (264 px down) nor its new one.
    const back = String(second.first.find((move) => move.id === "a" && !move.card)?.transform).match(/^translate\(0px, (-?[\d.]+)px\)$/);
    expect(back).not.toBeNull();
    expect(Number(back![1])).toBeGreaterThan(0);
    expect(Number(back![1])).toBeLessThan(264);
    await page.evaluate(() => Promise.allSettled(document.getAnimations().map((animation) => animation.finished)));
    expect(await tops(page)).toEqual([
      ["a", 0],
      ["b", 88],
      ["c", 176],
      ["d", 264],
    ]);
    expect((page as Page & { errors?: string[] }).errors).toEqual([]);
    await page.close();
  }, 60_000);

  test("M-15: in Chromium with reduced motion, flip() and play() start no animation", async () => {
    const page = await column("reduce");
    const flipped = await reverse(page);
    expect(flipped).toMatchObject({ count: 0, running: 0 });
    expect(await page.evaluate(() => (window as unknown as { motion: typeof import("../src/board/motion.ts") }).motion.play(document.body, [{ opacity: 0 }, { opacity: 1 }]))).toBeNull();
    expect(await tops(page)).toEqual([
      ["d", 0],
      ["c", 88],
      ["b", 176],
      ["a", 264],
    ]);
    await page.close();
  }, 60_000);
});
