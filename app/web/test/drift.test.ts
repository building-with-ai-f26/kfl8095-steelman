/// <reference types="node" />
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { driftOf, startDrift } from "../src/board/motion.ts";

// The canvas drifts as you scroll (M3d-22, M-15). driftOf() says how far the
// board's canvas moves down once the board's top has scrolled past the
// window's top: nothing at the top, a tenth of the scroll after that, never
// more than 170 px, and nothing under reduced motion. startDrift() is the one
// passive scroll listener that writes that drift as a single transform on the
// canvas layer once per animation frame. These tests run in Node on a
// stand-in window and board, so the listener, the frame, and the transform it
// writes are easy to count. The stand-in board starts under a 56 px header,
// as the real one does. The light stays still above the drifting layer, so
// the layer paints each canvas's list without the light, --sm-canvas-texture,
// and the last test checks that every canvas keeps the two lists in step.

describe("driftOf", () => {
  test("M-15: the drift is 0 at the top, and when the page is pulled past its top", () => {
    expect(driftOf(0, false)).toBe(0);
    expect(driftOf(-40, false)).toBe(0);
  });

  test("M-15: after the top, the drift is a tenth of the scroll", () => {
    expect(driftOf(600, false)).toBe(60);
    expect(driftOf(37, false)).toBeCloseTo(3.7, 10);
    expect(driftOf(1500, false)).toBe(150);
  });

  test("M-15: the drift never passes 170 px, however far the page scrolls", () => {
    expect(driftOf(1700, false)).toBe(170);
    expect(driftOf(1701, false)).toBe(170);
    expect(driftOf(40_000, false)).toBe(170);
  });

  test("M-15: under reduced motion the drift is 0 at every scroll", () => {
    for (const scrolled of [0, 37, 600, 1700, 40_000]) expect(driftOf(scrolled, true)).toBe(0);
  });
});

type Listener = () => void;

/** A stand-in window that records its listeners and runs animation frames only when told to. */
function fakeWindow(scrollY = 0, reduced = false) {
  const listeners: { type: string; listener: Listener; options: unknown }[] = [];
  const query = { matches: reduced, changes: [] as Listener[] };
  const frames = new Map<number, Listener>();
  let next = 1;
  const win = {
    scrollY,
    listeners,
    query,
    frames,
    matchMedia: () => ({
      get matches() {
        return query.matches;
      },
      addEventListener: (_: string, listener: Listener) => query.changes.push(listener),
      removeEventListener: (_: string, listener: Listener) => (query.changes = query.changes.filter((l) => l !== listener)),
    }),
    addEventListener: (type: string, listener: Listener, options: unknown) => listeners.push({ type, listener, options }),
    removeEventListener: (type: string, listener: Listener) => {
      const at = listeners.findIndex((l) => l.type === type && l.listener === listener);
      if (at >= 0) listeners.splice(at, 1);
    },
    requestAnimationFrame: (listener: Listener) => {
      frames.set(next, listener);
      return next++;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    /** Scrolls to y and sends the scroll event as many times as a browser might in one frame. */
    scrollTo(y: number, events = 3) {
      win.scrollY = y;
      for (let i = 0; i < events; i++) for (const l of listeners.filter((l) => l.type === "scroll")) l.listener();
    },
    /** Runs the animation frames waiting now. */
    frame() {
      const waiting = [...frames.values()];
      frames.clear();
      for (const listener of waiting) listener();
    },
  };
  return win;
}

/** The site's header, above the board. */
const HEADER = 56;

/** A stand-in board whose top is under the header, less the window's scroll, plus the move of any animation on it. */
function fakeBoard(win: { scrollY: number }, moving: { animations: FakeAnimation[]; by: number } = { animations: [], by: 0 }) {
  return {
    getBoundingClientRect: () => ({ top: HEADER - win.scrollY + (moving.animations.length ? moving.by : 0) }),
    getAnimations: () => moving.animations,
  } as unknown as Element;
}

interface FakeAnimation {
  effect: { getComputedTiming: () => { endTime: number } };
  finished: Promise<unknown>;
}

/** A stand-in Web Animation on the board that ends when told to. */
function fakeAnimation(endTime = 350): FakeAnimation & { end: () => void } {
  let end = () => {};
  const finished = new Promise((done) => (end = () => done(undefined)));
  return { effect: { getComputedTiming: () => ({ endTime }) }, finished, end: () => end() };
}

/** A canvas layer whose transform counts how often it's written. */
function fakeLayer() {
  const writes: string[] = [];
  let transform = "";
  return {
    writes,
    style: {
      get transform() {
        return transform;
      },
      set transform(value: string) {
        transform = value;
        writes.push(value);
      },
    },
  };
}

describe("startDrift", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("M-15: one passive scroll listener writes a single transform per animation frame", () => {
    const win = fakeWindow();
    vi.stubGlobal("window", win);
    const layer = fakeLayer();
    const stop = startDrift(layer as unknown as HTMLElement, fakeBoard(win));
    const scrolls = win.listeners.filter((l) => l.type === "scroll");
    expect(scrolls).toHaveLength(1);
    expect(scrolls[0]!.options).toEqual({ passive: true });
    // At the top there's nothing to move, so nothing is written.
    expect(layer.writes).toEqual([]);

    // The board's top has passed the window's top by 600 px. Three scroll events in one frame ask for one frame, and
    // nothing is written before it.
    win.scrollTo(HEADER + 600);
    expect(win.frames.size).toBe(1);
    expect(layer.writes).toEqual([]);
    win.frame();
    expect(layer.writes).toEqual(["translate3d(0, 60px, 0)"]);

    // A frame that finds the same drift writes nothing again.
    win.scrollTo(HEADER + 600, 1);
    win.frame();
    expect(layer.writes).toHaveLength(1);

    win.scrollTo(5000);
    win.frame();
    expect(layer.style.transform).toBe("translate3d(0, 170px, 0)");

    // Back at the top, the layer has no transform at all.
    win.scrollTo(0);
    win.frame();
    expect(layer.style.transform).toBe("");
    stop();
  });

  test("M-15: while the board's top is still in the window, the canvas doesn't move", () => {
    const win = fakeWindow();
    vi.stubGlobal("window", win);
    const layer = fakeLayer();
    const stop = startDrift(layer as unknown as HTMLElement, fakeBoard(win));
    for (const y of [10, 30, HEADER]) {
      win.scrollTo(y);
      win.frame();
    }
    expect(layer.writes).toEqual([]);
    win.scrollTo(HEADER + 10);
    win.frame();
    expect(layer.style.transform).toBe("translate3d(0, 1px, 0)");
    stop();
  });

  test("M-15: the canvas moves in whole device pixels", () => {
    const win = Object.assign(fakeWindow(), { devicePixelRatio: 2 });
    vi.stubGlobal("window", win);
    const layer = fakeLayer();
    const stop = startDrift(layer as unknown as HTMLElement, fakeBoard(win));
    // 37 px past the top is a drift of 3.7 px, which is 7.4 device pixels at a ratio of 2, so the canvas moves 7.
    win.scrollTo(HEADER + 37);
    win.frame();
    expect(layer.style.transform).toBe("translate3d(0, 3.5px, 0)");
    // At a ratio of 1 the same scroll moves it 4 px.
    win.devicePixelRatio = 1;
    win.scrollTo(HEADER + 37);
    win.frame();
    expect(layer.style.transform).toBe("translate3d(0, 4px, 0)");
    stop();
  });

  test("M-15: while the board grows out of its miniature, the drift waits, and it's measured again when the grow ends", async () => {
    const win = fakeWindow();
    vi.stubGlobal("window", win);
    const layer = fakeLayer();
    // The board is still drawn 200 px lower than its place, partway through its grow.
    const grow = fakeAnimation();
    const moving = { animations: [grow] as FakeAnimation[], by: 200 };
    const stop = startDrift(layer as unknown as HTMLElement, fakeBoard(win, moving));
    win.scrollTo(HEADER + 600);
    win.frame();
    // Measured with the move, the drift would be 40 px, so nothing is written while the board moves.
    expect(layer.writes).toEqual([]);
    expect(win.frames.size).toBe(0);
    // The grow ends with no further scroll, and the next frame places the canvas from the board's own top.
    moving.animations = [];
    grow.end();
    await Promise.resolve();
    await Promise.resolve();
    expect(win.frames.size).toBe(1);
    win.frame();
    expect(layer.writes).toEqual(["translate3d(0, 60px, 0)"]);
    stop();
  });

  test("M-15: an endless animation on the board doesn't hold the drift", () => {
    const win = fakeWindow();
    vi.stubGlobal("window", win);
    const layer = fakeLayer();
    const stop = startDrift(layer as unknown as HTMLElement, fakeBoard(win, { animations: [fakeAnimation(Infinity)], by: 0 }));
    win.scrollTo(HEADER + 600);
    win.frame();
    expect(layer.style.transform).toBe("translate3d(0, 60px, 0)");
    stop();
  });

  test("M-15: a board opened partway down the page starts with its drift", () => {
    const win = fakeWindow(HEADER + 300);
    vi.stubGlobal("window", win);
    const layer = fakeLayer();
    const stop = startDrift(layer as unknown as HTMLElement, fakeBoard(win));
    expect(layer.style.transform).toBe("translate3d(0, 30px, 0)");
    stop();
  });

  test("M-15: under reduced motion the canvas stays still, and turning it on puts a drifted canvas back", () => {
    const win = fakeWindow(0, true);
    vi.stubGlobal("window", win);
    const layer = fakeLayer();
    const stop = startDrift(layer as unknown as HTMLElement, fakeBoard(win));
    win.scrollTo(HEADER + 900);
    win.frame();
    expect(layer.writes).toEqual([]);

    // The reader turns reduced motion off, and then on again without scrolling.
    win.query.matches = false;
    for (const change of win.query.changes) change();
    win.frame();
    expect(layer.style.transform).toBe("translate3d(0, 90px, 0)");
    win.query.matches = true;
    for (const change of win.query.changes) change();
    win.frame();
    expect(layer.style.transform).toBe("");
    stop();
  });

  test("M-15: when the board closes, its listeners go and a waiting frame is dropped", () => {
    const win = fakeWindow();
    vi.stubGlobal("window", win);
    const layer = fakeLayer();
    const stop = startDrift(layer as unknown as HTMLElement, fakeBoard(win));
    win.scrollTo(600);
    expect(win.frames.size).toBe(1);
    stop();
    expect(win.listeners).toEqual([]);
    expect(win.query.changes).toEqual([]);
    expect(win.frames.size).toBe(0);
    win.scrollTo(800);
    win.frame();
    expect(layer.writes).toEqual([]);
  });
});

describe("the drifting layer's textures", () => {
  /** Splits a CSS list on its top-level commas. */
  const layers = (value: string) => {
    const out: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === "(") depth++;
      else if (value[i] === ")") depth--;
      else if (value[i] === "," && depth === 0) {
        out.push(value.slice(start, i).trim());
        start = i + 1;
      }
    }
    out.push(value.slice(start).trim());
    return out;
  };
  const property = (css: string, name: string) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();

  test("M-15: every canvas's texture list is its whole list without the light, so the layer and the light draw what the surface draws", async () => {
    const tokens = await readFile(join(import.meta.dirname, "../../../docs/design/tokens.css"), "utf8");
    const styles = await readFile(join(import.meta.dirname, "../../../docs/prototype/source/steelman-refined.html"), "utf8");
    const blocks = [["tokens.css", tokens], ...[...styles.matchAll(/\[data-canvas="(\w+)"\]\s*\{([^}]*)\}/g)].map(([, name, body]) => [name!, body!])];
    let checked = 0;
    for (const [name, css] of blocks) {
      const image = property(css!, "--sm-canvas-image");
      if (image === undefined) {
        expect(property(css!, "--sm-canvas-texture"), `${name} keeps the texture from tokens.css`).toBeUndefined();
        continue;
      }
      checked++;
      expect(layers(property(css!, "--sm-canvas-texture")!), `${name}'s texture`).toEqual(layers(image).slice(1));
      expect(layers(property(css!, "--sm-canvas-texture-size")!), `${name}'s texture sizes`).toEqual(layers(property(css!, "--sm-canvas-size")!).slice(1));
    }
    // tokens.css, cool, sand, sage, and lilac.
    expect(checked).toBe(5);
  });
});
