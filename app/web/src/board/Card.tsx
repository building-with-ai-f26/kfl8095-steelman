// One wording on its card, as the prototype draws it (cardFace in
// docs/prototype/source/steelman-refined.html): the claim, who wrote it, and
// the credibility meter. A wording someone deleted keeps its place, marked.
// The wording opens the card, which is what a version's link points at
// (M-06). Its ⋯ menu (A-12) offers what the reader's role allows: the author
// edits in place and deletes; anyone else who may write suggests a revised
// version; everyone copies the link. An open card shows its context, its
// evidence, and the assessment (Evidence.tsx). The card shows the reader's
// own edit and assessment as soon as they're made.

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { credibility, credibilityLabel } from "@steelman/shared";
import type { ReportReason, VersionRow } from "@steelman/shared";
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
  /** Report someone else's wording (M2-3), or withdraw the reader's report. */
  report(version: VersionRow, reason: ReportReason, note: string): void;
  withdrawReport(version: VersionRow): void;
  /** An Editor's or the Owner's (M2-4): hide a wording with a reason, or restore it. */
  hide(version: VersionRow, reason: ReportReason): void;
  restore(version: VersionRow): void;
  /** An Editor's or the Owner's (M3a-7): pick the argument to combine it with, or drag it there; or separate it. */
  combine(version: VersionRow, via: "menu" | "handle"): void;
  separate(version: VersionRow): void;
  /** Brings an argument into view: from a row or a wording combined into it. */
  goTo(argumentId: string): void;
  dragStart(version: VersionRow): void;
  dragEnd(): void;
  /** What a wording someone else moved says in its old place, until Update, or null when it hasn't moved. */
  moved(version: VersionRow, row: string): ReactNode;
}

/** @param row The argument the card is drawn in: a wording someone else moved stays there, marked, until Update (M3a-7). */
export function Card({ version, opening, inTrack = false, row }: { version: VersionRow; opening: Opening; inTrack?: boolean; row?: string }) {
  const face = inTrack ? " sm-version-face" : "";
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  /** The flag opens the menu at Hide's reasons (M2-4), when the reader may hide. */
  const [startAt, setStartAt] = useState<"items" | "hideReasons">("items");
  if (version.hidden && !version.deleted) {
    // Hidden by a moderator (M2-4), in the prototype's words. An Editor or the Owner also sees what it said, and Restore.
    const items = opening.menu.items(version);
    return (
      <article className={`sm-card sm-removed${face}`} data-card={version.id}>
        {items.includes("restore") ? (
          <>
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
                items={items}
                onClose={() => setMenu(false)}
                onChoose={(item) => {
                  setMenu(false);
                  menuButton.current?.focus();
                  if (item === "restore") opening.menu.restore(version);
                  else if (item === "copyLink") opening.copyLink(version.id);
                }}
                onReport={() => undefined}
                onHide={() => undefined}
              />
            ) : null}
          </>
        ) : null}
        <p className="sm-removed-note">
          <Icon name="eye-off" />
          {`Removed by a moderator · ${version.hiddenReason ? REASONS[version.hiddenReason].label : "Removed"}`}
        </p>
        {/* ph-no-capture: PostHog's autocapture would send this text, which someone wrote. */}
        {version.wording !== null ? <p className="sm-removed-claim ph-no-capture">{version.wording}</p> : null}
      </article>
    );
  }
  if (!isLiveVersion(version)) {
    return (
      <article className={`sm-card sm-removed sm-gone${face}`} data-card={version.id}>
        <p className="sm-removed-note">
          <Icon name="trash-2" />
          {`Deleted by ${version.authorName}`}
        </p>
      </article>
    );
  }
  const moved = row !== undefined ? opening.menu.moved(version, row) : null;
  if (moved) {
    return (
      <article className={`sm-card sm-removed sm-gone${face}`} data-card={version.id}>
        {moved}
      </article>
    );
  }
  const open = opening.open === version.id;
  const reveal = `sm-reveal-${version.id}`;
  const edited = editShown(version, opening.evidence.mine);
  const assessment = assessmentShown(edited, opening.evidence.mine);
  // A source the reader removed is off the card already: held for Undo, or on its way and not yet back.
  const removed = new Set(opening.evidence.mine.flatMap((action) => (action.kind === "uncite" && action.versionId === version.id ? [action.sourceId] : [])));
  if (opening.evidence.removing?.versionId === version.id) removed.add(opening.evidence.removing.sourceId);
  const sourceIds = removed.size > 0 ? edited.sourceIds.filter((id) => !removed.has(id)) : edited.sourceIds;
  const shown: VersionRow = { ...edited, sourceIds, yes: assessment.yes, no: assessment.no, myAssessment: assessment.mine };
  const mayCombine = opening.menu.items(shown).includes("combine");
  if (opening.menu.editing === version.id) return <EditCard version={shown} className={face.trim()} menu={opening.menu} />;
  const choose = (item: MenuItem) => {
    setMenu(false);
    if (item === "copyLink") {
      menuButton.current?.focus();
      opening.copyLink(version.id);
    } else if (item === "edit") opening.menu.edit(version.id);
    else if (item === "suggest") opening.menu.suggest(shown);
    else if (item === "combine") opening.menu.combine(shown, "menu");
    else if (item === "separate") opening.menu.separate(shown);
    else if (item === "withdrawReport") {
      menuButton.current?.focus();
      opening.menu.withdrawReport(shown);
    } else opening.menu.remove(shown);
  };
  const report = (reason: ReportReason, note: string) => {
    setMenu(false);
    menuButton.current?.focus();
    opening.menu.report(shown, reason, note);
  };
  const hide = (reason: ReportReason) => {
    setMenu(false);
    menuButton.current?.focus();
    opening.menu.hide(shown, reason);
  };

  return (
    <article className={`sm-card${face}${open ? " sm-expanded" : ""}${opening.arrived === version.id ? " sm-arrived" : ""}`} data-card={version.id}>
      {shown.reports ? (
        <ReportFlag
          reports={shown.reports}
          onOpen={
            opening.menu.items(shown).includes("hide")
              ? () => {
                  setStartAt("hideReasons");
                  setMenu(true);
                }
              : null
          }
        />
      ) : shown.myReport ? (
        // The reporter's own confirmation, as the prototype's "Reported · Undo" on a comment: Withdraw is in the menu (the builder, Nov 20).
        <span className="sm-reported-tag">
          <Icon name="flag" />
          You reported this
        </span>
      ) : null}
      <button
        ref={menuButton}
        type="button"
        className="sm-card-menu-button cursor-interaction"
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-label="Options for this version"
        data-tooltip="Options"
        onClick={() => {
          setStartAt("items");
          setMenu(!menu);
        }}
      >
        <Icon name="ellipsis" />
      </button>
      {menu ? (
        <VersionMenu
          trigger={menuButton}
          items={opening.menu.items(shown)}
          onClose={() => setMenu(false)}
          onChoose={choose}
          onReport={report}
          onHide={hide}
          startAt={startAt}
        />
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
        {shown.sourceIds.length > 0 || mayCombine ? (
          <div className="sm-card-tools">
            {mayCombine ? (
              // The prototype's merge handle: drag it onto the argument this one repeats, or press it to pick one (M3a-7).
              <button
                type="button"
                className="sm-source-button sm-merge-handle cursor-interaction"
                draggable
                aria-label="Combine with another argument"
                data-tooltip="Drag it onto the argument it repeats, or press to pick one."
                onClick={() => opening.menu.combine(shown, "handle")}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", version.id);
                  const face = event.currentTarget.closest(".sm-card");
                  if (face) event.dataTransfer.setDragImage(face, 30, 20);
                  opening.menu.dragStart(shown);
                }}
                onDragEnd={() => opening.menu.dragEnd()}
              >
                <Icon name="merge" />
              </button>
            ) : null}
            {shown.sourceIds.length > 0 ? <SourceCount count={shown.sourceIds.length} /> : null}
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
  combine: { icon: "merge", label: "Combine with another argument" },
  separate: { icon: "split", label: "Make it a separate argument" },
  deleteVersion: { icon: "trash-2", label: "Delete version" },
  deleteArgument: { icon: "trash-2", label: "Delete argument" },
  report: { icon: "flag", label: "Report" },
  withdrawReport: { icon: "flag-off", label: "Withdraw your report" },
  hide: { icon: "eye-off", label: "Hide" },
  restore: { icon: "eye", label: "Restore" },
};

/** The report reasons, in the prototype's words and icons (REASONS in docs/prototype/source/steelman-refined.html). */
export const REASONS: Record<ReportReason, { icon: IconName; label: string }> = {
  spam: { icon: "ban", label: "Spam" },
  abuse: { icon: "shield-alert", label: "Abusive" },
  offtopic: { icon: "move-right", label: "Off-topic" },
  other: { icon: "circle-help", label: "Something else" },
};

/** "Spam ×2, Something else: “It names a student.”", as the prototype's reasonsOf says them, with what was written for Something else. */
export function reasonsSaid(reasons: Partial<Record<ReportReason, number>>, notes: string[] = []): string {
  return (Object.keys(REASONS) as ReportReason[])
    .filter((reason) => (reasons[reason] ?? 0) > 0)
    .map((reason) => {
      const said = REASONS[reason].label + (reasons[reason]! > 1 ? ` ×${reasons[reason]}` : "");
      return reason === "other" && notes.length > 0 ? `${said}: ${notes.map((note) => `“${note}”`).join(" ")}` : said;
    })
    .join(", ");
}

/**
 * For an Editor or the Owner: a red flag with how many open reports a wording has; its reasons on hover or focus.
 * Never who. Pressing it opens the menu at Hide's reasons (M2-4).
 */
function ReportFlag({ reports, onOpen }: { reports: NonNullable<VersionRow["reports"]>; onOpen: (() => void) | null }) {
  const why = reasonsSaid(reports.reasons, reports.notes);
  const said = `${reports.count} ${reports.count === 1 ? "report" : "reports"}: ${why}`;
  if (!onOpen) {
    return (
      <span className="sm-flag-tag" role="img" tabIndex={0} aria-label={said} data-tooltip={why}>
        <Icon name="flag" />
        {reports.count}
      </span>
    );
  }
  return (
    <button type="button" className="sm-flag-tag cursor-interaction" aria-label={said} aria-haspopup="menu" data-tooltip={why} onClick={onOpen}>
      <Icon name="flag" />
      {reports.count}
    </button>
  );
}

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
  onReport(reason: ReportReason, note: string): void;
  onHide(reason: ReportReason): void;
  /** Where it opens: its items, or Hide's reasons (from the flag). */
  startAt?: "items" | "hideReasons";
}

function VersionMenu({ trigger, items, onClose, onChoose, onReport, onHide, startAt = "items" }: VersionMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const root = document.getElementById("sm-content");
  /** Report switches the menu to its reasons, as the prototype's does; Something else then asks what's wrong. */
  const [view, setView] = useState<"items" | "reasons" | "hideReasons" | "note">(startAt);
  const [note, setNote] = useState("");

  // Each view starts with the cursor on its first control.
  useEffect(() => {
    if (view === "items") return;
    menu.current?.querySelector<HTMLElement>(view === "note" ? "textarea" : '[role="menuitem"]')?.focus();
  }, [view]);

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
      // In the note form, Tab moves between its fields, and closes it only from the last one (or Shift+Tab from the first).
      const fields = [...(menu.current?.querySelectorAll<HTMLElement>("textarea, button:not(:disabled)") ?? [])];
      const leaving = menu.current?.dataset.view !== "note" || here === (event.shiftKey ? fields[0] : fields.at(-1));
      if (event.key === "Tab" && menu.current?.contains(here) && leaving) {
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
  const ready = note.trim().length > 0;
  return createPortal(
    <div
      ref={menu}
      className="sm-menu"
      role={view === "note" ? "dialog" : "menu"}
      aria-label={view === "note" ? "Report it as something else" : view === "reasons" ? "Report it as" : view === "hideReasons" ? "Hide it as" : "Version options"}
      data-view={view}
    >
      {view === "note" ? (
        <form
          className="sm-report-note"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) onReport("other", note.trim());
          }}
        >
          <label className="sm-menu-note" htmlFor="sm-report-note">
            What’s wrong with it?
          </label>
          <textarea id="sm-report-note" className="ph-no-capture" rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="sm-report-actions">
            <button type="button" className="sm-link-button cursor-interaction" onClick={() => setView("reasons")}>
              Back
            </button>
            <button type="submit" className="sm-button sm-solid cursor-interaction" disabled={!ready}>
              Report
            </button>
          </div>
        </form>
      ) : view === "reasons" || view === "hideReasons" ? (
        <>
          <p className="sm-menu-note" aria-hidden="true">
            {view === "reasons" ? "Report it as" : "Hide it as"}
          </p>
          {(Object.keys(REASONS) as ReportReason[]).map((reason) => (
            <button
              key={reason}
              type="button"
              role="menuitem"
              className="sm-menu-item cursor-interaction"
              onClick={() => (view === "hideReasons" ? onHide(reason) : reason === "other" ? setView("note") : onReport(reason, ""))}
            >
              <Icon name={REASONS[reason].icon} />
              <span>{REASONS[reason].label}</span>
            </button>
          ))}
        </>
      ) : (
        items.map((item) => (
          <Fragment key={item}>
            {/* Report sits below a rule, as the prototype's moderation items do. */}
            {(item === "report" || item === "withdrawReport" || item === "hide" || item === "restore") && !["report", "withdrawReport"].includes(items[items.indexOf(item) - 1] ?? "") ? (
              <div className="sm-menu-rule" role="separator" />
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="sm-menu-item cursor-interaction"
              // The prototype colours a delete's icon by this.
              data-action={item === "deleteVersion" || item === "deleteArgument" ? "delete-card" : undefined}
              onClick={() => (item === "report" ? setView("reasons") : item === "hide" ? setView("hideReasons") : onChoose(item))}
            >
              <Icon name={MENU_ITEMS[item].icon} />
              <span>{MENU_ITEMS[item].label}</span>
            </button>
          </Fragment>
        ))
      )}
    </div>,
    root,
  );
}

/**
 * Who wrote it. An edited wording says so; "edited" shows the wording it
 * replaced and how many importance and articulation votes it had just before
 * the edit (Q22): on hover with a mouse, and a press (a tap, on a phone)
 * keeps it open until pressed again.
 */
function Byline({ version }: { version: VersionRow }) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const shown = pinned || hovered;
  const before = version.votesBefore;
  // Escape hides it without moving the pointer (WCAG 1.4.13).
  useEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setHovered(false);
      setPinned(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown]);
  return (
    // The pointer can move from "edited" onto what it shows without it going (WCAG 1.4.13).
    <div className="sm-byline-wrap" onPointerLeave={(event) => event.pointerType === "mouse" && setHovered(false)}>
      <p className="sm-byline">
        {version.authorName}
        {version.previousWording !== null && (
          <>
            {" · "}
            <button
              type="button"
              className="sm-link-button sm-edited cursor-interaction"
              aria-expanded={shown}
              // A press keeps open what hovering showed (or opens it, on a phone), and a second press closes it.
              // It goes by the pin alone: hovering has already shown it by the time a mouse clicks.
              onClick={() => {
                setPinned(!pinned);
                setHovered(false);
              }}
              // A touch sends pointer events too; only a mouse hovers.
              onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(true)}
            >
              edited
            </button>
          </>
        )}
      </p>
      {shown && version.previousWording !== null && (
        // The past, set apart in its own panel (the builder, Nov 20): the wording struck through, and its counts in the serif.
        <div className="sm-prev">
          <p className="sm-prev-label">Before this edit</p>
          <del>{version.previousWording}</del>
          {before ? (
            <p className="sm-prev-votes">
              <Count n={before.importance} kind="importance" /> <Count n={before.articulation} kind="articulation" />
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Count({ n, kind }: { n: number; kind: string }) {
  return (
    <span>
      <b>{n}</b> {kind} {n === 1 ? "vote" : "votes"}
    </span>
  );
}

/** Four segments, one filled per quarter of assessments that support the wording; dashed under five; empty gray when unreviewed. */
export function Meter(counts: { yes: number; no: number }) {
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
