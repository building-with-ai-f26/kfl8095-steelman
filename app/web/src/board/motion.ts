// The app's motion (M3d-2, M-15), ported from the prototype's play() and the
// FLIP in its render() (docs/prototype/source/steelman-refined.html). Every
// Web Animation in the app goes through play(), which starts nothing under
// reduced motion: the prototype's CSS rule stops CSS transitions and
// animations, but it can't stop these. flip() moves elements from where they
// were to where they are now with a transform that ends at none, so every
// move ends in exactly the layout the page has without motion, and a saved
// screenshot taken after it is unchanged. Timings and curves come from
// docs/design/tokens.css, read when they're used, never when this file loads.
//
// The curves follow Material Design 3's guidance on easing and duration and
// Apple's Human Interface Guidelines on motion: short and physical, and gone
// under Reduce Motion.

/** What flip() moves on the board when it isn't told otherwise: the rows, and the cards in them. */
export const BOARD_MOVERS = "[data-node], .sm-card[data-card]";

/** How long each element in reading order waits after the one before it. */
const STAGGER_MS = 20;
/** The most turns a stagger takes, so that the last row on a long board starts within a quarter second. */
const MOST_TURNS = 12;
/** A move smaller than this is no move at all. */
const STILL_PX = 0.5;
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
function curve(name: "settle" | "ease", from: Element): string {
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
    const { left, top, width, height } = element.getBoundingClientRect();
    if (width || height) rects.set(keyOf(element), { left, top, width, height });
  }
  return rects;
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
  const { selector = BOARD_MOVERS, stagger = STAGGER_MS, lift = false } = options;
  const elements = [...root.querySelectorAll(selector)];
  // Earlier moves first, so that every rect below is the element's own place.
  for (const element of elements) {
    for (const animation of moving.get(element) ?? []) animation.cancel();
    moving.delete(element);
  }
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
    const animation = play(element, [{ transform: `translate(${round(x)}px, ${round(y)}px)` }, { transform: "none" }], timing);
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
