// A vote's motion and Update's ring (M3d-8; B-01, B-02, M-15). An arrow
// presses in, to 0.92 and back at --sm-fast. Its number rolls at --sm-medium:
// an aria-hidden copy of the old figure slides out in the vote's direction
// while the real number, which already holds the new value, slides in from
// the other side. Each is clipped to the number's own box, so neither is drawn
// outside it. A count that changes on a poll rolls the same way. On Update,
// each card that someone else added or edited since the last Update wears a
// ring that fades over 1.6 s, as the prototype's flashIds does
// (docs/prototype/source/steelman-refined.html). The ring is added to the
// card's own shadow, so a card that moves on Update shows its lift as well.
// Everything goes through motion.ts's play(), so nothing plays under reduced
// motion, and nothing holds its end, so the last frame is today's layout. No
// word appears with any of it (B-06): the prototype's vote message stays
// unbuilt.
//
// Reddit's arrows and GitHub's reactions show only the pressed control and the
// new number, with no word, and YouTube's like count rolls its digits; the
// roll here follows YouTube's, upright for importance and sideways for
// articulation, whose arrows point sideways.

import { curve, duration, play, reducedMotion } from "./motion.ts";

/** How long Update's ring takes to fade, as the prototype's flashIds plays it; --sm-ring (1.4 s) is a link's ring. */
export const UPDATE_RING_MS = 1600;
/** How far the arrow presses in. */
const PRESSED = "0.92";

/** The arrow presses in and comes back, at --sm-fast. */
export function pressIn(button: Element): Animation | null {
  return play(button, [{ scale: "1" }, { scale: PRESSED }, { scale: "1" }], { duration: duration("fast", button), easing: curve("ease", button) });
}

/** The roll still running on each number, so that the next one on it stops it first. */
const rolling = new WeakMap<HTMLElement, { animations: Animation[]; copy: HTMLElement }>();

/**
 * Rolls a number that changed from `was` to what it shows now. Upright (`v`), a higher number arrives from below and
 * the old one leaves upward; on its side (`h`), where "better" points left, a higher number arrives from the right and
 * the old one leaves to the left. The copy of the old number is removed once its animation ends or is cancelled.
 */
export function roll(score: HTMLElement, was: number, now: number, axis: "v" | "h"): Animation[] {
  // A roll still running on this number stops first, so that the number is measured where it rests and only one copy
  // is drawn over it.
  const running = rolling.get(score);
  if (running) {
    rolling.delete(score);
    for (const animation of running.animations) animation.cancel();
    running.copy.remove();
  }
  if (was === now || reducedMotion()) return [];
  // Toward the start of the axis (up, or left) for a higher number; the other way for a lower one.
  const leaving = now > was ? -100 : 100;
  const copy = document.createElement("span");
  copy.className = "sm-vote-roll";
  copy.setAttribute("aria-hidden", "true");
  copy.textContent = String(was);
  const style = window.getComputedStyle(score);
  // The longhands, since not every browser gives the computed `font` shorthand.
  Object.assign(copy.style, { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, fontStyle: style.fontStyle, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing });
  copy.style.color = style.color;
  copy.style.left = "0px";
  copy.style.top = "0px";
  score.after(copy);
  // Drawn exactly over the number, wherever its containing block is.
  const at = copy.getBoundingClientRect();
  const box = score.getBoundingClientRect();
  Object.assign(copy.style, { left: `${box.left - at.left}px`, top: `${box.top - at.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  const timing: KeyframeAnimationOptions = { duration: duration("medium", score), easing: curve("ease", score) };
  const out = play(copy, [slid(axis, 0, true), slid(axis, leaving, true)], timing);
  if (!out) {
    copy.remove();
    return [];
  }
  const gone = () => copy.remove();
  void out.finished.then(gone, gone);
  const into = play(score, [slid(axis, -leaving, false), slid(axis, 0, false)], timing);
  const animations = into ? [out, into] : [out];
  const entry = { animations, copy };
  rolling.set(score, entry);
  const over = () => {
    if (rolling.get(score) === entry) rolling.delete(score);
  };
  void Promise.allSettled(animations.map((animation) => animation.finished)).then(over);
  return animations;
}


/**
 * One frame of a roll: moved by `by` percent of its own size along the axis, and clipped to the box it rests in, so
 * that whatever has moved outside the box isn't drawn. The copy is drawn only while it rolls: at rest it's invisible.
 */
function slid(axis: "v" | "h", by: number, copy: boolean): Keyframe {
  const away = Math.abs(by);
  const inset = axis === "v" ? (by < 0 ? `${away}% 0% 0% 0%` : `0% 0% ${away}% 0%`) : by < 0 ? `0% 0% 0% ${away}%` : `0% ${away}% 0% 0%`;
  return { translate: axis === "v" ? `0 ${by}%` : `${by}% 0`, clipPath: `inset(${inset})`, ...(copy ? { opacity: "1" } : {}) };
}

/** The rings still fading, so that the next Update stops them before it measures. */
const ringing = new Set<Animation>();

/**
 * Rings each card once, a 3 px ring of --sm-ink that fades from 35 percent to nothing over 1.6 s, added to whatever
 * shadow the card wears, its lift included.
 */
export function ring(cards: Iterable<Element>): Animation[] {
  const ink = window.getComputedStyle(document.documentElement).getPropertyValue("--sm-ink").trim() || "#242424";
  const started: Animation[] = [];
  for (const card of cards) {
    const animation = play(card, [{ boxShadow: `0 0 0 3px color-mix(in srgb, ${ink} 35%, transparent)` }, { boxShadow: `0 0 0 3px color-mix(in srgb, ${ink} 0%, transparent)` }], {
      duration: UPDATE_RING_MS,
      easing: "ease-out",
      composite: "add",
    });
    if (!animation) continue;
    ringing.add(animation);
    const done = () => ringing.delete(animation);
    void animation.finished.then(done, done);
    started.push(animation);
  }
  return started;
}

/** Stops every ring still fading, so that each card is drawn in its own shadow again. */
export function stopRings(): void {
  for (const animation of ringing) animation.cancel();
  ringing.clear();
}

/**
 * The cards to ring for these wordings: each one's own card where it's drawn, or else the card its row shows, so that
 * a wording added to a folded row rings the row. A wording whose column is hidden has no card to ring.
 */
export function cardsFor(root: ParentNode, wordings: Iterable<{ id: string; argumentId: string }>): Set<Element> {
  const cards = new Set<Element>();
  for (const { id, argumentId } of wordings) {
    const own = root.querySelector(`.sm-card[data-card="${CSS.escape(id)}"]`);
    const card = own && own.getClientRects().length > 0 ? own : root.querySelector(`[data-node="${CSS.escape(argumentId)}"] > .sm-card-wrap > .sm-card`);
    if (card && card.getClientRects().length > 0) cards.add(card);
  }
  return cards;
}
