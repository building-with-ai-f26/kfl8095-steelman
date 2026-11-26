// An unfolded row: its wordings side by side, best articulated first, each
// with its articulation vote (the prototype's track and trackAxis). A row
// with one wording has nothing to compare, so it has no articulation vote.

import { Fragment } from "react";
import type { VersionRow } from "@steelman/shared";
import { Axis, Icon } from "../icons.tsx";
import type { Writer } from "./Board.tsx";
import { Card } from "./Card.tsx";
import type { Opening } from "./Card.tsx";
import { WordingSlot } from "./Forms.tsx";
import { articulationShown, isLiveVersion, short, whyNot } from "./display.ts";
import { useReader } from "../reader.ts";
import type { BoardSession, SessionState } from "./session.ts";
import { VoteControl, pollRecount } from "./Vote.tsx";

export function TrackAxis({ count, at, onFold }: { count: number; at: number; onFold(): void }) {
  const fold = (
    <button type="button" className="sm-fold cursor-interaction" aria-label="Fold versions back into the stack" data-tooltip="Fold back" onClick={onFold}>
      <Icon name="fold-horizontal" />
    </button>
  );
  if (count < 2) {
    return (
      // Nothing to compare yet, and nothing said about it (the builder, Nov 22): only the way to fold it back.
      <div className="sm-track-axis sm-track-note">
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
  opening: Opening;
  onAt(index: number): void;
}

export function Track({ versions, argumentId, writer, state, session, opening, onAt }: TrackProps) {
  const reader = useReader();
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
                  blocked={whyNot(reader, state.role, "vote", state.closing?.closed)}
                  polled={pollRecount(state, version.id)}
                />
              )}
            </div>
            <Card version={version} opening={opening} inTrack row={argumentId} />
          </Fragment>
        );
      })}
      {/* Someone who can't write isn't offered a new version at all, as in the prototype. */}
      {whyNot(reader, state.role, "add", state.closing?.closed) ? null : (
        <WordingSlot
          open={writer.writing?.kind === "wording" && writer.writing.argumentId === argumentId}
          draft={writer.draft(key)}
          onOpen={() => writer.start({ kind: "wording", argumentId })}
          onChange={(draft) => writer.change(key, draft)}
          onClose={writer.close}
          onAdd={(draft) => writer.addWording(argumentId, draft)}
        />
      )}
    </div>
  );
}
