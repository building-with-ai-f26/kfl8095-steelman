// Combining and separating settle in place (M3d-7; A-10, J-05, M-15).
//
// The builder decided on Nov 24 that no card travels across rows or columns,
// and answered question 7 that cards move only on Update. So a combine or a
// separation changes the board exactly as it does without motion, at once,
// and only three things play over that change, each inside one column:
//
// - A wording combined away into a row already drawn (a combine, or Undo of
//   a separation) fades out where it was, on an inert copy of its card, at
//   --sm-medium. The copy is drawn over the card or row that takes its place,
//   so the two cross-fade, and then it leaves the page. A separated wording
//   leaves no copy: its new row rises in instead.
// - Each stack whose count changed settles with one scale on --sm-settle,
//   from the size the prototype's hover gives it (1.12) back to its own.
// - A row that appears, as a separated wording's does, fades in and rises
//   8 px at its place, as the prototype's render(..., 'added') does and as
//   M3d-4's new argument does. A wording that joins a row where its card is
//   drawn rises in the same way on its card.
//
// The rows below take their places at once, as they do today, with no flip()
// on them, as M3d-4 did for the rows below a delete. Undo on the bar and Undo
// in History are moves too, so they play the same motion back. Only the
// reader's own changes call this (session.ts onMove): other people's
// combines and Update never do. The prototype has no motion of its own for a
// combine (its preview-confirm unfolds the target row, and a separation
// reorders the board); the in-place fades follow how Google Keep and Trello
// close the gap when a note or a card leaves a list and open one where it
// arrives, with items moving only along their list (from memory: both need
// an account to check live).
//
// Every animation goes through motion.ts's play(), so nothing plays and
// nothing is copied under reduced motion, and none holds its end, so each
// ends in exactly the layout the app draws without motion. The copy keeps
// nothing that names a row, a card, or a wording to a lookup: its ids, data
// and ARIA attributes go, as unfold.ts's copies' do, and its wording's
// `sm-claim` class is swapped for its look, frozen inline.

import type { BoardOrder, ReaderView } from "@steelman/shared";
import { curve, drawnRect, duration, play, reducedMotion } from "./motion.ts";
import type { Rect } from "./motion.ts";
import { place, strip } from "./unfold.ts";

/** The new row's entrance, as the prototype's render(..., 'added') plays it, and as Leaving.tsx's arrival does. */
const ENTRANCE: Keyframe[] = [
  { transform: "translateY(8px)", opacity: 0 },
  { transform: "none", opacity: 1 },
];
/** The stack count's one scale: from the size the prototype's hover gives it back to its own. */
const SETTLE: Keyframe[] = [{ scale: "1.12" }, { scale: "1" }];
/** What a wording looks like, frozen on the copy once its `sm-claim` class is gone. */
const CLAIM_LOOK = ["display", "margin", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "color", "overflow-wrap", "text-align"] as const;

/**
 * What a move needs from the screen as it was, taken as the move is sent, since the read that follows it may already
 * draw the row it leaves as combined away, and completed just before the move shows.
 */
export interface Settling {
  versionId: string;
  /** The view the move replaces, and the one it shows, once it's about to show: it has been drawn once the session holds `next`. */
  was: ReaderView | null;
  next: ReaderView | null;
  /** The row the wording was shown in, if any. */
  from: string | null;
  /** The rows drawn on screen before the move. */
  rows: Set<string>;
  /** The wording's card, copied where it was drawn, in the settling layer's pixels; null when it wasn't drawn. */
  copy: { face: HTMLElement; at: Rect } | null;
}

/** The animations the last move started, which Update and a row's Compare or Fold stop first. */
let running: Animation[] = [];

/** Stops a move's motion still running, and takes away any copy still fading. Update calls it before it measures. */
export function stopSettling(scene: ParentNode | null): void {
  for (const animation of running) animation.cancel();
  running = [];
  scene?.querySelector(":scope > .sm-settling-layer")?.replaceChildren();
}

/**
 * Records the screen as it's drawn as the reader's own move is sent: which rows are drawn, the row the wording is in,
 * and a copy of its card where it's drawn. Answers null under reduced motion, when nothing plays.
 */
export function beforeSettle(scene: HTMLElement, versionId: string, shown: BoardOrder): Settling | null {
  if (reducedMotion()) return null;
  const rows = new Set<string>();
  for (const node of scene.querySelectorAll<HTMLElement>(".sm-board .sm-idea[data-node]")) if (drawn(node)) rows.add(node.dataset.node!);
  const from = rowHolding(shown, versionId);
  return { versionId, was: null, next: null, from, rows, copy: copyAt(scene, versionId, from) };
}

/**
 * Completes the record just before the move shows: the view it replaces and the one it shows. The wording's card is
 * copied again where it's drawn now, if it still is, so that the copy starts from where it's seen.
 */
export function readySettle(scene: HTMLElement, settling: Settling, was: ReaderView, next: ReaderView): Settling {
  return { ...settling, was, next, copy: copyAt(scene, settling.versionId, settling.from) ?? settling.copy };
}

/** A copy of the wording's card where it's drawn in its row, in the settling layer's pixels, or null when it isn't drawn. */
function copyAt(scene: HTMLElement, versionId: string, from: string | null): Settling["copy"] {
  const card = from ? rowOf(scene, from)?.querySelector<HTMLElement>(`.sm-card[data-card="${CSS.escape(versionId)}"]`) : null;
  const layer = scene.querySelector<HTMLElement>(":scope > .sm-settling-layer");
  if (!card || !layer || !drawn(card)) return null;
  const box = drawnRect(card);
  const origin = layer.getBoundingClientRect();
  return { face: copyOf(card), at: { left: box.left - origin.left, top: box.top - origin.top, width: box.width, height: box.height } };
}

/**
 * Plays the move once React has drawn it, and answers the animations, for Wires' redrawWhile(). A move that left the
 * wording in the row it was in plays nothing.
 */
export function playSettle(scene: HTMLElement, settling: Settling): Animation[] {
  stopSettling(scene);
  const { versionId, from, rows, copy } = settling;
  if (!settling.next) return [];
  const to = rowHolding(settling.next.shown, versionId);
  if (to === from) return [];
  const started: (Animation | null)[] = [];
  // A row that wasn't drawn before, as a separated wording's is, rises in at its place.
  const node = to ? rowOf(scene, to) : null;
  const rises = node !== null && drawn(node) && !rows.has(to!);

  // A wording combined away, into a row already drawn, fades out where it was, on its copy, which rests clear once
  // it has gone. A wording that rises in its own new row leaves no copy behind: the row it left only settles.
  const layer = scene.querySelector<HTMLElement>(":scope > .sm-settling-layer");
  if (copy && layer && !rises) {
    place(copy.face, copy.at);
    copy.face.style.opacity = "0";
    layer.append(copy.face);
    const fade = play(copy.face, [{ opacity: 1 }, { opacity: 0 }], { duration: duration("medium", layer) });
    if (fade) {
      started.push(fade);
      removeAfter(copy.face, fade);
    } else copy.face.remove();
  }

  // The new row rises in; otherwise the wording's card does, where it's drawn in the row it joined.
  if (node && rises) started.push(play(node, ENTRANCE));
  else {
    const card = node?.querySelector<HTMLElement>(`.sm-card[data-card="${CSS.escape(versionId)}"]`);
    if (card && drawn(card)) started.push(play(card, ENTRANCE));
  }

  // Each stack drawn before and after whose count changed settles: the one the wording left, and the one it joined.
  for (const argument of new Set([from, to])) {
    if (!argument || !rows.has(argument)) continue;
    const count = rowOf(scene, argument)?.querySelector<HTMLElement>(":scope > .sm-card-wrap > .sm-stack-button > .sm-stack-count");
    if (count && drawn(count)) started.push(play(count, SETTLE, { duration: duration("slow", count), easing: curve("settle", count) }));
  }

  running = started.filter((animation): animation is Animation => animation !== null);
  return running;
}

/** The argument whose shown wordings include this one. */
function rowHolding(shown: BoardOrder, versionId: string): string | null {
  for (const [argument, ids] of Object.entries(shown.versions)) if (ids.includes(versionId)) return argument;
  return null;
}

/** A copy of the card that names nothing: no ids, data, or ARIA, and no `sm-claim` for a lookup to find its wording by. */
function copyOf(card: HTMLElement): HTMLElement {
  const face = card.cloneNode(true) as HTMLElement;
  const claims = [...card.querySelectorAll<HTMLElement>(".sm-claim")];
  [...face.querySelectorAll<HTMLElement>(".sm-claim")].forEach((claim, at) => {
    const look = window.getComputedStyle(claims[at]!);
    for (const property of CLAIM_LOOK) claim.style.setProperty(property, look.getPropertyValue(property));
    claim.classList.replace("sm-claim", "sm-settling-claim");
  });
  face.classList.add("sm-settling-face");
  return strip(face);
}

/** Takes the copy off the page once its fade ends, or a second after it would have, as in a tab in the background. */
function removeAfter(element: HTMLElement, animation: Animation): void {
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    element.remove();
  };
  const timing = animation.effect?.getComputedTiming().endTime;
  const timer = window.setTimeout(end, Number(timing ?? 0) + 1000);
  void animation.finished.then(end, end);
}

function rowOf(scene: ParentNode, argument: string): HTMLElement | null {
  return scene.querySelector<HTMLElement>(`.sm-board .sm-idea[data-node="${CSS.escape(argument)}"]`);
}

function drawn(element: Element): boolean {
  const { width, height } = element.getBoundingClientRect();
  return width > 0 || height > 0;
}
