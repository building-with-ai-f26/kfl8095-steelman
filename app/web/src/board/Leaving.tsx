// Your own cards arriving and leaving (M3d-4; A-03, A-05, A-06, J-05, M-15).
//
// The argument or wording you add rises 8 px and fades in, as the
// prototype's render(..., 'added') does (docs/prototype/source/
// steelman-refined.html), and the add slot after it makes room with
// motion.ts's flip(). The prototype has no exit, so the version you delete
// copies Gmail's archive, where the row folds shut, and Google Keep's
// delete: a copy of its card, drawn over where it was, fades its wording
// and eases its height into the dashed placeholder Card.tsx draws for a
// deleted version, and then fades and leaves the page. The copy is hidden
// from screen readers and from the cursor, as Comments.tsx's folding thread
// is, and it carries nothing that names a row or a card. The board itself
// takes today's layout at once, so the rows below take their places at once
// and nothing animates on them. Undo plays the exit backwards on the real
// card. Under reduced motion there is no copy and nothing plays.

import { useLayoutEffect, useRef } from "react";
import { Icon } from "../icons.tsx";
import { duration, flip, play, reducedMotion } from "./motion.ts";
import type { Rect, Rects } from "./motion.ts";

/** The entrance, as the prototype's render(..., 'added') plays it on the new card. */
const ENTRANCE: Keyframe[] = [
  { transform: "translateY(8px)", opacity: 0 },
  { transform: "none", opacity: 1 },
];
/** How far past the card the reverse's clip reaches, so that the card's shadow is never cut. */
const SHADOW_PX = 24;
/** The placeholder's height before one has been measured: its note's two 14 px paddings, a 16 px line, and its border. */
let stripPx = 46;

/** A deleted card's copy, drawn for a moment over where the card was. */
export interface Leaving {
  key: number;
  versionId: string;
  /** Who wrote it, for the placeholder's note. */
  author: string;
  /** Where the card was drawn, in the scene's own pixels. */
  at: Rect;
  /** The card as it was drawn, with nothing left that names it or takes the cursor. */
  face: HTMLElement;
}

let made = 0;

/**
 * Copies the version's card as it's drawn now, for its exit, or answers null under reduced motion or when the card
 * isn't on screen. The copy keeps the card's look and drops every id, data and ARIA attribute, so no lookup by row,
 * card, or name finds it.
 */
export function copyOf(versionId: string, author: string, scene: HTMLElement): Leaving | null {
  if (reducedMotion()) return null;
  const card = scene.querySelector<HTMLElement>(`.sm-card[data-card="${CSS.escape(versionId)}"]`);
  if (!card) return null;
  const box = card.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  // The copies are placed in their layer, which covers the scene.
  const layer = scene.querySelector(":scope > .sm-leaving-layer");
  if (!layer) return null;
  const origin = layer.getBoundingClientRect();
  const face = card.cloneNode(true) as HTMLElement;
  for (const element of [face, ...face.querySelectorAll("*")]) {
    for (const { name } of [...element.attributes]) {
      if (name === "id" || name === "for" || name === "name" || name === "tabindex" || name.startsWith("data-") || name.startsWith("aria-")) element.removeAttribute(name);
    }
  }
  face.classList.remove("sm-arrived", "sm-commenting");
  return { key: ++made, versionId, author, at: { left: box.left - origin.left, top: box.top - origin.top, width: box.width, height: box.height }, face };
}

/** The copies leaving the board, in a layer of the scene, under its cards, that screen readers and the cursor skip. */
export function LeavingCopies({ leaving, onLeft }: { leaving: readonly Leaving[]; onLeft(key: number): void }) {
  return (
    <div className="sm-leaving-layer ph-no-capture" aria-hidden="true" inert>
      {leaving.map((copy) => (
        <LeavingCopy key={`leave-${copy.key}`} copy={copy} onLeft={onLeft} />
      ))}
    </div>
  );
}

/**
 * One copy: its wording fades while its height eases into the dashed placeholder's, on --sm-fold, and then it fades on
 * --sm-leave and leaves the page. Each animation rests at what the copy looks like once it has gone, so that nothing
 * flashes between its end and the copy's removal.
 */
function LeavingCopy({ copy, onLeft }: { copy: Leaving; onLeft(key: number): void }) {
  const box = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const note = useRef<HTMLParagraphElement>(null);
  const left = useRef(onLeft);
  left.current = onLeft;
  useLayoutEffect(() => {
    const outer = box.current!;
    const inner = holder.current!;
    inner.replaceChildren(copy.face);
    const fold = duration("fold", outer);
    const leave = duration("leave", outer);
    // The placeholder is as tall as its note, inside its dashed border.
    const strip = note.current!.offsetHeight + outer.offsetHeight - outer.clientHeight;
    stripPx = strip;
    outer.style.height = `${strip}px`;
    outer.style.opacity = "0";
    inner.style.opacity = "0";
    const animations = [
      play(outer, [{ height: `${copy.at.height}px` }, { height: `${strip}px` }], { duration: fold }),
      play(inner, [{ opacity: 1 }, { opacity: 0 }], { duration: fold }),
      play(outer, [{ opacity: 1 }, { opacity: 1, offset: fold / (fold + leave) }, { opacity: 0 }], { duration: fold + leave, easing: "linear" }),
    ].filter((animation): animation is Animation => animation !== null);
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      left.current(copy.key);
    };
    void Promise.all(animations.map((animation) => animation.finished)).then(end, end);
    // In case the browser never finishes them, as in a tab in the background: a second after they'd have ended.
    const timer = window.setTimeout(end, fold + leave + 1000);
    // Only a real finish or the backstop takes the copy away: cancelling them here, as React's StrictMode does on its
    // second mount in development, must not.
    return () => {
      done = true;
      window.clearTimeout(timer);
      for (const animation of animations) animation.cancel();
    };
  }, [copy]);
  return (
    <div ref={box} className="sm-leaving" style={{ left: copy.at.left, top: copy.at.top, width: copy.at.width }}>
      <p ref={note} className="sm-leaving-note">
        <Icon name="trash-2" />
        {`Deleted by ${copy.author}`}
      </p>
      <div ref={holder} className="sm-leaving-face" style={{ width: copy.at.width, height: copy.at.height }} />
    </div>
  );
}

/**
 * Undo's reverse of the exit, on the real card once it's back: it grows from the placeholder's strip at its top to its
 * full height while its wording fades in, on --sm-fold. It ends with no clip and full opacity, which is the card as
 * it's drawn without motion, and it never takes the cursor away from the card.
 */
export function comeBack(card: Element): Animation | null {
  const { height } = card.getBoundingClientRect();
  const hidden = Math.max(0, height - stripPx);
  return play(
    card,
    [
      { clipPath: `inset(-${SHADOW_PX}px -${SHADOW_PX}px ${hidden}px -${SHADOW_PX}px)`, opacity: 0 },
      { clipPath: `inset(-${SHADOW_PX}px -${SHADOW_PX}px -${SHADOW_PX}px -${SHADOW_PX}px)`, opacity: 1 },
    ],
    { duration: duration("fold", card) },
  );
}

/** Something the reader added that hasn't arrived yet, and where the things after it were. */
export interface Arriving {
  /** The new card's version ID. */
  versionId: string;
  /** What holds the new card and the things after it: its column, or its row's track. */
  scope: string;
  /** The things after it that make room. */
  movers: string;
  /** Whether the reader's queue has held it, so that one it no longer holds was refused or has arrived. */
  queued: boolean;
  /** Where the movers were, relative to the scope, at the last render. */
  before: { origin: Rect; scroll: { left: number; top: number }; rects: Rects } | null;
}

/** Records where the movers are now, relative to their scope, so that a scroll or a move above doesn't count. */
export function measure(arriving: Arriving): void {
  const scope = document.querySelector<HTMLElement>(arriving.scope);
  if (!scope) {
    arriving.before = null;
    return;
  }
  const rects = new Map<string | Element, Rect>();
  for (const element of scope.querySelectorAll(arriving.movers)) {
    const box = element.getBoundingClientRect();
    if (box.width || box.height) rects.set(element, { left: box.left, top: box.top, width: box.width, height: box.height });
  }
  arriving.before = { origin: scope.getBoundingClientRect(), scroll: { left: scope.scrollLeft, top: scope.scrollTop }, rects };
}

/**
 * Plays the entrance on the new card, and moves the things after it from where they were, as flip() does. Answers
 * the animations, for Wires' redrawWhile(); none under reduced motion.
 */
export function arrive(card: Element, arriving: Arriving): Animation[] {
  const entrance = play(card, ENTRANCE);
  const scope = document.querySelector<HTMLElement>(arriving.scope);
  const before = arriving.before;
  if (!scope || !before) return entrance ? [entrance] : [];
  // Where each mover would be now had nothing arrived: its old place, carried by any move or scroll of its scope.
  const now = scope.getBoundingClientRect();
  const dx = now.left - before.origin.left - (scope.scrollLeft - before.scroll.left);
  const dy = now.top - before.origin.top - (scope.scrollTop - before.scroll.top);
  const rects = new Map<string | Element, Rect>();
  for (const [key, rect] of before.rects) rects.set(key, { ...rect, left: rect.left + dx, top: rect.top + dy });
  const { animations } = flip(rects, scope, { selector: arriving.movers });
  return entrance ? [entrance, ...animations] : animations;
}
