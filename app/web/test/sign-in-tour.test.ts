import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SPACE_CANVASES } from "@steelman/shared";
import type { SpaceCanvas } from "@steelman/shared";
import { FADE_MS, PAN_MS, PAN_PX, STEP_MS, TINT_TOUR, startTintTour } from "../src/signIn/tintTour.ts";

// The sign-in page's map tours the spaces' tints (M3d-25, L-01): stone first,
// then the next space's tint every 4.2 seconds, each fading in over 2.6
// seconds, and back to stone after the sixth. Under reduced motion it stays on
// stone. startTintTour() plays that on the page: a fade and then a hold on the
// incoming tint's layer, and a slow pan of the contours. These tests run in
// Node on a stand-in window, document, and elements, so the timer, the
// animations, and what they're asked to do are easy to see.

describe("the tour", () => {
  test("L-01: the tour starts on stone and visits each of the six spaces' tints once", () => {
    expect(TINT_TOUR[0]).toBe("stone");
    expect([...TINT_TOUR].sort()).toEqual([...SPACE_CANVASES].sort());
    expect(TINT_TOUR).toEqual(["stone", "slate", "sage", "lilac", "sand", "cool"]);
  });

  test("L-01: the tint changes every 4.2 seconds, over 2.6 seconds, and the map pans 16 px each way over 50 seconds", () => {
    expect(STEP_MS).toBe(4200);
    expect(FADE_MS).toBe(2600);
    expect(FADE_MS).toBeLessThan(STEP_MS);
    expect(PAN_MS).toBe(50_000);
    expect(PAN_PX).toEqual({ x: 16, y: 10 });
  });
});

type Listener = () => void;

interface FakeAnimation {
  keyframes: Keyframe[];
  currentTime: number;
  options: KeyframeAnimationOptions;
  playState: "running" | "paused" | "idle";
  cancel(): void;
  pause(): void;
  play(): void;
  finished: Promise<unknown>;
}

/** A stand-in element that records what plays on it. */
function fakeElement() {
  const animations: FakeAnimation[] = [];
  return {
    style: {} as Record<string, string>,
    dataset: {} as Record<string, string>,
    animations,
    /** The animations that haven't been cancelled. */
    live: () => animations.filter((animation) => animation.playState !== "idle"),
    animate(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const animation: FakeAnimation = {
        keyframes,
        options,
        currentTime: 0,
        playState: "running",
        cancel: () => void (animation.playState = "idle"),
        pause: () => void (animation.playState = "paused"),
        play: () => void (animation.playState = "running"),
        finished: new Promise(() => undefined),
      };
      animations.push(animation);
      return animation;
    },
  };
}
type FakeElement = ReturnType<typeof fakeElement>;

/** A stand-in window and document: timers come from Vitest's fake ones, and reduced motion and visibility can change. */
function fakePage(reduced = false) {
  const query = { matches: reduced, changes: [] as Listener[] };
  const visibility = { state: "visible" as DocumentVisibilityState, changes: [] as Listener[] };
  vi.stubGlobal("window", {
    setTimeout: (run: () => void, ms: number) => setTimeout(run, ms),
    clearTimeout: (id: number) => clearTimeout(id),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    matchMedia: () => ({
      get matches() {
        return query.matches;
      },
      addEventListener: (_: string, listener: Listener) => query.changes.push(listener),
      removeEventListener: (_: string, listener: Listener) => (query.changes = query.changes.filter((l) => l !== listener)),
    }),
  });
  vi.stubGlobal("document", {
    get visibilityState() {
      return visibility.state;
    },
    addEventListener: (type: string, listener: Listener) => type === "visibilitychange" && visibility.changes.push(listener),
    removeEventListener: (_: string, listener: Listener) => (visibility.changes = visibility.changes.filter((l) => l !== listener)),
  });
  return {
    query,
    visibility,
    setReduced(on: boolean) {
      query.matches = on;
      for (const listener of query.changes) listener();
    },
    setVisibility(state: DocumentVisibilityState) {
      visibility.state = state;
      for (const listener of visibility.changes) listener();
    },
  };
}

function fakeMap() {
  const map = fakeElement();
  const texture = fakeElement();
  const layers = new Map<SpaceCanvas, FakeElement>(TINT_TOUR.map((name) => [name, fakeElement()]));
  const start = () =>
    startTintTour({
      map: map as unknown as HTMLElement,
      texture: texture as unknown as HTMLElement,
      layers: layers as unknown as ReadonlyMap<SpaceCanvas, HTMLElement>,
    });
  const allLive = () => [texture, ...layers.values()].flatMap((element) => element.live());
  return { map, texture, layers, start, allLive };
}

describe("startTintTour", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("L-01: the map starts on stone and pans its contours 16 px by 10 px each way over 50 seconds, forever", () => {
    fakePage();
    const { map, texture, layers, start } = fakeMap();
    const stop = start();
    expect(map.dataset.tint).toBe("stone");
    // Nothing fades in at the start: the page's own colour is stone.
    for (const layer of layers.values()) expect(layer.animations).toEqual([]);
    expect(texture.animations).toHaveLength(1);
    const pan = texture.animations[0]!;
    expect(pan.options).toMatchObject({ duration: PAN_MS, iterations: Infinity, direction: "alternate", iterationStart: 0.5 });
    expect(pan.keyframes).toEqual([{ transform: "translate3d(-16px, -10px, 0)" }, { transform: "translate3d(16px, 10px, 0)" }]);
    stop();
  });

  test("L-01: every 4.2 seconds the next tint fades in over 2.6 seconds on top, and then holds", () => {
    fakePage();
    const { map, layers, start } = fakeMap();
    const stop = start();
    vi.advanceTimersByTime(4199);
    expect(map.dataset.tint).toBe("stone");
    vi.advanceTimersByTime(1);
    expect(map.dataset.tint).toBe("slate");
    const slate = layers.get("slate")!;
    const [fade, hold] = slate.animations;
    expect(fade!.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(fade!.options).toMatchObject({ duration: FADE_MS });
    expect(fade!.options.iterations ?? 1).toBe(1);
    // The hold keeps the tint once the fade ends. It never ends by itself, so a still screenshot shows the page at rest.
    expect(hold!.keyframes).toEqual([{ opacity: 1 }, { opacity: 1 }]);
    expect(hold!.options).toMatchObject({ delay: FADE_MS, iterations: Infinity });
    const slateOn = Number(slate.style.zIndex);

    vi.advanceTimersByTime(STEP_MS);
    expect(map.dataset.tint).toBe("sage");
    const sage = layers.get("sage")!;
    expect(Number(sage.style.zIndex)).toBeGreaterThan(slateOn);
    // Slate stays under sage until sage has faded in.
    expect(slate.live()).toHaveLength(2);

    vi.advanceTimersByTime(STEP_MS);
    expect(map.dataset.tint).toBe("lilac");
    // Two tints back is covered, so it's let go.
    expect(slate.live()).toEqual([]);
    expect(sage.live()).toHaveLength(2);

    // Sand, cool, and then stone again on top of cool.
    vi.advanceTimersByTime(3 * STEP_MS);
    expect(map.dataset.tint).toBe("stone");
    expect(layers.get("stone")!.live()).toHaveLength(2);
    expect(Number(layers.get("stone")!.style.zIndex)).toBeGreaterThan(Number(layers.get("cool")!.style.zIndex));
    vi.advanceTimersByTime(STEP_MS);
    expect(map.dataset.tint).toBe("slate");
    stop();
  });

  test("L-01: under reduced motion the map stays on stone, doesn't pan, and sets no timer", () => {
    fakePage(true);
    const { map, start, allLive } = fakeMap();
    const stop = start();
    expect(map.dataset.tint).toBe("stone");
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(map.dataset.tint).toBe("stone");
    expect(allLive()).toEqual([]);
    stop();
  });

  test("L-01: turning reduced motion on mid-tour puts the map back on stone and stops it, and turning it off starts again", () => {
    const page = fakePage();
    const { map, layers, start, allLive } = fakeMap();
    const stop = start();
    vi.advanceTimersByTime(2 * STEP_MS);
    expect(map.dataset.tint).toBe("sage");
    page.setReduced(true);
    expect(map.dataset.tint).toBe("stone");
    expect(allLive()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    for (const layer of layers.values()) expect(layer.style.zIndex ?? "").toBe("");
    vi.advanceTimersByTime(60_000);
    expect(map.dataset.tint).toBe("stone");

    page.setReduced(false);
    vi.advanceTimersByTime(STEP_MS);
    expect(map.dataset.tint).toBe("slate");
    stop();
  });

  test("L-01: while the tab is hidden the tour pauses, and it goes on when the tab is shown again", () => {
    const page = fakePage();
    const { map, texture, layers, start } = fakeMap();
    const stop = start();
    vi.advanceTimersByTime(STEP_MS);
    expect(map.dataset.tint).toBe("slate");

    page.setVisibility("hidden");
    expect(vi.getTimerCount()).toBe(0);
    expect(texture.live().map((animation) => animation.playState)).toEqual(["paused"]);
    expect(layers.get("slate")!.live().map((animation) => animation.playState)).toEqual(["paused", "paused"]);
    vi.advanceTimersByTime(60_000);
    expect(map.dataset.tint).toBe("slate");

    page.setVisibility("visible");
    expect(texture.live().map((animation) => animation.playState)).toEqual(["running"]);
    expect(layers.get("slate")!.live().map((animation) => animation.playState)).toEqual(["running", "running"]);
    // The tint it was showing holds for a full step after the tab comes back.
    vi.advanceTimersByTime(STEP_MS - 1);
    expect(map.dataset.tint).toBe("slate");
    vi.advanceTimersByTime(1);
    expect(map.dataset.tint).toBe("sage");
    stop();
  });

  test("L-01: a page opened in a hidden tab waits on stone until the tab is shown", () => {
    const page = fakePage();
    page.visibility.state = "hidden";
    const { map, texture, start } = fakeMap();
    const stop = start();
    expect(map.dataset.tint).toBe("stone");
    expect(texture.animations).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    page.setVisibility("visible");
    expect(texture.live()).toHaveLength(1);
    vi.advanceTimersByTime(STEP_MS);
    expect(map.dataset.tint).toBe("slate");
    stop();
  });

  test("L-01: stopping the tour cancels every animation, clears its timer, and stops listening", () => {
    const page = fakePage();
    const { start, allLive } = fakeMap();
    const stop = start();
    vi.advanceTimersByTime(2 * STEP_MS);
    stop();
    expect(allLive()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(page.query.changes).toEqual([]);
    expect(page.visibility.changes).toEqual([]);
  });

  test("L-01: a map that replaces another in the same render, as Choose a username replaces the code step, takes up its place in the tour", () => {
    fakePage();
    const before = fakeMap();
    const stopBefore = before.start();
    vi.advanceTimersByTime(2 * STEP_MS + 1000);
    expect(before.map.dataset.tint).toBe("sage");
    // Sage is halfway through its fade, and the contours are 20 seconds into their pan.
    for (const animation of before.layers.get("sage")!.live()) animation.currentTime = 1300;
    before.texture.live()[0]!.currentTime = 20_000;
    stopBefore();

    const after = fakeMap();
    const stopAfter = after.start();
    expect(after.map.dataset.tint).toBe("sage");
    // Sage goes on from halfway through its fade, over slate, which is fully shown underneath.
    const sage = after.layers.get("sage")!.live();
    expect(sage.map((animation) => animation.currentTime)).toEqual([1300, 1300]);
    const slate = after.layers.get("slate")!.live();
    expect(slate.map((animation) => animation.currentTime)).toEqual([FADE_MS, FADE_MS]);
    expect(Number(after.layers.get("sage")!.style.zIndex)).toBeGreaterThan(Number(after.layers.get("slate")!.style.zIndex));
    expect(after.texture.live().map((animation) => animation.currentTime)).toEqual([20_000]);
    // Sage then holds for a full step, as it does when a hidden tab is shown again.
    vi.advanceTimersByTime(STEP_MS - 1);
    expect(after.map.dataset.tint).toBe("sage");
    vi.advanceTimersByTime(1);
    expect(after.map.dataset.tint).toBe("lilac");
    stopAfter();
  });

  test("L-01: a map that starts later, after the render that stopped the last one, starts on stone", async () => {
    fakePage();
    const before = fakeMap();
    const stopBefore = before.start();
    vi.advanceTimersByTime(2 * STEP_MS);
    stopBefore();
    await Promise.resolve();

    const after = fakeMap();
    const stopAfter = after.start();
    expect(after.map.dataset.tint).toBe("stone");
    for (const layer of after.layers.values()) expect(layer.animations).toEqual([]);
    vi.advanceTimersByTime(STEP_MS);
    expect(after.map.dataset.tint).toBe("slate");
    stopAfter();
  });

  test("L-01: a map stopped under reduced motion hands nothing over, so the next one stays on stone", () => {
    const page = fakePage();
    const before = fakeMap();
    const stopBefore = before.start();
    vi.advanceTimersByTime(2 * STEP_MS);
    page.setReduced(true);
    stopBefore();
    page.setReduced(false);

    const after = fakeMap();
    const stopAfter = after.start();
    expect(after.map.dataset.tint).toBe("stone");
    vi.advanceTimersByTime(STEP_MS);
    expect(after.map.dataset.tint).toBe("slate");
    stopAfter();
  });
});
