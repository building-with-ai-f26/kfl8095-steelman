// One wording on its card, as the prototype draws it (cardFace in
// docs/prototype/source/steelman-refined.html): the claim, who wrote it, and
// the credibility meter. A wording someone deleted keeps its place, marked.
// The wording opens the card, which is what a version's link points at
// (M-06); its ⋯ menu copies that link. Evidence in the open card, and the
// menu's other actions, come with M1-9 and M1-10.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { credibility, credibilityLabel } from "@steelman/shared";
import type { VersionRow } from "@steelman/shared";
import { Icon } from "../icons.tsx";
import { isLiveVersion } from "./display.ts";

/** Which version is open, which one a link just brought into view, and what a card can ask of the board. */
export interface Opening {
  open: string | null;
  arrived: string | null;
  toggle(versionId: string): void;
  copyLink(versionId: string): void;
}

export function Card({ version, opening, inTrack = false }: { version: VersionRow; opening: Opening; inTrack?: boolean }) {
  const face = inTrack ? " sm-version-face" : "";
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
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
  const open = opening.open === version.id;
  const reveal = `sm-reveal-${version.id}`;
  return (
    <article className={`sm-card${face}${open ? " sm-expanded" : ""}${opening.arrived === version.id ? " sm-arrived" : ""}`} data-card={version.id}>
      <button
        ref={menuButton}
        type="button"
        className="sm-card-menu-button cursor-interaction"
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-label="Options for this version"
        data-tooltip="Options"
        onClick={() => setMenu(!menu)}
      >
        <Icon name="ellipsis" />
      </button>
      {menu ? (
        <VersionMenu
          trigger={menuButton}
          onClose={() => setMenu(false)}
          onCopyLink={() => {
            setMenu(false);
            menuButton.current?.focus();
            opening.copyLink(version.id);
          }}
        />
      ) : null}
      <button type="button" className="sm-claim-button cursor-interaction" aria-expanded={open} aria-controls={reveal} onClick={() => opening.toggle(version.id)}>
        <span className="sm-claim">{version.wording}</span>
      </button>
      <Byline version={version} />
      <div className="sm-card-meta">
        <span className="sm-cred-group">
          <Meter yes={version.yes} no={version.no} />
        </span>
      </div>
      <div className="sm-card-reveal" id={reveal} hidden={!open}>
        {open ? (
          <section className="sm-card-context" aria-label="Context">
            <h3>Context</h3>
            {version.context ? <p className="sm-brief">{version.context}</p> : <p className="sm-meta">No context yet.</p>}
          </section>
        ) : null}
      </div>
    </article>
  );
}

/**
 * A version's ⋯ menu. It hangs from the board's main region, under its
 * button, so a row that scrolls sideways can't clip it (the prototype's
 * positionMenu, which hangs it from the page's root, outside any landmark).
 * Escape closes it and puts the cursor back on ⋯; a click elsewhere closes it.
 */
function VersionMenu({ trigger, onClose, onCopyLink }: { trigger: RefObject<HTMLButtonElement | null>; onClose(): void; onCopyLink(): void }) {
  const menu = useRef<HTMLDivElement>(null);
  const root = document.getElementById("sm-content");

  useLayoutEffect(() => {
    const element = menu.current;
    const button = trigger.current;
    if (!element || !button || !root) return;
    const rootBox = (element.offsetParent ?? document.body).getBoundingClientRect();
    const box = button.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.round(box.right - rootBox.left - element.offsetWidth))}px`;
    element.style.top = `${Math.round(box.bottom - rootBox.top + 4)}px`;
    element.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [trigger, root]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const here = document.activeElement;
      if (event.key !== "Escape" || !(menu.current?.contains(here) || trigger.current === here)) return;
      onClose();
      trigger.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [trigger, onClose]);

  if (!root) return null;
  return createPortal(
    <div ref={menu} className="sm-menu" role="menu" aria-label="Version options">
      <button type="button" role="menuitem" className="sm-menu-item cursor-interaction" onClick={onCopyLink}>
        <Icon name="link" />
        <span>Copy link</span>
      </button>
    </div>,
    root,
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
