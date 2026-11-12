// One wording on its card, as the prototype draws it (cardFace in
// docs/prototype/source/steelman-refined.html): the claim, who wrote it, and
// the credibility meter. A wording someone deleted keeps its place, marked.

import { useState } from "react";
import { credibility, credibilityLabel } from "@steelman/shared";
import type { VersionRow } from "@steelman/shared";
import { Icon } from "../icons.tsx";
import { isLiveVersion } from "./display.ts";

export function Card({ version, inTrack = false }: { version: VersionRow; inTrack?: boolean }) {
  const face = inTrack ? " sm-version-face" : "";
  if (!isLiveVersion(version)) {
    return (
      <article className={`sm-card sm-removed sm-gone${face}`} data-card={version.id}>
        <p className="sm-removed-note">
          <Icon name="trash-2" />
          {version.hidden ? "Removed by an editor" : `Deleted by ${version.authorName}`}
        </p>
      </article>
    );
  }
  return (
    <article className={`sm-card${face}`} data-card={version.id}>
      <div className="sm-claim-button">
        <span className="sm-claim">{version.wording}</span>
      </div>
      <Byline version={version} />
      <div className="sm-card-meta">
        <span className="sm-cred-group">
          <Meter yes={version.yes} no={version.no} />
        </span>
      </div>
    </article>
  );
}

/** Who wrote it. An edited wording says so; "edited" shows the wording it replaced. */
function Byline({ version }: { version: VersionRow }) {
  const [showPrevious, setShowPrevious] = useState(false);
  return (
    <>
      <p className="sm-byline">
        {version.authorName}
        {version.previousWording !== null && (
          <>
            {" · "}
            <button type="button" className="sm-link-button sm-edited cursor-interaction" aria-expanded={showPrevious} onClick={() => setShowPrevious(!showPrevious)}>
              edited
            </button>
          </>
        )}
      </p>
      {showPrevious && version.previousWording !== null && (
        <p className="sm-prev">
          <del>{version.previousWording}</del>
        </p>
      )}
    </>
  );
}

/** Four segments, one filled per quarter of assessments that support the wording; dashed under five; empty gray when unreviewed. */
function Meter(counts: { yes: number; no: number }) {
  const c = credibility(counts);
  const label = credibilityLabel(c);
  const color = c.percent === null ? "#9a9a9a" : c.percent <= 50 ? mix("--sm-cred-weak", "--sm-cred-mid", c.percent / 50) : mix("--sm-cred-mid", "--sm-cred-strong", (c.percent - 50) / 50);
  const width = 22;
  const gap = 1.5;
  const cell = (width - gap * 3) / 4;
  return (
    <span className="sm-cred" role="img" aria-label={label} title={label}>
      <span className="sm-meter">
        <svg width={width} height="8" viewBox={`0 0 ${width} 8`} aria-hidden="true">
          {[0, 1, 2, 3].map((i) => {
            const lit = i < c.segments;
            return (
              <rect
                key={i}
                x={(i * (cell + gap)).toFixed(2)}
                y="0"
                width={cell.toFixed(2)}
                height="8"
                rx="1.5"
                style={lit ? { fill: color } : { fill: "none", stroke: color }}
                strokeWidth={lit ? undefined : 1}
                strokeDasharray={lit || c.total >= 5 ? undefined : "1.6 1.4"}
              />
            );
          })}
        </svg>
      </span>
      <span className="sm-cred-copy">
        <span className={`sm-percentage${c.percent === null ? " sm-unreviewed-copy" : ""}`}>{c.percent === null ? "Unreviewed" : `${c.percent}%`}</span>
        {c.percent !== null && <span className={`sm-count${c.few ? " sm-few" : ""}`}>{`· ${c.total}${c.few ? " · few" : ""}`}</span>}
      </span>
    </span>
  );
}

function mix(from: string, to: string, share: number): string {
  return `color-mix(in srgb, var(${from}), var(${to}) ${Math.round(share * 100)}%)`;
}
