// A board draws itself when it opens (M3d-23, M-15, A-01, E-07), as style
// idea 5, "The board draws itself", does in
// docs/design/explorations/style-ideas.html (playOpening). The question rises
// in first. The wires then fade in below it, the option headers rise in as
// their columns fade in, and the cards rise in one after another, by row and
// then by column. Each part plays on --sm-slow and --sm-ease. Cards start
// 50 ms apart, and on a big board they start closer together, so the last one
// starts by 600 ms and the whole opening ends within a second.
//
// It plays once for each opening: when a board opens by its link, on a
// reload, and after the list's zoom (growFrom() in zoom.ts) has ended. Board.tsx
// starts it from the board's first layout, so Update, going back from
// Strongest case, a poll, and the reader's own changes never play it. A link
// to a version or to a comment, and Back or Forward, skip it. While the zoom
// plays, the parts the drawing brings in are hidden, so the board doesn't show
// in full and then blink out as the drawing starts.
//
// Every part goes through play() in motion.ts, so nothing starts under reduced
// motion, and each part moves only its transform and opacity, from one
// starting keyframe to the element's own resting values, as the section's
// rows in plans/build-plan.md require. The wires only fade, because they're
// redrawn from the layout on every frame, so nothing moves them. All the parts
// start in one go, each with its own delay and `fill: "backwards"`, so each
// waits unseen for its turn, nothing holds the end, and the end is exactly the
// layout the board has without motion. Each carries the ID "sm-draw-in", so a
// test can tell it from the board's other motion.
//
// Everything can be clicked while it plays. A press of a key, or a click,
// anywhere on the page finishes the drawing before the press does anything, so
// the vote, the Update, or the unfold it starts measures the board where it
// stands. A pointer that goes down finishes every part except the one under
// it, which finishes on the click, so the control being pressed doesn't move
// out from under the pointer. Turning reduced motion on finishes it too, and
// so does a tour that opens on the board. Any of these during the zoom means
// the drawing never starts.

import { curve, duration, play, reducedMotion } from "./motion.ts";

/** What every animation of the drawing is called. */
export const DRAW_IN_ID = "sm-draw-in";
/** When the wires start to fade in below the question. */
export const WIRES_AT_MS = 80;
/** When the first option's header starts to rise in. */
export const HEADERS_AT_MS = 160;
/** How far apart, at most, the first header and the last start. */
const HEADERS_WITHIN_MS = 80;
/** When the first card starts to rise in. */
export const CARDS_AT_MS = 280;
/** How far apart cards start on a board small enough to allow it. */
export const CARD_GAP_MS = 50;
/** The latest the last card starts, whatever the board's size. */
export const LAST_CARD_BY_MS = 600;
/** The longest the whole opening takes. */
export const OPENING_MS = 1000;
/** How far below its place a part starts as it rises in, as the cards' entrance in Leaving.tsx does. */
const RISE = "translateY(8px)";
/** The surface's attribute that hides the parts the drawing brings in, while the zoom before it plays (app.css). */
export const WAITING_ATTRIBUTE = "data-drawing";

/** Where a card sits on the board: its column, its row in that column, and its place along an unfolded row. */
export interface Placed {
  column: number;
  row: number;
  along: number;
}

/** One part of the drawing and when it starts, in ms after the opening. A header's and a card's index is its place in the list given. */
export interface Timed {
  kind: "question" | "wires" | "header" | "card";
  index: number;
  delay: number;
}

/**
 * When each part of the board starts to come in, in the order it starts: the question at once, then the wires, then
 * each header in column order, and then the cards by row, then by column, then along an unfolded row. The cards start
 * 50 ms apart until there are too many to end in time. Then they start closer together, so that the last starts by
 * 600 ms and ends, at `slow`, within a second of the opening.
 */
export function drawInOrder(headers: number, cards: readonly Placed[], slow: number): Timed[] {
  const steps: Timed[] = [
    { kind: "question", index: 0, delay: 0 },
    { kind: "wires", index: 0, delay: WIRES_AT_MS },
  ];
  const headerGap = headers > 1 ? Math.min(CARD_GAP_MS, HEADERS_WITHIN_MS / (headers - 1)) : 0;
  for (let index = 0; index < headers; index++) steps.push({ kind: "header", index, delay: round(HEADERS_AT_MS + index * headerGap) });
  const order = cards.map((_, index) => index).sort((a, b) => {
    const x = cards[a]!;
    const y = cards[b]!;
    return x.row - y.row || x.column - y.column || x.along - y.along;
  });
  // The last card ends by OPENING_MS, and never starts before the first.
  const lastBy = Math.max(CARDS_AT_MS, Math.min(LAST_CARD_BY_MS, OPENING_MS - slow));
  const span = order.length > 1 ? Math.min(CARD_GAP_MS * (order.length - 1), lastBy - CARDS_AT_MS) : 0;
  order.forEach((index, turn) => {
    steps.push({ kind: "card", index, delay: round(CARDS_AT_MS + (order.length > 1 ? (span * turn) / (order.length - 1) : 0)) });
  });
  return steps;
}

function round(ms: number): number {
  return Math.round(ms * 100) / 100;
}

/** The drawing still playing, if any. */
let drawing: Animation[] = [];
/** The surface waiting for the zoom to end before it draws itself, if any. */
let waiting: HTMLElement | null = null;
/** Counts each drawing, waiting or playing, so that what an older one left to do does nothing. */
let current = 0;
/** What stops listening for the press or the setting that ends the drawing. */
let stopListening = () => {};

/**
 * Draws the board in once `before` has ended, as the list's zoom does, and hands what it starts to `started`, for
 * Wires' redrawWhile(). Until then the parts it brings in are hidden. A press, reduced motion, a tour, or
 * finishDrawIn() before then means it never starts, and so does a `before` that's cancelled.
 */
export function drawInAfter(surface: HTMLElement, before: Promise<unknown>, started: (animations: Animation[]) => void): void {
  finishDrawIn();
  if (reducedMotion()) return;
  const mine = current;
  waiting = surface;
  surface.setAttribute(WAITING_ATTRIBUTE, "");
  listen();
  const go = () => {
    if (current !== mine) return;
    waiting = null;
    if (surface.isConnected) started(drawIn(surface));
    else finishDrawIn();
  };
  void before.then(go, () => {
    if (current === mine) finishDrawIn();
  });
}

/**
 * Draws the board in, and answers the animations it started, for Wires' redrawWhile(). Under reduced motion, or on a
 * board with nothing to draw, it starts nothing and answers none. Parts with no size, such as the other side's column
 * on a phone, aren't drawn and take no turn.
 */
export function drawIn(surface: HTMLElement): Animation[] {
  finishDrawIn();
  try {
    return start(surface);
  } finally {
    // The parts' own starting keyframes hide them from here on, in the same frame.
    surface.removeAttribute(WAITING_ATTRIBUTE);
  }
}

function start(surface: HTMLElement): Animation[] {
  if (reducedMotion()) return [];
  const question = surface.querySelector<HTMLElement>(".sm-head");
  const wires = surface.querySelector<SVGSVGElement>("svg.sm-links");
  const board = surface.querySelector<HTMLElement>(".sm-board");
  if (!question || !board) return [];
  const columns = [...board.querySelectorAll<HTMLElement>(":scope > .sm-column, :scope > .sm-col-hidden, :scope > .sm-add-option-col")].filter(shown);
  const cards: { card: Element; placed: Placed }[] = [];
  columns.forEach((column, at) => {
    [...column.querySelectorAll("[data-node]")].filter(shown).forEach((node, row) => {
      [...node.querySelectorAll(".sm-card[data-card]")].filter(shown).forEach((card, along) => cards.push({ card, placed: { column: at, row, along } }));
    });
  });
  const slow = duration("slow", surface);
  const easing = curve("ease", surface);
  const started: Animation[] = [];
  const rise = (element: Element, delay: number, from: Keyframe[]) => {
    // Backwards holds the starting keyframe while the part waits its turn; nothing holds the end, which is the layout.
    const animation = play(element, from, { id: DRAW_IN_ID, duration: slow, easing, delay, fill: "backwards" });
    if (animation) started.push(animation);
  };
  for (const step of drawInOrder(columns.length, cards.map((card) => card.placed), slow)) {
    if (step.kind === "question") rise(question, step.delay, [{ transform: RISE, opacity: 0 }]);
    else if (step.kind === "wires") {
      if (wires) rise(wires, step.delay, [{ opacity: 0 }]);
    } else if (step.kind === "header") {
      const column = columns[step.index]!;
      const head = column.matches(".sm-column") ? column.querySelector(":scope > .sm-column-head") : column;
      if (head) rise(head, step.delay, [{ transform: RISE, opacity: 0 }]);
      // The column itself only fades, so that nothing measured inside it moves with it.
      if (head !== column) rise(column, step.delay, [{ opacity: 0 }]);
    } else rise(cards[step.index]!.card, step.delay, [{ transform: RISE, opacity: 0 }]);
  }
  if (!started.length) return [];
  drawing = started;
  listen();
  const mine = current;
  const ended = () => {
    if (current === mine) finishDrawIn();
  };
  void Promise.all(started.map((animation) => animation.finished)).then(ended, ended);
  return started;
}

/**
 * Finishes the drawing at once, if it's still playing, so that the board stands at its own layout, and makes sure a
 * drawing still waiting for the zoom never starts. Given the element a pointer has just gone down on, it leaves that
 * element's part, and the parts around it, to finish on the click, so the control doesn't move under the pointer.
 */
export function finishDrawIn(pressed?: Node | null): void {
  const under = pressed ? drawing.filter((animation) => targetOf(animation)?.contains(pressed)) : [];
  const done = drawing.filter((animation) => !under.includes(animation));
  for (const animation of done) if (animation.playState !== "finished" && animation.playState !== "idle") animation.finish();
  waiting?.removeAttribute(WAITING_ATTRIBUTE);
  waiting = null;
  if (under.some((animation) => animation.playState !== "finished" && animation.playState !== "idle")) {
    drawing = under;
    return;
  }
  drawing = [];
  current += 1;
  stopListening();
  stopListening = () => {};
}

/** Until the drawing ends, a press anywhere on the page, or reduced motion turned on, finishes it first. */
function listen(): void {
  stopListening();
  const press = (event: Event) => finishDrawIn(event.type === "pointerdown" && event.target instanceof Node ? event.target : null);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const changed = () => {
    if (reduced.matches) finishDrawIn();
  };
  const events = ["pointerdown", "keydown", "click"] as const;
  for (const event of events) document.addEventListener(event, press, { capture: true });
  reduced.addEventListener("change", changed);
  stopListening = () => {
    for (const event of events) document.removeEventListener(event, press, { capture: true });
    reduced.removeEventListener("change", changed);
  };
}

function targetOf(animation: Animation): Element | null {
  return animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
}

function shown(element: Element): boolean {
  const box = element.getBoundingClientRect();
  return box.width > 0 || box.height > 0;
}
