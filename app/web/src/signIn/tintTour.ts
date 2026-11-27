// The sign-in page's map tours the spaces' tints (M3d-25, L-01, M-05). The
// page sits on M3d-21's contour map, starting on stone. Every 4.2 seconds the
// next space's tint fades in over it for 2.6 seconds, in the order of the
// mock-up the builder chose (docs/design/explorations/color-and-axes.html),
// and after the sixth tint the tour starts again on stone. Meanwhile the
// contours pan slowly, 16 px sideways and 10 px up and down each way over 50
// seconds. A new person therefore sees what spaces look like before they sign
// in. Under reduced motion the map stays on stone and doesn't pan. While the
// tab is hidden the tour pauses.
//
// The steps are timers, so a test's clock moves them. The fade, the hold, and
// the pan are Web Animations started by play() and move only opacity and
// transform. Each tint has its own layer under the contours, and a tint stays
// shown through an animation that never ends by itself (the hold), so the page
// at rest, with no animation, is always the still stone map. A saved
// screenshot, which cancels animations that never end, therefore always shows
// stone. The only writes to the page are one data-tint and one z-index for each
// step, so a session replay records almost nothing.
//
// Signing in as a new account swaps the code step for Choose a username, a new
// map. The old map hands its place in the tour to the new one, which takes it
// up in the same render: the same tint, as far into its fade, and the
// contours where they were. The tint then holds for a full step, as it does
// when a hidden tab is shown again. The page therefore never jumps back to
// stone between the two screens.

import type { SpaceCanvas } from "@steelman/shared";
import { play } from "../board/motion.ts";

/** The order the map shows the spaces' tints in, starting on stone. */
export const TINT_TOUR: readonly SpaceCanvas[] = ["stone", "slate", "sage", "lilac", "sand", "cool"];
/** How long each tint is shown before the next one starts to fade in. */
export const STEP_MS = 4200;
/** How long the next tint takes to fade in. */
export const FADE_MS = 2600;
/** How long the contours take to pan from one side to the other. */
export const PAN_MS = 50_000;
/** How far the contours pan each way from the middle. */
export const PAN_PX = { x: 16, y: 10 } as const;

const REDUCED = "(prefers-reduced-motion: reduce)";

/** Where a map that has just stopped was in the tour, for the map that replaces it. */
interface Place {
  step: number;
  /** How far the tint showing is into its fade and hold, or null when no tint has faded in yet. */
  shown: number | null;
  /** How far the contours are into their pan. */
  panned: number;
}

/**
 * The place a stopped map left, kept until the end of the current task only. A map that mounts in the same render, as
 * Choose a username does when it replaces the code step, takes it up; any later map starts on stone.
 */
let handed: Place | null = null;

export interface TintMap {
  /** The map itself, which says the tint it's showing in data-tint. */
  map: HTMLElement;
  /** The layer of contours and grain that pans. */
  texture: HTMLElement;
  /** A layer of each tint, under the contours, hidden at rest. */
  layers: ReadonlyMap<SpaceCanvas, HTMLElement>;
}

/**
 * Starts the tour on a sign-in page's map, and returns what stops it. Under reduced motion it plays nothing and sets
 * no timer, and turning reduced motion on mid-tour puts the map back on stone at once. While the tab is hidden, the
 * animations pause and the timer stops; when the tab is shown again, they go on, and the tint it was showing holds
 * for a full step.
 */
export function startTintTour({ map, texture, layers }: TintMap): () => void {
  const reduced = window.matchMedia(REDUCED);
  let timer: number | undefined;
  let step = 0;
  let raised = 0;
  let pan: Animation | null = null;
  // The tint before the one showing, which stays under it while it fades in, and the one showing.
  let under: Animation[] = [];
  let showing: Animation[] = [];
  const all = () => [...under, ...showing, ...(pan ? [pan] : [])];
  // The place the map before this one handed over, if it stopped in this same render.
  let from = handed;
  handed = null;

  const schedule = () => {
    timer = window.setTimeout(advance, STEP_MS);
  };
  /** Raises a tint's layer above the others and fades it in, then holds it, starting `at` ms into the fade. */
  const show = (name: SpaceCanvas, at = 0): Animation[] => {
    const layer = layers.get(name);
    if (!layer) return [];
    raised += 1;
    layer.style.zIndex = String(raised);
    const fade = play(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: "ease-in-out" });
    const hold = play(layer, [{ opacity: 1 }, { opacity: 1 }], { duration: STEP_MS, delay: FADE_MS, iterations: Infinity });
    const both = [fade, hold].filter((animation): animation is Animation => animation !== null);
    if (at > 0) for (const animation of both) animation.currentTime = at;
    return both;
  };
  function advance() {
    step = (step + 1) % TINT_TOUR.length;
    // The tint two steps back is covered by the one under the new tint, so it's let go.
    for (const animation of under) animation.cancel();
    under = showing;
    showing = show(TINT_TOUR[step]!);
    map.dataset.tint = TINT_TOUR[step]!;
    schedule();
  }
  /** Takes up the place the map before this one left: its tint, as far into its fade, with the one before it underneath. It holds for a full step. */
  const takeUp = (place: Place) => {
    step = place.step;
    if (place.shown !== null) {
      if (place.shown < FADE_MS) under = show(TINT_TOUR[(step + TINT_TOUR.length - 1) % TINT_TOUR.length]!, FADE_MS);
      showing = show(TINT_TOUR[step]!, place.shown);
    }
    if (pan) pan.currentTime = place.panned;
    map.dataset.tint = TINT_TOUR[step]!;
  };

  const running = () => timer !== undefined;
  const stopTimer = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  };
  /** Back to the still stone map, with nothing playing. */
  const rest = () => {
    stopTimer();
    for (const animation of all()) animation.cancel();
    under = [];
    showing = [];
    pan = null;
    from = null;
    step = 0;
    raised = 0;
    for (const layer of layers.values()) layer.style.zIndex = "";
    map.dataset.tint = TINT_TOUR[0]!;
  };
  const resume = () => {
    if (running() || reduced.matches || document.visibilityState === "hidden") return;
    if (pan) for (const animation of all()) animation.play();
    else {
      pan = play(texture, [{ transform: `translate3d(${-PAN_PX.x}px, ${-PAN_PX.y}px, 0)` }, { transform: `translate3d(${PAN_PX.x}px, ${PAN_PX.y}px, 0)` }], {
        duration: PAN_MS,
        easing: "ease-in-out",
        iterations: Infinity,
        direction: "alternate",
        // From the middle, where the contours rest, so the pan starts without a jump.
        iterationStart: 0.5,
      });
      if (!pan) return;
      if (from) takeUp(from);
      from = null;
    }
    schedule();
  };
  const pause = () => {
    stopTimer();
    for (const animation of all()) animation.pause();
  };
  const visibility = () => (document.visibilityState === "hidden" ? pause() : resume());
  const motion = () => (reduced.matches ? rest() : resume());

  map.dataset.tint = TINT_TOUR[0]!;
  resume();
  document.addEventListener("visibilitychange", visibility);
  reduced.addEventListener("change", motion);
  return () => {
    document.removeEventListener("visibilitychange", visibility);
    reduced.removeEventListener("change", motion);
    // A map that was touring hands its place to one that mounts in this same render.
    if (pan) {
      const place: Place = { step, shown: showing.length > 0 ? Number(showing[0]!.currentTime ?? 0) : null, panned: Number(pan.currentTime ?? 0) };
      handed = place;
      queueMicrotask(() => {
        if (handed === place) handed = null;
      });
    }
    rest();
  };
}
