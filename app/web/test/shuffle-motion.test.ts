/// <reference types="node" />
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { build } from "vite";
import { afterAll, beforeAll, expect, test } from "vitest";

// What M3d-3's shuffle on Update asks of the motion system (B-05, M-15):
// flip()'s `travel` option, under which a row scales to 1.01 while it travels
// and a row moving up passes over a row moving down, stopMoves(), which
// stops the moves under the board before Update measures the row the reader
// is reading, and drawnRect(), which measures a growing row at its own size
// so that a second Update starts each row where it's seen. They run in
// Playwright's Chromium, as the browser tests in
// web/test/motion.test.ts do, so that the browser's own Web Animations, z-index
// and hit testing are checked. flip() without `travel` is unchanged, and
// motion.test.ts still checks it.

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

type Motion = typeof import("../src/board/motion.ts");

/** A column of four rows, each holding a card, styled as the board's rows are: positioned, and on z-index 1. */
async function column(reducedMotion: "reduce" | "no-preference" = "no-preference"): Promise<Page & { errors: string[] }> {
  const page = (await browser!.newPage({ reducedMotion })) as Page & { errors: string[] };
  const rows = ["a", "b", "c", "d"].map((id) => `<section data-node="${id}"><div class="sm-card-wrap"><article class="sm-card" data-card="v${id}">${id}</article></div></section>`).join("");
  await page.setContent(
    `<style>${tokens} body{margin:0} section{height:80px;padding:4px;position:relative;z-index:1;background:#fff} .sm-card{height:70px;box-shadow:var(--sm-shadow)}</style><main>${rows}</main>`,
  );
  await page.addScriptTag({ content: bundle });
  page.errors = [];
  page.on("pageerror", (error) => page.errors.push(error.message));
  return page;
}

/** Reverses the rows and flips them with lift and travel, then pauses every animation at `at` ms. */
function reverse(page: Page, at: number, travel = true) {
  return page.evaluate(
    ({ at, travel }) => {
      const motion = (window as unknown as { motion: Motion }).motion;
      const main = document.querySelector("main")!;
      const before = motion.captureRects(main);
      main.replaceChildren(...[...main.children].reverse());
      const { animations } = motion.flip(before, main, { lift: true, travel });
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = at;
      }
      const rows = animations.filter((animation) => (animation.effect as KeyframeEffect).target!.matches("[data-node]"));
      return rows.map((animation) => {
        const effect = animation.effect as KeyframeEffect;
        const target = effect.target as HTMLElement;
        return {
          id: target.dataset.node!,
          keyframes: effect.getKeyframes().map(({ transform, scale, zIndex, computedOffset }) => ({ transform, scale, zIndex, offset: computedOffset })),
          zIndex: getComputedStyle(target).zIndex,
        };
      });
    },
    { at, travel },
  );
}

const place = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-node]")].map((element) => {
      const { top, height } = element.getBoundingClientRect();
      return { id: element.dataset.node, top: Math.round(top * 10) / 10, height: Math.round(height * 10) / 10, zIndex: getComputedStyle(element).zIndex };
    }),
  );

test("B-05 M-15: with travel, each moved row starts at scale 1 in its old place, scales to 1.01 while it travels, and lands at scale 1", async () => {
  const page = await column();
  const moves = await reverse(page, 0);
  expect(moves.map((move) => move.id).sort()).toEqual(["a", "b", "c", "d"]);
  const a = moves.find((move) => move.id === "a")!;
  // One animation per row: the move, the scale, and the raise are one set of keyframes.
  expect(a.keyframes).toHaveLength(3);
  expect(a.keyframes[0]).toMatchObject({ transform: "translate(0px, -264px)", scale: "1" });
  expect(a.keyframes[1]).toMatchObject({ scale: "1.01", offset: 0.5 });
  expect(a.keyframes[2]).toMatchObject({ transform: "none", scale: "1" });
  // At its first frame, every row is drawn exactly where it was before the change, at its own size.
  expect(await place(page)).toEqual([
    { id: "d", top: 264, height: 88, zIndex: "2" },
    { id: "c", top: 176, height: 88, zIndex: "2" },
    { id: "b", top: 88, height: 88, zIndex: "1" },
    { id: "a", top: 0, height: 88, zIndex: "1" },
  ]);
  expect(page.errors).toEqual([]);
  await page.close();
}, 60_000);

test("B-05 M-15: with travel, a row moving up passes over a row moving down, and only while it moves", async () => {
  const page = await column();
  // Somewhere in the move, d (moving up) and a (moving down) cross; where they overlap, d is the one on top.
  await reverse(page, 0);
  const crossing = await page.evaluate(() => {
    const [a, d] = ["a", "d"].map((id) => document.querySelector<HTMLElement>(`[data-node='${id}']`)!);
    for (let at = 0; at <= 600; at += 5) {
      for (const animation of document.getAnimations()) animation.currentTime = at;
      const top = Math.max(a!.getBoundingClientRect().top, d!.getBoundingClientRect().top);
      const bottom = Math.min(a!.getBoundingClientRect().bottom, d!.getBoundingClientRect().bottom);
      if (bottom - top < 20) continue;
      const hit = document.elementFromPoint(20, (top + bottom) / 2)?.closest<HTMLElement>("[data-node]")?.dataset.node;
      return { hit, raised: getComputedStyle(d!).zIndex, lowered: getComputedStyle(a!).zIndex };
    }
    return null;
  });
  expect(crossing).toEqual({ hit: "d", raised: "2", lowered: "1" });

  // Once the moves finish, every row is back on its own z-index, at its own size, in the final layout.
  await page.evaluate(() => document.getAnimations().forEach((animation) => animation.finish()));
  expect(await place(page)).toEqual([
    { id: "d", top: 0, height: 88, zIndex: "1" },
    { id: "c", top: 88, height: 88, zIndex: "1" },
    { id: "b", top: 176, height: 88, zIndex: "1" },
    { id: "a", top: 264, height: 88, zIndex: "1" },
  ]);
  expect(page.errors).toEqual([]);
  await page.close();
}, 60_000);

test("B-05 M-15: without travel, flip() plays the plain move it played before", async () => {
  const page = await column();
  const moves = await reverse(page, 0, false);
  expect(moves.find((move) => move.id === "a")!.keyframes).toEqual([
    { transform: "translate(0px, -264px)", offset: 0 },
    { transform: "none", offset: 1 },
  ]);
  await page.close();
}, 60_000);

test("B-05 M-15: stopMoves() cancels every move under the root, raises no error, and leaves each row at its layout", async () => {
  const page = await column();
  await reverse(page, 150);
  const stopped = await page.evaluate(async () => {
    const motion = (window as unknown as { motion: Motion }).motion;
    const running = document.getAnimations();
    // A cancel settles the promise each animation had, and gives it a new one.
    const settled = Promise.allSettled(running.map((animation) => animation.finished));
    motion.stopMoves(document.querySelector("main")!);
    await settled;
    return { states: [...new Set(running.map((animation) => animation.playState))], left: document.getAnimations().length };
  });
  expect(stopped).toEqual({ states: ["idle"], left: 0 });
  expect((await place(page)).map(({ id, top }) => [id, top])).toEqual([
    ["d", 0],
    ["c", 88],
    ["b", 176],
    ["a", 264],
  ]);
  expect(page.errors).toEqual([]);
  await page.close();
}, 60_000);

test("B-05 M-15: a second flip during a traveling move starts each row where it's seen, at its own size and with no jump", async () => {
  const page = await column();
  // Every row is partway through its move, grown toward 1.01 about its centre.
  await reverse(page, 100);
  const result = await page.evaluate(() => {
    const motion = (window as unknown as { motion: Motion }).motion;
    const main = document.querySelector("main")!;
    const rows = [...main.querySelectorAll<HTMLElement>("[data-node]")];
    const drawn = () =>
      Object.fromEntries(
        rows.map((row) => {
          const box = row.getBoundingClientRect();
          return [row.dataset.node!, { x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width, height: box.height }];
        }),
      );
    const paused = drawn();
    // What Update does on a second press: it measures, stops the running moves, and flips from what it measured.
    const before = motion.captureRects(main);
    motion.stopMoves(main);
    const { animations } = motion.flip(before, main, { lift: true, travel: true });
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = 0;
    }
    return { paused, first: drawn(), measured: Object.fromEntries(rows.map((row) => [row.dataset.node!, before.get(`node:${row.dataset.node}`)!])) };
  });
  for (const id of ["a", "b", "c", "d"]) {
    const { paused, first, measured } = { paused: result.paused[id]!, first: result.first[id]!, measured: result.measured[id]! };
    // The paused row is drawn larger than its own 1280 by 88, and the measure leaves that growth out.
    expect(paused.width, id).toBeGreaterThan(1281);
    expect(measured.width, id).toBeCloseTo(1280, 1);
    expect(measured.height, id).toBeCloseTo(88, 1);
    // The second move's first frame is centred exactly where the paused row was, at scale 1.
    expect(Math.abs(first.x - paused.x), id).toBeLessThanOrEqual(0.5);
    expect(Math.abs(first.y - paused.y), id).toBeLessThanOrEqual(0.5);
    expect(first.width, id).toBeCloseTo(1280, 1);
    expect(first.height, id).toBeCloseTo(88, 1);
  }
  expect(page.errors).toEqual([]);
  await page.close();
}, 60_000);

test("B-05 M-15: with reduced motion, travel starts no animation either", async () => {
  const page = await column("reduce");
  expect(await reverse(page, 0)).toEqual([]);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.close();
}, 60_000);
