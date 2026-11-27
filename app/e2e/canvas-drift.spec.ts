// The canvas drifts as you scroll (M3d-22, M-15, A-01). On a board, the canvas
// (the tint, the contours, and the grain) is drawn on a layer of its own
// behind the board, and its light is drawn still above that layer. Once the
// board's top has scrolled past the window's top, the layer moves down by a
// tenth of the scroll, up to 170 px, so the cards seem to float above the map. The strip it uncovers at the
// board's top is then always above the window, so no edge of the canvas is
// ever on screen. The layer sits in a frame that clips it to the board, so it
// never changes the page's scroll height, and it takes no clicks. Under
// reduced motion it stays still. Going back to the list from a scrolled board
// brings the copy's canvas back to its place as the copy shrinks. The page
// clock is installed, so each scroll runs the clock past one animation frame
// before the layer is read.

import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";

const FRAME = "#steelman-study .sm-surface > .sm-canvas-frame";
const LAYER = `${FRAME} > .sm-canvas-layer`;
const LIGHT = `${FRAME} > .sm-canvas-light`;

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.clock.runFor(40);
}

/** Jordan adds sixteen arguments to Yes, so the board is long enough to scroll well past 600 px at either width. */
async function lengthen(board: TestBoard): Promise<void> {
  for (let n = 1; n <= 16; n++) {
    await board.api("jordan_w").post("arguments", { id: board.ids.itemId(), optionId: board.demo.options.yes, versionId: board.ids.itemId(), wording: `Extra reason number ${n} for opening.`, context: "" });
  }
}

/** Scrolls the window to y, waits for the browser's scroll event, and runs the clock past the next animation frame. */
async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate(
    (to) =>
      new Promise<void>((done) => {
        const target = Math.min(to, document.documentElement.scrollHeight - window.innerHeight);
        if (Math.abs(window.scrollY - target) < 1) return done();
        window.addEventListener("scroll", () => done(), { once: true });
        window.scrollTo(0, to);
      }),
    y,
  );
  await page.clock.runFor(40);
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Where the board's top is at the top of the page, under the site's header. */
async function boardTop(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelector(".sm-surface")!.getBoundingClientRect().top + window.scrollY);
}

interface Seen {
  scrollY: number;
  scrollHeight: number;
  innerHeight: number;
  innerWidth: number;
  surface: Box;
  frame: Box;
  layer: Box;
  /** The still light above the layer. */
  light: Box;
  lightTransform: string;
  /** The layer's top in page coordinates, so its drift can be read whatever the scroll. */
  layerPageTop: number;
  /** The first card's top in the window. */
  cardTop: number;
  transform: string;
}

async function seen(page: Page): Promise<Seen> {
  return page.evaluate(
    ({ frame, layer, light }) => {
      const box = (element: Element): Box => {
        const { top, bottom, left, right } = element.getBoundingClientRect();
        return { top, bottom, left, right };
      };
      const layerElement = document.querySelector(layer)!;
      const card = [...document.querySelectorAll(".sm-card[data-card]")].find((c) => c.getBoundingClientRect().height > 0)!;
      return {
        scrollY: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
        surface: box(document.querySelector(".sm-surface")!),
        frame: box(document.querySelector(frame)!),
        layer: box(layerElement),
        light: box(document.querySelector(light)!),
        lightTransform: getComputedStyle(document.querySelector(light)!).transform,
        layerPageTop: layerElement.getBoundingClientRect().top + window.scrollY,
        cardTop: card.getBoundingClientRect().top,
        transform: getComputedStyle(layerElement).transform,
      };
    },
    { frame: FRAME, layer: LAYER, light: LIGHT },
  );
}

/** How far apart two screenshots of the same size are: the most any colour channel differs, and in how many pixels. */
async function levelsApart(page: Page, a: Buffer, b: Buffer): Promise<{ most: number; pixels: number }> {
  return page.evaluate(
    async ({ a, b }) => {
      // Decoded in the page itself: its content policy lets nothing be fetched from a data URL.
      const read = async (png: string) => {
        const image = await createImageBitmap(new Blob([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], { type: "image/png" }));
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height);
      };
      const [one, two] = [await read(a), await read(b)];
      if (one.width !== two.width || one.height !== two.height) return { most: 255, pixels: one.width * one.height };
      let most = 0;
      let pixels = 0;
      for (let i = 0; i < one.data.length; i += 4) {
        const differs = Math.max(...[0, 1, 2, 3].map((c) => Math.abs(one.data[i + c]! - two.data[i + c]!)));
        if (differs) pixels++;
        most = Math.max(most, differs);
      }
      return { most, pixels };
    },
    { a: a.toString("base64"), b: b.toString("base64") },
  );
}

/** For each card in the window, what a click at its centre lands on, as an index of cards (or -1 when it misses every card). */
async function clickTargets(page: Page): Promise<{ point: [number, number]; card: number }[]> {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>(".sm-card[data-card]")];
    const out: { point: [number, number]; card: number }[] = [];
    for (const card of cards) {
      const { left, top, width, height } = card.getBoundingClientRect();
      const x = left + width / 2;
      const y = top + height / 2;
      if (!width || !height || y < 0 || y > window.innerHeight || x < 0 || x > window.innerWidth) continue;
      const hit = document.elementFromPoint(x, y);
      out.push({ point: [x, y], card: cards.findIndex((c) => c.contains(hit)) });
    }
    return out;
  });
}

for (const width of [1280, 375]) {
  test(`M-15, A-01: at ${width} px, scrolling a long board by 600 px moves the canvas layer down 60 px while the cards move up 600 px`, async ({ board }) => {
    await lengthen(board);
    const page = await board.open("jordan_w", { width });
    await settled(page);
    expect((await seen(page)).transform).toBe("none");
    // The board's top passes the window's top 100 px, and then the page scrolls 600 px more.
    const top = await boardTop(page);
    await scrollTo(page, top + 100);
    const before = await seen(page);
    expect(before.transform).toBe("matrix(1, 0, 0, 1, 0, 10)");

    await scrollTo(page, top + 700);
    const after = await seen(page);
    expect(after.scrollY - before.scrollY).toBe(600);
    expect(after.layerPageTop - before.layerPageTop).toBeCloseTo(60, 1);
    expect(before.cardTop - after.cardTop).toBeCloseTo(600, 1);
    // One transform, a translation down, and nothing else.
    expect(after.transform).toBe("matrix(1, 0, 0, 1, 0, 70)");
    expect(board.errors).toEqual([]);
  });

  test(`M-15, A-01: at ${width} px, under reduced motion the canvas doesn't move as the board scrolls, and a drifted canvas goes back when it's turned on`, async ({ board }) => {
    await lengthen(board);
    const page = await board.open("jordan_w", { width });
    await settled(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const before = await seen(page);
    const top = await boardTop(page);
    await scrollTo(page, top + 600);
    const still = await seen(page);
    expect(still.scrollY).toBe(top + 600);
    expect(still.transform).toBe("none");
    expect(still.layerPageTop).toBeCloseTo(before.layerPageTop, 1);

    // With motion allowed again it drifts, and turning reduced motion on puts it back without another scroll.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await scrollTo(page, top + 700);
    expect((await seen(page)).transform).toBe("matrix(1, 0, 0, 1, 0, 70)");
    // The browser tells the page about the change at its next frame, so the test waits for that before it runs the clock.
    await page.evaluate(() => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      (window as unknown as { reduced: Promise<void> }).reduced = new Promise((done) => query.addEventListener("change", () => done(), { once: true }));
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => (window as unknown as { reduced: Promise<void> }).reduced);
    await page.clock.runFor(40);
    expect((await seen(page)).transform).toBe("none");
  });

  test(`M-15, A-01: at ${width} px, the canvas layer leaves the board's scroll height and the cards' click targets as they were`, async ({ board }) => {
    await lengthen(board);
    const page = await board.open("jordan_w", { width });
    await settled(page);
    // Neither the frame nor the layer takes a click.
    const pointer = await page.evaluate(
      ({ frame, layer }) => [frame, layer].map((s) => getComputedStyle(document.querySelector(s)!).pointerEvents),
      { frame: FRAME, layer: LAYER },
    );
    expect(pointer).toEqual(["none", "none"]);

    const bottom = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(bottom).toBeGreaterThan(1700);
    for (const y of [0, 700, bottom]) {
      await scrollTo(page, y);
      const withLayer = { height: (await seen(page)).scrollHeight, targets: await clickTargets(page) };
      expect(withLayer.targets.length, `cards in view at ${y}`).toBeGreaterThan(0);
      expect(withLayer.targets.every((t) => t.card >= 0), `every card in view at ${y} takes its own click`).toBe(true);
      // The same page without the canvas layer, as the board was before it drifted.
      const hide = await page.addStyleTag({ content: `${FRAME} { display:none !important; }` });
      const without = {
        height: await page.evaluate(() => document.documentElement.scrollHeight),
        targets: await clickTargets(page),
        scrollY: await page.evaluate(() => window.scrollY),
      };
      await hide.evaluate((style) => (style as Element).remove());
      expect(without.scrollY).toBe(Math.min(y, bottom));
      expect(withLayer.height, `the scroll height at ${y}`).toBe(without.height);
      expect(withLayer.targets, `the click targets at ${y}`).toEqual(without.targets);
    }
  });

  test(`M-15, A-01: at ${width} px, the drift never shows an edge of the canvas`, async ({ board }) => {
    await lengthen(board);
    const page = await board.open("jordan_w", { width });
    await settled(page);
    const bottom = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    const top = await boardTop(page);
    let drifted = 0;
    for (const y of [0, 10, 30, top, top + 1, top + 63, top + 120, top + 600, top + 1700, bottom]) {
      await scrollTo(page, y);
      const at = await seen(page);
      drifted = Math.max(drifted, at.layerPageTop - top);
      // The frame is the board's own box, and the light holds still over all of it.
      for (const side of ["top", "bottom", "left", "right"] as const) {
        expect(at.frame[side], `the frame's ${side} at ${y}`).toBeCloseTo(at.surface[side], 1);
        expect(at.light[side], `the light's ${side} at ${y}`).toBeCloseTo(at.surface[side], 1);
      }
      expect(at.lightTransform, `the light's transform at ${y}`).toBe("none");
      // Every part of the board that's in the window has the layer behind it.
      const shown = { top: Math.max(at.frame.top, 0), bottom: Math.min(at.frame.bottom, at.innerHeight), left: Math.max(at.frame.left, 0), right: Math.min(at.frame.right, at.innerWidth) };
      expect(at.layer.top, `the layer's top at ${y}`).toBeLessThanOrEqual(shown.top + 0.5);
      expect(at.layer.bottom, `the layer's bottom at ${y}`).toBeGreaterThanOrEqual(shown.bottom - 0.5);
      expect(at.layer.left, `the layer's left at ${y}`).toBeLessThanOrEqual(shown.left + 0.5);
      expect(at.layer.right, `the layer's right at ${y}`).toBeGreaterThanOrEqual(shown.right - 0.5);
    }
    // The canvas did drift on the way, as far as 170 px and no further.
    expect(drifted).toBe(170);
    // The layer paints the board's own tint and textures, opaque, so nothing else shows through it, and the light over
    // it is the board's own light: together they're the surface's canvas, the light first.
    const paint = await page.evaluate(
      ({ layer, light }) => {
        const of = (element: Element) => {
          const style = getComputedStyle(element);
          return { color: style.backgroundColor, image: style.backgroundImage, size: style.backgroundSize };
        };
        return { surface: of(document.querySelector(".sm-surface")!), layer: of(document.querySelector(layer)!), light: of(document.querySelector(light)!) };
      },
      { layer: LAYER, light: LIGHT },
    );
    expect(paint.layer.color).toBe(paint.surface.color);
    expect(paint.layer.color).toMatch(/^rgb\(/);
    expect(paint.light.color).toBe("rgba(0, 0, 0, 0)");
    expect(paint.light.image).toMatch(/^radial-gradient\(/);
    expect(`${paint.light.image}, ${paint.layer.image}`).toBe(paint.surface.image);
    expect(`${paint.light.size}, ${paint.layer.size}`).toBe(paint.surface.size);
  });

  test(`M-15, A-01: at ${width} px, at the top of the page the canvas layer and its light draw what the board drew before it drifted, to within one level in 255`, async ({ board }) => {
    const page = await board.open("jordan_w", { width });
    await settled(page);
    await expect(page.locator(LAYER)).toHaveCount(1);
    // Only the canvas: the board's contents are hidden, and the frame is shown or not.
    const contents = await page.addStyleTag({ content: "#steelman-study .sm-surface > :not(.sm-canvas-frame) { visibility:hidden !important; }" });
    await settled(page);
    const box = (await page.locator(".sm-surface").boundingBox())!;
    const clip = { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 900 - box.y) };
    const withLayer = await page.screenshot({ clip, animations: "disabled" });
    const hide = await page.addStyleTag({ content: `${FRAME} { display:none !important; }` });
    const without = await page.screenshot({ clip, animations: "disabled" });
    await hide.evaluate((style) => (style as Element).remove());
    await contents.evaluate((style) => (style as Element).remove());
    // Drawing the light on its own element over the layer, rather than as the first of the surface's layers, rounds its
    // blend differently on a wide board, by at most one level in 255 (about 0.4%), which no one can see.
    const apart = await levelsApart(page, withLayer, without);
    expect(apart.most, `the most any channel differs, in ${apart.pixels} pixels`).toBeLessThanOrEqual(1);
  });
}

for (const width of [1280, 375]) {
  test(`M-15, A-01, E-07: at ${width} px, going back to the list from a scrolled board brings the copy's canvas back to its place as the copy shrinks`, async ({ board }) => {
    await lengthen(board);
    const page = await board.open("jordan_w", { width });
    await page.goto("/");
    await expect(page.getByRole("list", { name: "Your steelmen" })).toBeVisible();
    await settled(page);
    await page.locator(`.sm-post h2 a[href="/b/${board.demo.board}"]`).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await settled(page);
    const top = await boardTop(page);
    await scrollTo(page, top + 1700);
    expect((await seen(page)).transform).toBe("matrix(1, 0, 0, 1, 0, 170)");

    // Back to the list: as soon as the copy starts to shrink, its canvas eases back on the shrink's duration and curve.
    const closing = await page.evaluate(async () => {
      window.history.back();
      const shrinking = () => {
        const copy = document.querySelector(".sm-closing-layer > *");
        return copy && copy.getAnimations().some((animation) => !(animation instanceof CSSTransition) && !(animation instanceof CSSAnimation)) ? copy : null;
      };
      let copy: Element | null = null;
      for (let n = 0; n < 5_000 && !copy; n++) {
        await new Promise((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = resolve;
          channel.port2.postMessage(null);
        });
        copy = shrinking();
      }
      if (!copy) return null;
      const layer = copy.querySelector<HTMLElement>(".sm-canvas-layer")!;
      const shrink = copy.getAnimations().find((animation) => !(animation instanceof CSSTransition))!;
      const back = layer.getAnimations().filter((animation): animation is CSSTransition => animation instanceof CSSTransition && animation.transitionProperty === "transform");
      const result = {
        inline: layer.style.transform,
        transitions: back.length,
        shrink: { duration: Number(shrink.effect!.getComputedTiming().duration), easing: shrink.effect!.getTiming().easing },
        back: back[0] ? { duration: Number(back[0].effect!.getComputedTiming().duration), easing: getComputedStyle(layer).transitionTimingFunction } : null,
        end: "",
      };
      for (const animation of back) animation.finish();
      result.end = getComputedStyle(layer).transform;
      return result;
    });
    expect(closing, "the copy shrinks into the post").not.toBeNull();
    expect(closing!.inline).toBe("");
    expect(closing!.transitions).toBe(1);
    expect(closing!.back).toEqual(closing!.shrink);
    expect(closing!.end).toBe("none");
    await settled(page);
    await expect(page.locator(".sm-closing-layer > *")).toHaveCount(0);
    expect(board.errors).toEqual([]);
  });
}
