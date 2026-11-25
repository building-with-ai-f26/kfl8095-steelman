// Rows unfold and fold, and card details open and close (M3d-5; A-04, A-02,
// M-15), ported from the prototype's render() kinds 'unfold', 'fold' and
// 'detail', and its foldOut and collapseOut
// (docs/prototype/source/steelman-refined.html).
//
// Compare eases the board's columns from where they were to where
// boardColumns() puts them, eases the lead card's width, grows the row's axis,
// and slides each other version, its vote with it, out from the lead card's x,
// 45 ms after the one before it. The fan copies macOS stacks, which fan out
// from where they sit (from memory): a version shows only to the right of the
// lead card, as if it came out from under it. Fold closes the row at once, as
// today, so that every control and the screen reader see the folded row; an
// inert copy of the versions, drawn where they were, slides them back into the
// lead card and fades, and then leaves the page; only then do the columns, the
// lead card's width, and the rows below ease back, as the prototype awaits
// foldOut before its render(..., 'fold'). A card's details ease their
// height open; closing hides the real reveal at once, as today, and an inert
// copy beside it eases shut. The disclosure copies GOV.UK's Details component
// (checked live): the control keeps the focus and says whether it's open, and
// nothing else is announced, so focus and the spoken sentence stay what they
// are today.
//
// Unlike the prototype, nothing that a screen reader or an accessibility check
// reads fades: a half-faded wording would fail a contrast check. Only the
// copies, which are hidden from both, fade. Every animation goes through
// motion.ts's play(), so nothing plays and nothing is copied under reduced
// motion, and none holds its end, so each ends in exactly the layout the app
// draws without motion. Only the reader's own Compare, Fold, and a card's
// wording or chevron animate: the tour, a link, History, and Strongest case
// open rows and cards at once, as today.

import { drawnRect, duration, play, reducedMotion } from "./motion.ts";
import type { Rect } from "./motion.ts";

/** How long each version waits after the one before it, as the prototype's unfold does. */
export const UNFOLD_STAGGER_MS = 45;
/** The most turns the stagger takes after the first version, so that the last version on a long row starts within 270 ms. */
const MOST_TURNS = 6;
/** How far past each version the clip reaches, so that its shadow is never cut. */
const SHADOW_PX = 24;

/** What a row toggle needs from the screen as it was, before React draws the new one. */
export interface RowToggle {
  /** The row that unfolds, if any. */
  unfolding: string | null;
  /** The row that folds, if any: the one open until now. */
  folding: string | null;
  /** The board's columns as they're drawn now. */
  template: string;
  /**
   * Each toggled row, and each row still moving from the toggle before: the room it takes as drawn now, its height
   * and its bottom margin as they stand mid-motion, and its lead card's ID and width.
   */
  rows: Map<string, { space: number; lead: string | null; width: number }>;
  /** The folding row's axis, its height and margin, which the row gives back as it closes. */
  axisSpace: number;
  /** The folding row's versions, copied where they're drawn now, with how far each slides to reach the lead card. */
  copy: { box: HTMLElement; slides: { element: HTMLElement; dx: number }[] } | null;
}

/** The animations the last toggle started, which the next toggle, or Update, stops first. */
let running: Animation[] = [];

/** Stops a row's unfold or fold still running, and takes away any copy still folding. Update calls it before it measures. */
export function stopRowMotion(scene: ParentNode | null): void {
  for (const animation of running) animation.cancel();
  running = [];
  scene?.querySelector(":scope > .sm-folding-layer")?.replaceChildren();
}

/**
 * Records the screen as it's drawn before a row unfolds or folds: the board's columns, the rows' heights and lead
 * widths, and a copy of the folding row's versions. Answers null under reduced motion, when nothing moves.
 */
export function beforeToggle(scene: HTMLElement, open: string | null, id: string): RowToggle | null {
  if (reducedMotion()) return null;
  const board = scene.querySelector<HTMLElement>(".sm-board");
  if (!board) return null;
  const unfolding = open === id ? null : id;
  const folding = open;
  const rows = new Map<string, { space: number; lead: string | null; width: number }>();
  // A row the toggle before is still moving loses that motion when this one starts, so it starts from where it's drawn too.
  const moving = running.map((animation) => (animation.effect as KeyframeEffect | null)?.target?.closest<HTMLElement>(".sm-idea[data-node]")?.dataset.node);
  for (const argument of new Set([unfolding, folding, ...moving])) {
    const node = argument ? rowOf(scene, argument) : null;
    if (!node || !argument) continue;
    const lead = leadOf(node);
    const space = drawnRect(node).height + parseFloat(window.getComputedStyle(node).marginBottom);
    rows.set(argument, { space, lead: lead?.dataset.card ?? null, width: lead ? lead.getBoundingClientRect().width : 0 });
  }
  const node = folding ? rowOf(scene, folding) : null;
  const axis = node?.querySelector<HTMLElement>(":scope > .sm-track-axis");
  const axisSpace = axis ? axis.getBoundingClientRect().height + parseFloat(window.getComputedStyle(axis).marginBottom) : 0;
  return { unfolding, folding, template: window.getComputedStyle(board).gridTemplateColumns, rows, axisSpace, copy: node ? copyTrack(scene, node) : null };
}

/**
 * Plays the toggle once React has drawn it, and answers the animations, for Wires' redrawWhile(). Every final value
 * is measured before anything plays, and every first frame is the screen as it was drawn before.
 */
export function playToggle(scene: HTMLElement, toggle: RowToggle): Animation[] {
  stopRowMotion(null);
  // A row unfolding again takes its folding copy away at once.
  const layer = scene.querySelector<HTMLElement>(":scope > .sm-folding-layer");
  const board = scene.querySelector<HTMLElement>(".sm-board");
  if (!board) return [];
  const slow = duration("slow", board);
  const medium = duration("medium", board);
  // A fold alone waits for its copy to slide home before the columns, the lead card, and the rows below move, as the
  // prototype awaits foldOut before its render(..., 'fold'). Until then each holds its first frame.
  const after: KeyframeAnimationOptions = toggle.folding && !toggle.unfolding ? { duration: slow, delay: medium, fill: "backwards" } : { duration: slow };
  const started: (Animation | null)[] = [];

  // What the new layout is, before anything plays on it.
  const template = window.getComputedStyle(board).gridTemplateColumns;
  const leads = new Map<string, { face: HTMLElement; from: number; to: number }>();
  for (const [argument, was] of toggle.rows) {
    const face = was.lead ? scene.querySelector<HTMLElement>(`.sm-card[data-card="${CSS.escape(was.lead)}"]`) : null;
    if (face && rowOf(scene, argument)?.contains(face)) leads.set(argument, { face, from: was.width, to: face.getBoundingClientRect().width });
  }
  const opened = toggle.unfolding ? rowOf(scene, toggle.unfolding) : null;
  const axis = opened?.querySelector<HTMLElement>(":scope > .sm-track-axis") ?? null;
  const axisTo = axis ? { height: axis.getBoundingClientRect().height, margin: window.getComputedStyle(axis).marginBottom } : null;

  // The board's columns, where they change (a phone's board has one column), and each lead card's width.
  if (template !== toggle.template) started.push(play(board, [{ gridTemplateColumns: toggle.template }, { gridTemplateColumns: template }], after));
  for (const { face, from, to } of leads.values()) if (Math.abs(from - to) >= 0.5) started.push(play(face, [{ width: `${from}px` }, { width: `${to}px` }], after));
  // The unfolding row's axis grows from nothing, as the prototype's does.
  if (axis && axisTo) started.push(play(axis, [{ height: "0px", marginBottom: "0px" }, { height: `${axisTo.height}px`, marginBottom: axisTo.margin }], { duration: slow }));
  // The folding row gives its axis's room back as the copy slides home, as the prototype's foldOut shrinks its axis.
  const closed = toggle.folding ? rowOf(scene, toggle.folding) : null;
  if (closed && toggle.axisSpace > 0) {
    const top = parseFloat(window.getComputedStyle(closed).paddingTop);
    started.push(play(closed, [{ paddingTop: `${top + toggle.axisSpace}px` }, { paddingTop: `${top}px` }], { duration: medium }));
  }

  // The versions slide out from the lead card's x, measured in this first frame, each clipped to the right of the
  // lead card, as if it came out from under it.
  if (opened && toggle.unfolding) {
    const track = opened.querySelector<HTMLElement>(":scope > .sm-card-wrap > .sm-track");
    const lead = track?.querySelector<HTMLElement>(":scope > .sm-version-face");
    if (track && lead) {
      const box = lead.getBoundingClientRect();
      [...track.children].slice(2).forEach((element, index) => {
        const left = element.getBoundingClientRect().left;
        const turn = Math.min(Math.floor(index / 2), MOST_TURNS);
        started.push(
          play(
            element,
            [
              { transform: `translateX(${round(box.left - left)}px)`, clipPath: `inset(-${SHADOW_PX}px -${SHADOW_PX}px -${SHADOW_PX}px ${round(box.width)}px)` },
              { transform: "none", clipPath: `inset(-${SHADOW_PX}px)` },
            ],
            { duration: slow, delay: turn * UNFOLD_STAGGER_MS, fill: "backwards" },
          ),
        );
      });
    }
  }

  // Each row starts taking the room it took as drawn, mid-motion included, so the rows below start where they were
  // and ease into their places. Its margin here is its own, since the motion before was stopped above.
  for (const [argument, was] of toggle.rows) {
    const node = rowOf(scene, argument);
    if (!node) continue;
    const margin = parseFloat(window.getComputedStyle(node).marginBottom);
    const extra = was.space - (node.getBoundingClientRect().height + margin);
    if (Math.abs(extra) < 0.5) continue;
    started.push(play(node, [{ marginBottom: `${margin + extra}px` }, { marginBottom: `${margin}px` }], after));
  }

  // The folding row's copy slides each version back to the lead card's x and fades, and then leaves the page.
  if (toggle.copy && layer) started.push(...foldCopy(layer, toggle.copy, medium));

  running = started.filter((animation): animation is Animation => animation !== null);
  return running;
}

/**
 * Copies the folding row's versions after its lead, as drawn now, into a box where its track was, which clips them as
 * the track did. The copy keeps their look and drops every id, data and ARIA attribute, so no lookup by row, card, or
 * name finds it, and the layer it goes in is hidden from screen readers and the cursor.
 */
function copyTrack(scene: HTMLElement, node: HTMLElement): RowToggle["copy"] {
  const track = node.querySelector<HTMLElement>(":scope > .sm-card-wrap > .sm-track");
  const layer = scene.querySelector<HTMLElement>(":scope > .sm-folding-layer");
  const lead = track?.querySelector<HTMLElement>(":scope > .sm-version-face");
  if (!track || !layer || !lead) return null;
  const origin = layer.getBoundingClientRect();
  const clip = track.getBoundingClientRect();
  const x = lead.getBoundingClientRect().left;
  const box = document.createElement("div");
  box.className = "sm-folding-track";
  place(box, { left: clip.left - origin.left, top: clip.top - origin.top, width: clip.width, height: clip.height });
  const slides: { element: HTMLElement; dx: number }[] = [];
  for (const child of [...track.children].slice(2)) {
    const rect = child.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const element = strip(child.cloneNode(true) as HTMLElement);
    place(element, { left: rect.left - clip.left, top: rect.top - clip.top, width: rect.width, height: rect.height });
    box.append(element);
    slides.push({ element, dx: round(x - rect.left) });
  }
  return slides.length ? { box, slides } : null;
}

/** Plays the fold on the copy: each version slides to the lead card's x and fades; the copy goes once all have. */
function foldCopy(layer: HTMLElement, copy: NonNullable<RowToggle["copy"]>, medium: number): Animation[] {
  layer.append(copy.box);
  const animations: Animation[] = [];
  for (const { element, dx } of copy.slides) {
    // At rest it's already gone, so that nothing flashes between its end and its removal.
    element.style.opacity = "0";
    const animation = play(element, [{ transform: "none", opacity: 1 }, { transform: `translateX(${dx}px)`, opacity: 0 }], { duration: medium });
    if (animation) animations.push(animation);
  }
  removeAfter(copy.box, animations, medium);
  return animations;
}

/**
 * Copies a card's open details, before they close, for the copy that eases shut beside the real ones. Answers null
 * under reduced motion, or when the card's details aren't open on screen.
 */
export function holdReveal(scene: HTMLElement, versionId: string): { versionId: string; copy: HTMLElement; height: number } | null {
  if (reducedMotion()) return null;
  const reveal = document.getElementById(`sm-reveal-${versionId}`);
  if (!reveal || reveal.hidden || !scene.contains(reveal)) return null;
  const height = reveal.getBoundingClientRect().height;
  if (!height) return null;
  const copy = strip(reveal.cloneNode(true) as HTMLElement);
  copy.classList.add("sm-folding-reveal", "ph-no-capture");
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  return { versionId, copy, height };
}

/**
 * Plays a card's details opening, its reveal's height from nothing to its own, and the copy of the ones closing,
 * beside its real reveal, which is already hidden, from their height to nothing. Answers the animations.
 */
export function playReveal(scene: HTMLElement, opened: string | null, closing: ReturnType<typeof holdReveal>): Animation[] {
  const started: Animation[] = [];
  const medium = duration("medium", scene);
  if (closing) {
    const real = document.getElementById(`sm-reveal-${closing.versionId}`);
    if (real && real.hidden && scene.contains(real)) {
      real.after(closing.copy);
      closing.copy.style.height = "0px";
      const shut = play(closing.copy, [{ height: `${closing.height}px` }, { height: "0px" }], { duration: medium });
      if (shut) started.push(shut);
      removeAfter(closing.copy, shut ? [shut] : [], medium);
    }
  }
  const reveal = opened ? document.getElementById(`sm-reveal-${opened}`) : null;
  if (reveal && !reveal.hidden && scene.contains(reveal)) {
    const height = reveal.getBoundingClientRect().height;
    const grow = play(reveal, [{ height: "0px" }, { height: `${height}px` }], { duration: medium });
    if (grow) started.push(grow);
  }
  return started;
}

/** Takes a copy off the page once its animations end, or a second after they would have, as in a tab in the background. */
function removeAfter(element: HTMLElement, animations: Animation[], ms: number): void {
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    element.remove();
  };
  const timer = window.setTimeout(end, ms + 1000);
  void Promise.all(animations.map((animation) => animation.finished)).then(end, end);
}

/** Drops every attribute that names an element or takes the cursor, from the copy and everything in it (settle.ts uses it too). */
export function strip(copy: HTMLElement): HTMLElement {
  for (const element of [copy, ...copy.querySelectorAll("*")]) {
    for (const { name } of [...element.attributes]) {
      if (name === "id" || name === "for" || name === "name" || name === "tabindex" || name.startsWith("data-") || name.startsWith("aria-")) element.removeAttribute(name);
    }
  }
  copy.classList.remove("sm-arrived", "sm-commenting");
  return copy;
}

/** Draws a copy at a rect in its layer's own pixels. */
export function place(element: HTMLElement, rect: Rect): void {
  Object.assign(element.style, { position: "absolute", boxSizing: "border-box", margin: "0", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
}

function rowOf(scene: ParentNode, argument: string): HTMLElement | null {
  return scene.querySelector<HTMLElement>(`.sm-idea[data-node="${CSS.escape(argument)}"]`);
}

/** A row's lead card: the first version in its track when it's unfolded, or its own card when it's folded. */
function leadOf(node: HTMLElement): HTMLElement | null {
  return node.querySelector<HTMLElement>(":scope > .sm-card-wrap > .sm-track > .sm-version-face") ?? node.querySelector<HTMLElement>(":scope > .sm-card-wrap > .sm-card[data-card]");
}

function round(px: number): number {
  return Math.round(px * 100) / 100;
}
