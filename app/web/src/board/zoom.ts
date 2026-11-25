// Board and Strongest case zoom, and a board opening from its miniature
// (M3d-9; E-01, E-07, M-15), ported from the prototype's centerCard(),
// zoomTo(), growFrom() and shrinkInto()
// (docs/prototype/source/steelman-refined.html).
//
// Switching views scales the scene from the card nearest the middle of the
// window: the card is measured before the switch and after it, and the scene
// plays from the transform that draws the card where it was to none, on
// --sm-slow. Unlike the prototype, nothing scrolls, so each view ends exactly
// where it is drawn without motion. A card the other view doesn't show leaves
// the question's header as the place that holds still.
//
// A board opened from Your steelmen grows out of the rect its post's
// miniature had on the click, cut to the miniature's height, as growFrom()
// does. Going back to the list draws an inert copy of the board where it was,
// and once Home has drawn the list, the copy shrinks into the post's
// miniature and fades to 0.6, as shrinkInto() does, and then leaves the page.
// On a phone the list draws no miniature, so the post itself is the rect.
// The motion copies how Google Photos and Apple Photos open a photo from its
// thumbnail and close it back into the grid, and how iOS and macOS open an
// app from its icon (from memory).
//
// Every animation goes through motion.ts's play(), so nothing plays and no
// copy is drawn under reduced motion, and none holds its end, so each ends in
// exactly the layout the app draws without motion. The transform origin and
// the clip live only in the keyframes, and nothing is left on an element.

import type { Zoom } from "./Board.tsx";
import { curve, duration, play, reducedMotion } from "./motion.ts";
import type { Rect } from "./motion.ts";

/** A move smaller than this is no move at all. */
const STILL_PX = 0.5;
/** The miniature's rounded corners, which the growing board's clip keeps. */
const CORNER_PX = 6;

/** What a switch of views measured before React drew the other view: the centred card and the question's header. */
let pending: { level: Zoom; card: string | null; before: Rect | null; head: Rect | null } | null = null;
/** The zoom still running, which the next switch stops once it has measured where things are seen. */
let running: Animation | null = null;

/** The card whose middle is nearest the middle of the window, as the prototype's centerCard() finds it. */
export function centredCard(root: ParentNode): string | null {
  const middle = window.innerHeight / 2;
  let best: string | null = null;
  let distance = Infinity;
  for (const card of root.querySelectorAll<HTMLElement>(".sm-card[data-card]")) {
    const rect = card.getBoundingClientRect();
    if (!rect.width && !rect.height) continue;
    const away = Math.abs(rect.top + rect.height / 2 - middle);
    if (away < distance) {
      distance = away;
      best = card.dataset.card ?? null;
    }
  }
  return best;
}

/**
 * Measures the board before a switch to the other view, so that zoomInto() can play it once it's drawn: the card given
 * (the one Strongest case opens), or else the centred card, and the question's header. Rects include any zoom still
 * running, so a second switch starts from where things are seen.
 */
export function beforeZoom(level: Zoom, card: string | null = null): void {
  pending = null;
  const scene = document.querySelector<HTMLElement>(".sm-scene");
  if (!scene || reducedMotion()) return;
  const id = card ?? centredCard(scene);
  const element = id ? scene.querySelector(`.sm-card[data-card="${CSS.escape(id)}"]`) : null;
  const head = scene.querySelector(".sm-head");
  pending = { level, card: element ? id : null, before: element ? box(element) : null, head: head ? box(head) : null };
}

/**
 * Plays the switch measured by beforeZoom() once the new view is drawn, and answers the animation for Wires'
 * redrawWhile(), or null when there's nothing to play: no switch was measured, or nothing moved.
 */
export function zoomInto(scene: HTMLElement, level: Zoom): Animation | null {
  const was = pending;
  pending = null;
  running?.cancel();
  running = null;
  if (!was || was.level !== level) return null;
  const card = was.card && was.before ? scene.querySelector(`.sm-card[data-card="${CSS.escape(was.card)}"]`) : null;
  const target = card ?? scene.querySelector(".sm-head");
  const before = card ? was.before : was.head;
  if (!target || !before) return null;
  const after = target.getBoundingClientRect();
  if (!after.width) return null;
  const frame = scene.getBoundingClientRect();
  const k = before.width / after.width;
  const x = before.left - frame.left - (after.left - frame.left) * k;
  const y = before.top - frame.top - (after.top - frame.top) * k;
  if (Math.abs(k - 1) < 0.001 && Math.abs(x) < STILL_PX && Math.abs(y) < STILL_PX) return null;
  running = play(
    scene,
    [
      { transformOrigin: "0 0", transform: `translate(${round(x)}px, ${round(y)}px) scale(${k})` },
      { transformOrigin: "0 0", transform: "none" },
    ],
    { duration: duration("slow", scene), easing: curve("ease", scene) },
  );
  return running;
}

/**
 * Grows the board's surface out of a rect seen in the window before it was drawn (its post's miniature), cut to that
 * rect's height and rounded as the miniature is, as the prototype's growFrom() does.
 */
export function growFrom(surface: HTMLElement, from: Rect): Animation | null {
  const to = surface.getBoundingClientRect();
  if (!to.width || !from.width) return null;
  // Measured from its top-left corner, which the scale holds still.
  const k = from.width / to.width;
  return play(
    surface,
    [
      { transformOrigin: "0 0", transform: `translate(${round(from.left - to.left)}px, ${round(from.top - to.top)}px) scale(${k})`, clipPath: clip(from.height, k) },
      { transformOrigin: "0 0", transform: "none", clipPath: "inset(0px 0px 0px 0px round 0px)" },
    ],
    { duration: duration("slow", surface), easing: curve("ease", surface) },
  );
}

/** A copy of the board drawn where it was, over the page, until it has shrunk into the list or been put away. */
export interface Closing {
  board: string;
  /** The layer the copy is drawn in, over the whole window. */
  layer: HTMLElement;
  copy: HTMLElement;
  /** Where the board was drawn in the window as it was left. */
  from: Rect;
}

/**
 * Copies the board as it's drawn now into an inert layer over the window, so that it can shrink into the list after
 * the board itself has gone. Answers null under reduced motion, or when no board is drawn. The copy names nothing and
 * takes no cursor, and its textures are painted as the board's are.
 */
export function holdBoard(board: string): Closing | null {
  const surface = document.querySelector<HTMLElement>("#steelman-study .sm-surface");
  const root = document.getElementById("steelman-study");
  if (!surface || !root || reducedMotion()) return null;
  const from = box(surface);
  const copy = surface.cloneNode(true) as HTMLElement;
  // A canvas copies without its drawing.
  const canvases = surface.querySelectorAll("canvas");
  copy.querySelectorAll("canvas").forEach((canvas, n) => {
    const drawn = canvases[n];
    if (drawn && drawn.width && drawn.height) canvas.getContext("2d")?.drawImage(drawn, 0, 0);
  });
  inertCopy(copy);
  Object.assign(copy.style, { position: "absolute", boxSizing: "border-box", margin: "0", left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, minHeight: "0", height: `${surface.offsetHeight}px` });
  const layer = document.createElement("div");
  layer.className = "sm-closing-layer ph-no-capture";
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;
  layer.append(copy);
  root.append(layer);
  const closing = { board, layer, copy, from };
  // Should nothing shrink it (no list drawn, a tab in the background), it never stays over the page.
  window.setTimeout(() => layer.remove(), duration("slow", root) + 1000);
  return closing;
}

/**
 * Shrinks the copy into a rect in the window (the post's miniature), fading to 0.6, and takes it off the page when it
 * ends. With no rect, or one off screen, nothing shrinks: the copy fades out where it is, as the old page does in the
 * ordinary page transition (M3d-11), and Home rises into place under it.
 */
export function shrinkInto(closing: Closing, into: Rect | null): Animation | null {
  const { layer, copy, from } = closing;
  const onScreen = into !== null && into.width > 0 && into.top + into.height > 0 && into.top < window.innerHeight && into.left + into.width > 0 && into.left < window.innerWidth;
  if (!onScreen) {
    fadeAway(layer);
    return null;
  }
  const k = into.width / from.width;
  const animation = play(
    copy,
    [
      { transformOrigin: "0 0", transform: "none", clipPath: "inset(0px 0px 0px 0px round 0px)", opacity: 1 },
      { transformOrigin: "0 0", transform: `translate(${round(into.left - from.left)}px, ${round(into.top - from.top)}px) scale(${k})`, clipPath: clip(into.height, k), opacity: 0.6 },
    ],
    { duration: duration("slow", copy), easing: curve("ease", copy) },
  );
  if (!animation) layer.remove();
  else void animation.finished.then(() => layer.remove(), () => layer.remove());
  return animation;
}

/**
 * Fades the copy's layer out on --sm-medium (app.css, sm-closing-fade) and takes it off the page as the fade ends. The
 * fade is CSS, on the layer itself, so no Web Animation starts on the copy, which only a shrink plays.
 */
function fadeAway(layer: HTMLElement): void {
  const remove = () => layer.remove();
  // Only the layer's own fade: the board's copy may play animations of its own, whose ends bubble up to it.
  const ended = (event: AnimationEvent) => event.target === layer && remove();
  layer.addEventListener("animationend", ended);
  layer.addEventListener("animationcancel", ended);
  layer.classList.add("sm-closing-fade");
  // In case its animation never ends (a tab in the background): --sm-medium and a little more.
  window.setTimeout(remove, duration("medium", layer) + 40);
}

/** Takes away any copy still over the page, when another board opens before it has finished. */
export function putAway(): void {
  document.querySelectorAll(".sm-closing-layer").forEach((layer) => layer.remove());
}

/**
 * Cuts the bottom of a surface so that, scaled by k, it's as tall as the miniature, with the miniature's corners. The
 * cut is measured from the top, so it holds when the board's height still changes as it grows, as it does on a phone.
 */
function clip(into: number, k: number): string {
  return `inset(0px 0px calc(100% - ${round(into / k)}px) 0px round ${round(CORNER_PX / k)}px)`;
}

/** Drops every attribute that names an element, takes the cursor, or is read by the app's code, from the copy and everything in it. */
function inertCopy(copy: HTMLElement): void {
  for (const element of [copy, ...copy.querySelectorAll("*")]) {
    for (const { name } of [...element.attributes]) {
      if (name === "id" || name === "for" || name === "name" || name === "tabindex" || name === "role" || name.startsWith("aria-") || ["data-card", "data-node", "data-tooltip", "data-key", "data-comments"].includes(name)) element.removeAttribute(name);
    }
  }
}

function box(element: Element): Rect {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
}

function round(px: number): number {
  return Math.round(px * 100) / 100;
}
