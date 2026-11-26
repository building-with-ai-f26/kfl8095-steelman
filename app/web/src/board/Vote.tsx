// One control for importance (vertical) and articulation (horizontal), as the prototype draws it. An arrow pressed
// presses in, and the number rolls when the reader votes or when a poll brings other people's votes (M3d-8).

import { useLayoutEffect, useRef } from "react";
import { Icon } from "../icons.tsx";
import { blockedProps } from "./display.ts";
import type { Blocked, Vote } from "./display.ts";
import type { SessionState } from "./session.ts";
import { pressIn, roll } from "./vote-motion.ts";

interface VoteProps {
  axis: "v" | "h";
  group: string;
  value: Vote;
  score: number;
  forward: string;
  back: string;
  onVote(value: Vote): void;
  /** Set when the reader's role can't vote. */
  blocked?: Blocked | null;
  /**
   * The latest poll, when it changed this number by votes, from pollRecount(). The number rolls once, in the render
   * where that poll first arrives. A number that changes for any other reason (a combine, a separation, an Undo, a vote
   * refused, or Update) changes at once, as it does when it's first drawn, even while the same poll's view is shown.
   */
  polled?: Recount | null;
}

/** One control for importance (vertical) and articulation (horizontal). Pressing your vote again withdraws it. */
export function VoteControl({ axis, group, value, score, forward, back, onVote, blocked = null, polled = null }: VoteProps) {
  const number = useRef<HTMLSpanElement>(null);
  /** The number as last drawn, so that a change rolls from it. */
  const shown = useRef(score);
  /** Set by the reader's own press until its number is drawn. */
  const pressed = useRef(false);
  /** The poll this number last saw, so that each poll rolls it at most once. */
  const seen = useRef<Recount | null>(polled);
  useLayoutEffect(() => {
    const was = shown.current;
    shown.current = score;
    const own = pressed.current;
    pressed.current = false;
    const fresh = polled !== null && polled !== seen.current;
    seen.current = polled;
    if (was !== score && (own || fresh) && number.current) roll(number.current, was, score, axis);
  }, [score, polled, axis]);
  const button = (direction: 1 | -1, label: string) => (
    <button
      type="button"
      className="sm-vote-btn cursor-interaction"
      aria-pressed={value === direction}
      aria-label={label}
      data-tooltip={label}
      {...blockedProps(blocked)}
      onClick={(event) => {
        if (blocked) return;
        pressIn(event.currentTarget);
        pressed.current = true;
        onVote(value === direction ? null : direction);
      }}
    >
      <Icon name={direction > 0 ? "chevron-up" : "chevron-down"} />
    </button>
  );
  return (
    <div className="sm-vote" data-axis={axis} role="group" aria-label={group}>
      {button(1, forward)}
      <span ref={number} className="sm-vote-score" aria-label={`Net ${score}`}>
        {score}
      </span>
      {button(-1, back)}
    </div>
  );
}

/** The counts one poll changed by votes (SessionState.recounted). */
type Recount = NonNullable<SessionState["recounted"]>;

/** The latest poll, when it changed this argument's or wording's count by votes and the screen still shows its view. */
export function pollRecount(state: SessionState, id: string): Recount | null {
  return state.recounted !== null && state.recounted.view === state.view && state.recounted.ids.has(id) ? state.recounted : null;
}
