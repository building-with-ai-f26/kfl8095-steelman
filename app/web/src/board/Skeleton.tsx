// While the board's first read is on its way (M3d-10, A-01): placeholder
// blocks in the board's own layout, the dark question, the option headers,
// and two or three cards under each, as GitHub's Primer draws skeletons for a
// large area that is loading and YouTube draws grey blocks where its videos
// will be (from memory). One status sentence says it to a screen reader, as
// Primer asks, and the blocks themselves are hidden from it and marked busy;
// the page keeps its main region and a heading, unseen, as every page has.
// The status region is drawn empty and its sentence arrives just after, as
// Primer asks, because many screen readers read only a change to a region
// that is already on the page. The blocks fade
// in after twice --sm-slow, so a quick read shows nothing, and then pulse gently;
// under reduced motion they are drawn at once and stay still. Nothing here
// uses the board's own classes, so no code that finds the board's cards,
// rows, or scene finds these.

import { useEffect, useState } from "react";

/** How many placeholder cards each column shows. */
const CARDS = [3, 2] as const;

export function BoardSkeleton() {
  const [said, setSaid] = useState(false);
  useEffect(() => setSaid(true), []);
  return (
    <main className="sm-skeleton">
      <h1 className="sm-live">Steelman</h1>
      <div className="sm-skeleton-scene" aria-hidden="true" aria-busy="true">
        <div className="sm-skeleton-head">
          <span className="sm-skeleton-bar sm-skeleton-question" />
          <span className="sm-skeleton-bar sm-skeleton-pill" />
        </div>
        <div className="sm-skeleton-board">
          <div className="sm-skeleton-sides">
            <span />
            <span />
          </div>
          {CARDS.map((cards, column) => (
            <div key={column} className="sm-skeleton-column">
              <div className="sm-skeleton-column-head">
                <span className="sm-skeleton-bar" />
              </div>
              {Array.from({ length: cards }, (_, row) => (
                <div key={row} className="sm-skeleton-row">
                  <span className="sm-skeleton-vote" />
                  <div className="sm-skeleton-card">
                    <span className="sm-skeleton-bar" />
                    <span className="sm-skeleton-bar" />
                    <span className="sm-skeleton-bar sm-skeleton-author" />
                    <span className="sm-skeleton-foot">
                      <span className="sm-skeleton-bar" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="sm-live" role="status">
        {said ? "The steelman is loading." : ""}
      </p>
    </main>
  );
}
