// The app's motion (M3d-2, M-15), ported from the prototype's play() and the
// FLIP in its render() (docs/prototype/source/steelman-refined.html). Every
// Web Animation in the app goes through play(), which starts nothing under
// reduced motion: the prototype's CSS rule stops CSS transitions and
// animations, but it can't stop these. flip() moves elements from where they
// were to where they are now with a transform that ends at none, so every
// move ends in exactly the layout the page has without motion, and a saved
// screenshot taken after it is unchanged. Timings and curves come from
// docs/design/tokens.css, read when they're used, never when this file loads.
// Update's shuffle (M3d-3) adds flip()'s `travel`, under which a moving row
// grows by 1 percent while it travels and a row moving up passes over one
// moving down, stopMoves(), which stops a shuffle still running, and
// drawnRect(), which measures a traveling row without its growth. The board's
// canvas drifts as the page scrolls (M3d-22): driftOf() says how far, and
// startDrift() moves the canvas layer from one passive scroll listener.
//
// The curves follow Material Design 3's guidance on easing and duration and
// Apple's Human Interface Guidelines on motion: short and physical, and gone
// under Reduce Motion.

/** What flip() moves on the board when it isn't told otherwise: the rows, and the cards in them. */
export const BOARD_MOVERS = "[data-node], .sm-card[data-card]";

/** How long each element in reading order waits after the one before it. */
export const STAGGER_MS = 20;
/** The most turns a stagger takes, so that the last row on a long board starts within a quarter second. */
export const MOST_TURNS = 12;
/** A move smaller than this is no move at all. */
const STILL_PX = 0.5;
/** How far a traveling element grows halfway through its move, as a sheet of paper lifted off the desk (M3d-3). */
const TRAVEL_SCALE = 1.01;
/** The values the app used before these were tokens, for a stylesheet that doesn't have them. */
const FALLBACK = { fast: 120, medium: 200, slow: 420, leave: 160, fold: 220, ring: 1400 };
const EASE = "cubic-bezier(.2,.7,.2,1)";

/** Where an element was drawn, in viewport pixels, as getBoundingClientRect gives it. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where each element was, by its row or card ID on the board, or by the element itself elsewhere. */
export type Rects = ReadonlyMap<string | Element, Rect>;

export interface FlipOptions {
  /** Which elements move; the board's rows and cards unless told otherwise. */
  selector?: string;
  /** How long each moving element waits after the one before it in reading order, in ms. */
  stagger?: number;
  /**
   * Whether a moving element's card wears --sm-lift as it starts, and is set down in its own shadow. A row's card is
   * its face, so a row that moves lifts its card, never the whole row.
   */
  lift?: boolean;
  /**
   * Whether each moving element scales to 1.01 halfway through its move and back to 1 as it lands, and an element
   * moving toward the top passes over one moving down, as Update's shuffle asks (M3d-3). The scale starts and ends at
   * 1 and the raise lasts only as long as the move, so the first frame is the old place and the last is the layout.
   */
  travel?: boolean;
}

export interface Flipped {
  /** The elements that had no earlier rect, so that the caller can play an entrance for them. */
  arrivals: Element[];
  /** The moves, and with lift the cards' shadows, that started, for Wires' redrawWhile(). Empty under reduced motion. */
  animations: Animation[];
}

/** True when the reader has asked their system for reduced motion. */
export function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A timing token in ms (`--sm-slow`, `--sm-leave`, and the rest), or the value it had before it was a token. */
export function duration(name: keyof typeof FALLBACK, from: Element = document.documentElement): number {
  const value = window.getComputedStyle(from).getPropertyValue(`--sm-${name}`).trim();
  const number = parseFloat(value);
  if (!Number.isFinite(number)) return FALLBACK[name];
  // The build's CSS minifier may write 160ms as .16s.
  return Math.round(value.endsWith("ms") || !value.endsWith("s") ? number : number * 1000);
}

/** A curve token, the settle or the ease, falling back to the ease where the browser can't read it. */
export function curve(name: "settle" | "ease", from: Element): string {
  const value = window.getComputedStyle(from).getPropertyValue(`--sm-${name}`).trim();
  // An easing the browser can't read makes animate() throw, and linear() is newer than the rest of the app needs.
  if (value && (typeof CSS === "undefined" || CSS.supports("animation-timing-function", value))) return value;
  return name === "settle" ? curve("ease", from) : EASE;
}

/**
 * Plays keyframes on an element at --sm-medium on --sm-ease unless told otherwise, and returns the animation. Under
 * reduced motion it starts nothing and returns null, so that no caller has to check. A cancelled animation's
 * `finished` rejects, which is expected here, so it's never reported as an error.
 */
export function play(element: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes, options: KeyframeAnimationOptions = {}): Animation | null {
  if (reducedMotion()) return null;
  const animation = element.animate(keyframes, { duration: duration("medium", element), easing: curve("ease", element), ...options });
  animation.finished.catch(() => undefined);
  return animation;
}

/**
 * Records where every element that matches the selector is drawn now. A rect taken while an element is still moving
 * includes the move, so the next flip() starts it from where it's seen. Hidden elements, which have no size, aren't
 * recorded. Callers take this after anything that scrolls the page, as flip() measures in viewport pixels too.
 */
export function captureRects(root: ParentNode, selector = BOARD_MOVERS): Rects {
  const rects = new Map<string | Element, Rect>();
  for (const element of root.querySelectorAll(selector)) {
    const rect = drawnRect(element);
    if (rect.width || rect.height) rects.set(keyOf(element), rect);
  }
  return rects;
}

/**
 * Where an element is drawn, in viewport pixels, at its own size. A traveling element is drawn up to 1 percent larger
 * about its centre, which the next flip() doesn't play, so the rect keeps the centre and the move and leaves out the
 * element's own `scale`. A second Update during a shuffle then starts each row from where it's seen, and holds the row
 * being read still, instead of shifting it by half the growth (M3d-3).
 */
export function drawnRect(element: Element): Rect {
  const box = element.getBoundingClientRect();
  // A browser, or a test's stand-in, that has no `scale` draws nothing grown.
  const scale: string | undefined = window.getComputedStyle(element).scale;
  const [x = 1, y = x] = (scale ?? "none").split(" ").map(Number);
  const sx = Number.isFinite(x) && x > 0 ? x : 1;
  const sy = Number.isFinite(y) && y > 0 ? y : sx;
  if (sx === 1 && sy === 1) return { left: box.left, top: box.top, width: box.width, height: box.height };
  const width = box.width / sx;
  const height = box.height / sy;
  return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
}

/** Each element's own move and its card's lift, so that a later flip() cancels them and no other animation. */
const moving = new WeakMap<Element, Animation[]>();

/**
 * Moves every element that matches the selector from its rect in `before` to where it is now, with a transform that
 * runs from the old offset to none on --sm-slow and --sm-settle. A card inside a row that moves is moved only by
 * the difference, so it doesn't travel twice as far. An element that didn't move gets no animation. The moves start
 * in reading order, top to bottom and left to right along a line, about 20 ms apart. Any earlier move on the same
 * element is cancelled first, so that a second change still ends at the final layout.
 */
export function flip(before: Rects, root: ParentNode & Element, options: FlipOptions = {}): Flipped {
  const { selector = BOARD_MOVERS, stagger = STAGGER_MS, lift = false, travel = false } = options;
  // Earlier moves first, so that every rect below is the element's own place.
  const elements = stopMoves(root, selector);
  const arrivals: Element[] = [];
  const offsets = new Map<Element, { x: number; y: number; now: Rect }>();
  for (const element of elements) {
    const now = element.getBoundingClientRect();
    if (!now.width && !now.height) continue;
    const was = before.get(keyOf(element));
    if (!was) arrivals.push(element);
    else offsets.set(element, { x: was.left - now.left, y: was.top - now.top, now });
  }
  const moves: { element: Element; x: number; y: number; now: Rect }[] = [];
  for (const [element, offset] of offsets) {
    // A move of a row carries its cards, so each card moves only by what its row's move doesn't cover.
    let x = offset.x;
    let y = offset.y;
    for (let up = element.parentElement; up && up !== root; up = up.parentElement) {
      const carried = offsets.get(up);
      if (!carried) continue;
      x -= carried.x;
      y -= carried.y;
      break;
    }
    if (Math.abs(x) >= STILL_PX || Math.abs(y) >= STILL_PX) moves.push({ element, x, y, now: offset.now });
  }
  moves.sort((a, b) => a.now.top - b.now.top || a.now.left - b.now.left);
  const animations: Animation[] = [];
  const slow = duration("slow", root);
  const settle = curve("settle", root);
  const lifted = lift ? window.getComputedStyle(root).getPropertyValue("--sm-lift").trim() : "";
  const movers = new Set(moves.map((move) => move.element));
  moves.forEach(({ element, x, y }, turn) => {
    // Backwards holds the old place while the element waits its turn; nothing holds the end, which is the layout.
    const timing: KeyframeAnimationOptions = { duration: slow, easing: settle, delay: Math.min(turn, MOST_TURNS) * stagger, fill: "backwards" };
    // The shadow the card is set down in, read before anything plays on it.
    const face = lift ? faceOf(element) : null;
    const resting = face ? window.getComputedStyle(face).boxShadow : "";
    const from = `translate(${round(x)}px, ${round(y)}px)`;
    const animation = play(element, travel ? traveling(element, from, x, y) : [{ transform: from }, { transform: "none" }], timing);
    if (!animation) return;
    const started = [animation];
    // A card that moves within its row lifts on its own move, so its row doesn't lift it a second time.
    if (face && (face === element || !movers.has(face))) {
      const shadow = play(face, [{ boxShadow: lifted }, { boxShadow: resting }], timing);
      if (shadow) started.push(shadow);
    }
    moving.set(element, started);
    void animation.finished.then(
      () => moving.get(element) === started && moving.delete(element),
      () => undefined,
    );
    animations.push(...started);
  });
  return { arrivals, animations };
}

/**
 * Stops every move flip() started on the elements under the root that match the selector, so that each is drawn at
 * its own place again, and returns those elements. Update calls it before it measures the row the reader is reading,
 * so that a second Update during a shuffle measures that row where it lies and not partway through its move.
 */
export function stopMoves(root: ParentNode, selector = BOARD_MOVERS): Element[] {
  const elements = [...root.querySelectorAll(selector)];
  for (const element of elements) {
    for (const animation of moving.get(element) ?? []) animation.cancel();
    moving.delete(element);
  }
  return elements;
}

/**
 * A traveling move's keyframes: from the old offset at scale 1, through 1.01 halfway, to none at scale 1. An element
 * moving toward the start of reading order, up or else to the left, is raised one above its resting z-index for as
 * long as it moves, so that it passes over the ones moving the other way; nothing holds the raise after the end.
 */
function traveling(element: Element, from: string, x: number, y: number): Keyframe[] {
  const rising = y >= STILL_PX || (Math.abs(y) < STILL_PX && x >= STILL_PX);
  const resting = Number.parseInt(window.getComputedStyle(element).zIndex, 10);
  const raise: Keyframe = rising ? { zIndex: String((Number.isFinite(resting) ? resting : 0) + 1) } : {};
  return [
    { transform: from, scale: "1", ...raise },
    { scale: String(TRAVEL_SCALE), offset: 0.5 },
    { transform: "none", scale: "1", ...raise },
  ];
}

/**
 * What an element is called from one render to the next: a row by its argument ID and a card by its version ID, so
 * that one React draws anew, as a row does when it's combined away, moves from the old one's place. Anything else is
 * called by the element itself.
 */
function keyOf(element: Element): string | Element {
  const data = (element as HTMLElement).dataset ?? {};
  if (data.node !== undefined) return `node:${data.node}`;
  if (data.card !== undefined) return `card:${data.card}`;
  return element;
}

/** The card that wears a lift: the element itself when it's a card, or a row's own card. */
function faceOf(element: Element): Element | null {
  return element.matches(".sm-card") ? element : element.querySelector(":scope > .sm-card-wrap > .sm-card");
}

function round(px: number): number {
  return Math.round(px * 100) / 100;
}

/** How much of the scroll the board's canvas follows: it moves down a tenth as far, so it moves at 0.9 times the page (M3d-22). */
const DRIFT_RATE = 0.1;
/** The furthest the canvas drifts. */
export const MOST_DRIFT_PX = 170;

/**
 * How far down the board's canvas is drawn, in px, once the board's top has scrolled `scrolled` px past the window's
 * top (M3d-22, M-15). While the board's top is in the window, the canvas doesn't move. After that it moves a tenth of
 * the scroll, so it falls behind the cards and they seem to float above the map, and it never moves more than 170 px.
 * Under reduced motion it never moves.
 */
export function driftOf(scrolled: number, reduced: boolean): number {
  if (reduced || !(scrolled > 0)) return 0;
  return Math.min(MOST_DRIFT_PX, scrolled * DRIFT_RATE);
}

/**
 * Moves the board's canvas layer with the page's scroll, and returns what stops it (M3d-22, M-15). One passive scroll
 * listener asks for an animation frame, and that frame reads where the board's top is and writes a single transform on
 * the layer, so scrolling causes no layout and the composited canvas isn't painted again. The canvas starts to drift
 * only once the board's top has left the window, so the strip it uncovers at the board's top is never on screen. The
 * drift is set straight from the scroll and isn't an animation, so it doesn't go through play(), and a test waiting for
 * the board's animations to end never waits on it. Turning reduced motion on puts a drifted canvas back at once,
 * without waiting for the next scroll. While the board itself is animated, as it is while it grows out of its post's
 * miniature (growFrom() in zoom.ts), its rect includes the move, so the drift waits and is measured again as the
 * animation ends.
 */
export function startDrift(layer: HTMLElement, board: Element): () => void {
  let frame = 0;
  let drawn = 0;
  let waiting = false;
  let stopped = false;
  const later = () => {
    if (!frame && !stopped) frame = window.requestAnimationFrame(place);
  };
  const place = () => {
    frame = 0;
    // Only an animation that ends: a board drawn moved is measured again once it's in its place.
    const moving = board.getAnimations().filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime));
    if (moving.length) {
      if (!waiting) {
        waiting = true;
        const settled = () => {
          waiting = false;
          later();
        };
        void Promise.all(moving.map((animation) => animation.finished)).then(settled, settled);
      }
      return;
    }
    // Whole device pixels, so the grain and the contours stay sharp as they move.
    const ratio = window.devicePixelRatio || 1;
    const drift = Math.round(driftOf(-board.getBoundingClientRect().top, reducedMotion()) * ratio) / ratio;
    if (drift === drawn) return;
    drawn = drift;
    layer.style.transform = drift ? `translate3d(0, ${drift}px, 0)` : "";
  };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  place();
  window.addEventListener("scroll", later, { passive: true });
  reduced.addEventListener("change", later);
  return () => {
    stopped = true;
    window.cancelAnimationFrame(frame);
    frame = 0;
    window.removeEventListener("scroll", later);
    reduced.removeEventListener("change", later);
  };
}
