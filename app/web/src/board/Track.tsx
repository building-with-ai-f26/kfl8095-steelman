// An unfolded row: its wordings side by side, best articulated first, each
// with its articulation vote (the prototype's track and trackAxis). A row
// with one wording has nothing to compare, so it has no articulation vote.

import { Fragment } from "react";
import type { VersionRow } from "@steelman/shared";
import { Axis, Icon } from "../icons.tsx";
import type { Writer } from "./Board.tsx";
import { Card } from "./Card.tsx";
import { WordingSlot } from "./Forms.tsx";
import { articulationShown, isLiveVersion, short } from "./display.ts";
import type { BoardSession, SessionState } from "./session.ts";
import { VoteControl } from "./Vote.tsx";

export function TrackAxis({ count, at, onFold }: { count: number; at: number; onFold(): void }) {
  const fold = (
    <button type="button" className="sm-fold cursor-interaction" aria-label="Fold versions back into the stack" data-tooltip="Fold back" onClick={onFold}>
      <Icon name="fold-horizontal" />
    </button>
  );
  if (count < 2) {
    return (
      <div className="sm-track-axis sm-track-note">
        <span>
          <Icon name="chevrons-right" />
          Only one wording so far. Write a second to compare them.
        </span>
        {fold}
      </div>
    );
  }
  // Phones swap the axis for which wording you're on, and dots while they fit.
  return (
    <div className="sm-track-axis">
      <Axis kind="h" start="best articulation" end="weaker" />
      <div className="sm-pager" aria-live="polite">
        <span className="sm-pager-text">{`${at + 1} of ${count}${at === 0 ? " · best articulated" : ""}`}</span>
        {count <= 8 && (
          <span className="sm-pager-dots" aria-hidden="true">
            {Array.from({ length: count }, (_, index) => (
              <i key={index} data-on={index === at ? "" : undefined} />
            ))}
          </span>
        )}
      </div>
      {fold}
    </div>
  );
}

interface TrackProps {
  versions: VersionRow[];
  argumentId: string;
  writer: Writer;
  state: SessionState;
  session: BoardSession;
  onAt(index: number): void;
}

export function Track({ versions, argumentId, writer, state, session, onAt }: TrackProps) {
  const single = versions.length < 2;
  const key = `w:${argumentId}`;
  return (
    <div
      className="sm-track"
      role="region"
      tabIndex={0}
      aria-label="Versions, best articulated first"
      onScroll={(event) => {
        const track = event.currentTarget;
        const faces = [...track.querySelectorAll<HTMLElement>(".sm-version-face")];
        const left = track.getBoundingClientRect().left;
        const nearest = faces.reduce((best, face, index) => (Math.abs(face.getBoundingClientRect().left - left) < Math.abs(faces[best]!.getBoundingClientRect().left - left) ? index : best), 0);
        onAt(nearest);
      }}
    >
      {versions.map((version) => {
        const { vote, score } = articulationShown(version, state.mine);
        return (
          <Fragment key={version.id}>
            <div className="sm-version-vote" data-vote-for={version.id}>
              {!single && isLiveVersion(version) && (
                <VoteControl
                  axis="h"
                  group={`Articulation: ${short(version.wording ?? "")}`}
                  value={vote}
                  score={score}
                  forward="Better articulated"
                  back="Less well articulated"
                  onVote={(value) => session.act({ kind: "articulation", versionId: version.id, value })}
                />
              )}
            </div>
            <Card version={version} inTrack />
          </Fragment>
        );
      })}
      <WordingSlot
        open={writer.writing?.kind === "wording" && writer.writing.argumentId === argumentId}
        draft={writer.draft(key)}
        onOpen={() => writer.start({ kind: "wording", argumentId })}
        onChange={(draft) => writer.change(key, draft)}
        onClose={writer.close}
        onAdd={(draft) => writer.addWording(argumentId, draft)}
      />
    </div>
  );
}
