// One control for importance (vertical) and articulation (horizontal), as the prototype draws it.

import { Icon } from "../icons.tsx";
import { blockedProps } from "./display.ts";
import type { Blocked, Vote } from "./display.ts";

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
}

/** One control for importance (vertical) and articulation (horizontal). Pressing your vote again withdraws it. */
export function VoteControl({ axis, group, value, score, forward, back, onVote, blocked = null }: VoteProps) {
  const button = (direction: 1 | -1, label: string) => (
    <button
      type="button"
      className="sm-vote-btn cursor-interaction"
      aria-pressed={value === direction}
      aria-label={label}
      data-tooltip={label}
      {...blockedProps(blocked)}
      onClick={() => blocked || onVote(value === direction ? null : direction)}
    >
      <Icon name={direction > 0 ? "chevron-up" : "chevron-down"} />
    </button>
  );
  return (
    <div className="sm-vote" data-axis={axis} role="group" aria-label={group}>
      {button(1, forward)}
      <span className="sm-vote-score" aria-label={`Net ${score}`}>
        {score}
      </span>
      {button(-1, back)}
    </div>
  );
}
