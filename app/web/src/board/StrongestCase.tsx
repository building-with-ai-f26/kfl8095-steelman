// Strongest case (E-01): each option's top three arguments, each in its best
// wording, from the newest shared order the reader holds (shared/src/strongest.ts),
// in the prototype's markup. Choosing one opens it on the board.

import { Fragment } from "react";
import { strongestCase } from "@steelman/shared";
import type { CaseItem, QueuedAction, ReaderView } from "@steelman/shared";
import { Icon } from "../icons.tsx";
import { Meter } from "./Card.tsx";
import { Texture } from "./Texture.tsx";
import { assessmentShown, columns, editShown, importanceShown } from "./display.ts";

interface StrongestCaseProps {
  view: ReaderView;
  /** The reader's own deletions, off the screen at once. */
  leftOut: readonly string[];
  /** The reader's choices not yet back, newest first. */
  mine: readonly QueuedAction[];
  onOpen(item: CaseItem): void;
}

export function StrongestCase({ view, leftOut, mine, onOpen }: StrongestCaseProps) {
  return columns(view).map((option, index) => {
    const { items, total } = strongestCase(view, option.id, leftOut);
    const rest = total - items.length;
    return (
      <Fragment key={option.id}>
        {index > 0 && <div className="sm-col-gap" aria-hidden="true" />}
        <section className={`sm-column sm-case-column${index === 0 ? " sm-first" : ""}`} data-option={option.id} aria-label={`The case for ${option.name}`}>
          <Texture />
          <div className="sm-column-head">
            <h2>{option.name}</h2>
          </div>
          <p className="sm-case-caption">
            {items.length === 0 ? "The case for this option" : `Its ${items.length === 1 ? "argument" : `${items.length} most important arguments`}, in the best wording`}
          </p>
          {items.map((item, rank) => (
            <CaseCard key={item.argumentId} item={item} rank={rank + 1} view={view} mine={mine} onOpen={onOpen} />
          ))}
          {total === 0 ? (
            <p className="sm-case-note sm-case-thin">No arguments yet: this side has no case.</p>
          ) : total < 2 ? (
            <p className="sm-case-note sm-case-thin">Only one argument so far. This side needs a stronger case.</p>
          ) : null}
          {rest > 0 && <p className="sm-case-note">{`${rest} more ${rest === 1 ? "argument" : "arguments"} on the board.`}</p>}
        </section>
      </Fragment>
    );
  });
}

function CaseCard({ item, rank, view, mine, onOpen }: { item: CaseItem; rank: number; view: ReaderView; mine: readonly QueuedAction[]; onOpen(item: CaseItem): void }) {
  const version = editShown(view.rows.versions[item.versionId]!, mine);
  const { yes, no } = assessmentShown(version, mine);
  const { score } = importanceShown(view.rows.arguments[item.argumentId]!, mine);
  return (
    <section className="sm-idea sm-case-item" data-node={item.argumentId}>
      <span className="sm-case-rank" aria-hidden="true">
        {rank}
      </span>
      <article className="sm-card sm-case-card" data-card={item.versionId}>
        {/* ph-no-capture: PostHog's autocapture sends a clicked button's text, and this text is what someone wrote. */}
        <button type="button" className="sm-claim-button cursor-interaction ph-no-capture" aria-label={`Argument ${rank}: ${version.wording}. Open it on the board.`} onClick={() => onOpen(item)}>
          <span className="sm-claim">{version.wording}</span>
        </button>
        <div className="sm-card-meta">
          <Meter yes={yes} no={no} />
          <span className="sm-case-facts">
            <span title={`Importance: ${score} net votes`}>
              <Icon name="arrow-up-narrow-wide" />
              <span className="sm-sr">Importance: </span>
              {score}
            </span>
            {item.wordings > 1 && (
              <span title={`The best-articulated of ${item.wordings} wordings`}>
                <Icon name="layers" />
                {`best of ${item.wordings}`}
                <span className="sm-sr"> wordings</span>
              </span>
            )}
          </span>
        </div>
      </article>
    </section>
  );
}
