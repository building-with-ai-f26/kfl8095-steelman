// One wording on its card, as the prototype draws it (cardFace in
// docs/prototype/source/steelman-refined.html): the claim, who wrote it, and
// the credibility meter. A wording someone deleted keeps its place, marked.
// The wording opens the card, which is what a version's link points at
// (M-06). Its ⋯ menu (A-12) offers what the reader's role allows: the author
// edits in place and deletes; anyone else who may write suggests a revised
// version; everyone copies the link. An open card shows its context, its
// evidence, and the assessment (Evidence.tsx). The card shows the reader's
// own edit and assessment as soon as they're made.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { credibility, credibilityLabel } from "@steelman/shared";
import type { VersionRow } from "@steelman/shared";
import { Icon } from "../icons.tsx";
import type { IconName } from "../icons.tsx";
import { assessmentShown, editShown, isLiveVersion } from "./display.ts";
import type { MenuItem } from "./display.ts";
import { DraftCard, cleanDraft } from "./Forms.tsx";
import type { DraftText } from "./Forms.tsx";
import { Evidence, SourceCount } from "./Evidence.tsx";
import type { EvidenceBoard } from "./Evidence.tsx";

/** Which version is open, which one a link just brought into view, what its evidence needs, and what a card can ask of the board. */
export interface Opening {
  open: string | null;
  arrived: string | null;
  evidence: EvidenceBoard;
  toggle(versionId: string): void;
  copyLink(versionId: string): void;
  menu: CardMenu;
}

/** What a card's ⋯ menu does (A-12), and which wording its author is editing. */
export interface CardMenu {
  items(version: VersionRow): MenuItem[];
  editing: string | null;
  edit(versionId: string): void;
  save(version: VersionRow, draft: DraftText): void;
  cancel(versionId: string): void;
  suggest(version: VersionRow): void;
  remove(version: VersionRow): void;
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
  const edited = editShown(version, opening.evidence.mine);
  const assessment = assessmentShown(edited, opening.evidence.mine);
  const shown: VersionRow = { ...edited, yes: assessment.yes, no: assessment.no, myAssessment: assessment.mine };
  if (opening.menu.editing === version.id) return <EditCard version={shown} className={face.trim()} menu={opening.menu} />;
  const choose = (item: MenuItem) => {
    setMenu(false);
    if (item === "copyLink") {
      menuButton.current?.focus();
      opening.copyLink(version.id);
    } else if (item === "edit") opening.menu.edit(version.id);
    else if (item === "suggest") opening.menu.suggest(shown);
    else opening.menu.remove(shown);
  };
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
        <VersionMenu trigger={menuButton} items={opening.menu.items(shown)} onClose={() => setMenu(false)} onChoose={choose} />
      ) : null}
      {/* ph-no-capture: PostHog's autocapture sends a clicked button's text, and this text is what someone wrote. */}
      <button type="button" className="sm-claim-button cursor-interaction ph-no-capture" aria-expanded={open} aria-controls={reveal} onClick={() => opening.toggle(version.id)}>
        <span className="sm-claim">{shown.wording}</span>
      </button>
      <Byline version={shown} />
      <div className="sm-card-meta">
        <span className="sm-cred-group">
          <Meter yes={shown.yes} no={shown.no} />
        </span>
        {version.sourceIds.length > 0 ? (
          <div className="sm-card-tools">
            <SourceCount count={version.sourceIds.length} />
          </div>
        ) : null}
      </div>
      <div className="sm-card-reveal" id={reveal} hidden={!open}>
        {open ? (
          <>
            <section className="sm-card-context" aria-label="Context">
              <h3>Context</h3>
              {shown.context ? <p className="sm-brief">{shown.context}</p> : <p className="sm-meta">No context yet.</p>}
            </section>
            <Evidence version={shown} board={opening.evidence} />
          </>
        ) : null}
      </div>
    </article>
  );
}

/**
 * The author's edit, in the wording's place (A-06), as the prototype draws it.
 * Votes stay; an assessed wording's credibility score resets, so once the
 * text changes the form says so.
 */
function EditCard({ version, className, menu }: { version: VersionRow; className: string; menu: CardMenu }) {
  const [draft, setDraft] = useState<DraftText>({ wording: version.wording ?? "", context: version.context ?? "" });
  const clean = cleanDraft(draft);
  const changes = clean !== null && (clean.wording !== version.wording || clean.context !== (version.context ?? ""));
  const note: ReactNode =
    changes && version.yes + version.no > 0 ? (
      <p className="sm-source-warn sm-edit-warn" role="note">
        <Icon name="triangle-alert" />
        The credibility score resets when you save.
      </p>
    ) : null;
  return (
    <DraftCard
      className={className}
      label="Edit your version"
      wordingLabel="Your version"
      contextLabel="Context (optional)"
      contextPlaceholder="Context (optional)"
      closeLabel="Cancel editing"
      addLabel="Save changes"
      closeTooltip="Cancel"
      addTooltip="Save"
      note={note}
      draft={draft}
      onChange={setDraft}
      onClose={() => menu.cancel(version.id)}
      onAdd={(ready) => menu.save(version, ready)}
    />
  );
}

const MENU_ITEMS: Record<MenuItem, { icon: IconName; label: string }> = {
  edit: { icon: "pencil", label: "Edit wording and context" },
  suggest: { icon: "pen-line", label: "Suggest a revised version" },
  copyLink: { icon: "link", label: "Copy link" },
  deleteVersion: { icon: "trash-2", label: "Delete version" },
  deleteArgument: { icon: "trash-2", label: "Delete argument" },
};

/**
 * A version's ⋯ menu. It hangs from the board's main region, under its
 * button, so a row that scrolls sideways can't clip it (the prototype's
 * positionMenu, which hangs it from the page's root, outside any landmark).
 * The arrow keys, Home, and End move between its items. Escape closes it
 * and puts the cursor back on ⋯; Tab leaves and closes it, moving on from ⋯;
 * a click elsewhere closes it. It's placed once, so a row
 * scrolling sideways or the window changing size closes it too.
 */
interface VersionMenuProps {
  trigger: RefObject<HTMLButtonElement | null>;
  items: MenuItem[];
  onClose(): void;
  onChoose(item: MenuItem): void;
}

function VersionMenu({ trigger, items, onClose, onChoose }: VersionMenuProps) {
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
      if (event.key === "Escape" && (menu.current?.contains(here) || trigger.current === here)) {
        onClose();
        trigger.current?.focus();
      }
      // The browser then moves the cursor on from ⋯, so Tab goes where it would without the menu.
      if (event.key === "Tab" && menu.current?.contains(here)) {
        onClose();
        trigger.current?.focus();
      }
      const all = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      const at = all.indexOf(here as HTMLElement);
      const to = at < 0 ? undefined : { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[event.key];
      if (to !== undefined) {
        event.preventDefault();
        all[(to + all.length) % all.length]?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) onClose();
    };
    // A scroll of anything holding ⋯, other than the page itself, moves ⋯ out from under the menu.
    const onScroll = (event: Event) => {
      const scrolled = event.target;
      if (scrolled instanceof Element && scrolled.contains(trigger.current)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [trigger, onClose]);

  if (!root) return null;
  return createPortal(
    <div ref={menu} className="sm-menu" role="menu" aria-label="Version options">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          role="menuitem"
          className="sm-menu-item cursor-interaction"
          // The prototype colours a delete's icon by this.
          data-action={item === "deleteVersion" || item === "deleteArgument" ? "delete-card" : undefined}
          onClick={() => onChoose(item)}
        >
          <Icon name={MENU_ITEMS[item].icon} />
          <span>{MENU_ITEMS[item].label}</span>
        </button>
      ))}
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
