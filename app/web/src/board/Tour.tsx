// The tour (L-02): the prototype's tour of the three votes, on the real
// board's cards (positionTour and tourNote in
// docs/prototype/source/steelman-refined.html). The page dims around the
// vote a step points at, with a short note beside it: Skip tour, Back, and
// Next or Done; the right and left arrows go on and back, and Escape skips.
// While it's open, the board under it waits: the note is a modal dialog, so
// Tab stays in it and a click elsewhere does nothing. The board decides which
// row is unfolded for each step (Board.tsx); this draws the spotlight on it.
//
// Its markup and classes are the prototype's, so the prototype's styles
// apply, its reduced-motion rule included: the spotlight then jumps from step
// to step instead of gliding.

import { useCallback, useEffect, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icons.tsx";
import { tourNote } from "./tour-steps.ts";
import type { TourStep } from "./tour-steps.ts";

/** How long an unfolding row takes to settle (the tokens' --sm-slow, 420 ms), and a little more: then the spotlight is measured again. */
const SETTLE_MS = 500;
/** Below this width a board shows one column, and an unfolded row one wording at a time (the prototype's 640 px). */
const NARROW = 640;
/** Room around the spotlit cards, and between them and the note. */
const PAD = 8;
const GAP = 12;

interface TourProps {
  steps: TourStep[];
  at: number;
  onNext(): void;
  onBack(): void;
  /** Skip tour, or Escape; also when what a step points at is no longer on the board. */
  onSkip(): void;
}

export function Tour({ steps, at, onNext, onBack, onSkip }: TourProps) {
  const step = steps[at]!;
  const last = at === steps.length - 1;
  const hole = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const lineId = useId();
  const root = document.getElementById("steelman-study");
  // The board's handlers change with each of its renders (it polls); the spotlight moves only when the step does.
  const on = useRef({ onNext, onBack, onSkip });
  on.current = { onNext, onBack, onSkip };

  /** Frames what the step points at, puts the note below it (above, if there's no room below), and, for a new step, brings it into view. */
  const place = useCallback(
    (fresh: boolean) => {
      if (!root || !hole.current || !tip.current) return;
      const elements = targets(step, root.offsetWidth < NARROW);
      if (elements.length === 0) return on.current.onSkip();
      if (fresh) (document.querySelector(`.sm-card[data-card="${CSS.escape(step.versionId)}"]`) ?? elements[0])!.scrollIntoView({ block: "center", inline: "nearest" });
      const outer = root.getBoundingClientRect();
      const boxes = elements.map((element) => element.getBoundingClientRect());
      const left = Math.max(4, Math.min(...boxes.map((box) => box.left)) - outer.left - PAD);
      const top = Math.min(...boxes.map((box) => box.top)) - outer.top - PAD;
      const right = Math.min(outer.width - 4, Math.max(...boxes.map((box) => box.right)) - outer.left + PAD);
      const bottom = Math.max(...boxes.map((box) => box.bottom)) - outer.top + PAD;
      Object.assign(hole.current.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
      const note = tip.current;
      const below = bottom + GAP + note.offsetHeight <= root.offsetHeight;
      note.style.left = `${Math.min(Math.max(GAP, left), outer.width - note.offsetWidth - GAP)}px`;
      note.style.top = `${below || top - note.offsetHeight - GAP < 0 ? bottom + GAP : top - note.offsetHeight - GAP}px`;
      if (fresh) {
        note.scrollIntoView({ block: "nearest" });
        note.querySelector<HTMLButtonElement>("[data-tour-next]")?.focus({ preventScroll: true });
      }
    },
    [root, step],
  );

  // Each step: placed before it's painted, then again once an unfolding row has settled.
  useLayoutEffect(() => {
    place(true);
    const settle = window.setTimeout(() => place(false), SETTLE_MS);
    return () => window.clearTimeout(settle);
  }, [place]);
  useEffect(() => {
    const resized = () => place(false);
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
  }, [place]);

  // The keys work wherever the cursor is, as in the prototype, except while typing.
  useEffect(() => {
    const pressed = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest("input, textarea, select")) return;
      if (event.key === "Escape") on.current.onSkip();
      else if (event.key === "ArrowRight") on.current.onNext();
      else if (event.key === "ArrowLeft") {
        if (at > 0) on.current.onBack();
      }
      else if (event.key === "Tab") keepTabInside(event, tip.current);
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("keydown", pressed, true);
    return () => document.removeEventListener("keydown", pressed, true);
  }, [at]);

  if (!root) return null;
  const { icon, title, line } = tourNote(step);
  return createPortal(
    <div className="sm-tour">
      <div className="sm-tour-catch" />
      <div ref={hole} className="sm-tour-hole" aria-hidden="true" />
      <div ref={tip} className="sm-tour-tip" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={lineId}>
        <div className="sm-tour-dots" aria-hidden="true">
          {steps.map((_, index) => (
            <span key={index} aria-current={index === at ? "true" : undefined} />
          ))}
        </div>
        <p className="sm-sr">{`Step ${at + 1} of ${steps.length}`}</p>
        <h2 id={titleId}>
          <Icon name={icon} size={16} />
          {title}
        </h2>
        <p id={lineId}>{line}</p>
        <footer>
          <button type="button" className="sm-link-button cursor-interaction" onClick={onSkip}>
            Skip tour
          </button>
          {at > 0 ? (
            <button type="button" className="sm-button cursor-interaction" onClick={onBack}>
              Back
            </button>
          ) : null}
          <button type="button" className="sm-button sm-solid cursor-interaction" data-tour-next="" onClick={onNext}>
            {last ? "Done" : "Next"}
          </button>
        </footer>
      </div>
    </div>,
    root,
  );
}

/** What a step frames: the vote it's about, and not the card, which left it unclear what was meant (the builder's review). */
function targets(step: TourStep, narrow: boolean): Element[] {
  const find = (selector: string) => document.querySelector(selector);
  const vote = (id: string) => find(`[data-vote-for="${CSS.escape(id)}"]`);
  const row = `[data-node="${CSS.escape(step.argumentId)}"]`;
  const found = (() => {
    if (step.kind === "importance") return [find(`${row} > .sm-vote`)];
    // On a phone an unfolded row shows one wording at a time, so the step frames just the leader's vote.
    if (step.kind === "articulation") return narrow ? [vote(step.versionId)] : [vote(step.versionId), vote(step.nextId)];
    return [find(`.sm-card[data-card="${CSS.escape(step.versionId)}"] .sm-cred-group`)];
  })();
  return found.filter((element): element is Element => element !== null);
}

/** Tab and Shift+Tab go round the note's buttons. */
function keepTabInside(event: KeyboardEvent, note: HTMLElement | null) {
  const buttons = [...(note?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
  if (buttons.length === 0) return;
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.shiftKey ? (at <= 0 ? buttons.length - 1 : at - 1) : (at + 1) % buttons.length;
  buttons[next]!.focus();
}
