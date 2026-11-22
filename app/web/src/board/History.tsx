// History (M3a-4, J-03), in the prototype's drawer (historyMarkup in
// docs/prototype/source/steelman-refined.html): the board's change log, newest
// first, as Google Drive's Activity panel shows a file's: grouped by day, each
// entry a sentence saying who did what to what, with its time. The log holds
// no one's words (invariant 7), so each thing is named from the rows the
// reader already has: a hidden wording's words only for a moderator, and a
// deleted one's not at all, since deleting erases them (A-06).
//
// Restore brings back what was taken away, so a ten-second Undo is never the
// only way back (WCAG 2.2.1; plans/reviews/m3-design-audit.md): a deleted
// option (an Editor's or the Owner's), a source taken off a wording (anyone
// who may add one), and a hidden wording (an Editor's or the Owner's). It
// shows on the newest such entry while the thing is still gone.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { OPTIONS_PER_BOARD, can } from "@steelman/shared";
import type { HistoryEntry, ReaderView, Role } from "@steelman/shared";
import { Icon } from "../icons.tsx";
import { versionPath } from "../links.ts";
import { shortDate } from "../when.ts";
import { finalArgument, isLiveVersion, leadWording, short } from "./display.ts";
import type { BoardSession } from "./session.ts";

interface HistoryProps {
  boardId: string;
  view: ReaderView;
  reader: string | null;
  role: Role | null;
  session: BoardSession;
  /** The newest change-log row the board has polled: History reads again when it moves, not on every vote. */
  logSeq: number;
  /** Options this tab holds for their ten-seconds Undo: still counted toward the four. */
  heldOptions: number;
  /** Opens a wording on the board. */
  onOpen(versionId: string): void;
  onClose(): void;
}

/** A moderator's reason, as the end of the sentence that says they hid something. */
const AS_REASON: Record<string, string> = { spam: "as spam", abuse: "as abusive", offtopic: "as off-topic", other: "for another reason" };
const A_ROLE: Record<Role, string> = { viewer: "a viewer", voter: "a voter", contributor: "a contributor", editor: "an editor", owner: "the owner" };
const LINK_CAN: Partial<Record<Role, string>> = { viewer: "view", voter: "vote", contributor: "contribute" };

export function History({ boardId, view, reader, role, session, logSeq, heldOptions, onOpen, onClose }: HistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  // Read when it opens, and again when a poll brings a new change-log row: History takes in what others do, but votes,
  // which aren't in it, don't make it read again.
  useEffect(() => {
    let current = true;
    void session.history().then((read) => {
      if (!current) return;
      if (read) setEntries(read);
      else setFailed(true);
    });
    return () => {
      current = false;
    };
  }, [session, logSeq]);

  useEffect(() => {
    drawer.current?.querySelector<HTMLElement>(".sm-drawer-head button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drawer.current?.contains(document.activeElement)) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const restored = () => window.setTimeout(() => title.current?.focus());
  const days = byDay(entries ?? []);
  const restorable = newestOfEach(entries ?? []);
  // A combine or separation not yet undone may be undone here, after its ten seconds (M3a-8).
  const undone = new Set((entries ?? []).flatMap((entry) => (entry.detail.undoes === undefined ? [] : [entry.detail.undoes])));
  const mayUndo = can(reader, role, "structure", { closed: false }) === null;
  return (
    <div ref={drawer} className="sm-drawer sm-history-drawer" role="dialog" aria-modal="false" aria-labelledby="sm-history-title" id="sm-history">
      <div className="sm-drawer-head">
        <h2 id="sm-history-title" ref={title} tabIndex={-1}>
          History
        </h2>
        <button type="button" className="sm-icon-button cursor-interaction" aria-label="Close history" data-tooltip="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="sm-drawer-body">
        {entries === null ? (
          <p className="sm-field-hint">{failed ? "History can’t be read right now. Try again in a moment." : "History is loading."}</p>
        ) : entries.length === 0 ? (
          <p className="sm-field-hint">Nothing has happened on this board yet.</p>
        ) : (
          days.map(([day, list]) => (
            <section key={day} className="sm-history-day" aria-labelledby={`sm-day-${list[0]!.seq}`}>
              <h3 id={`sm-day-${list[0]!.seq}`}>{day}</h3>
              <ol className="sm-history">
                {list.map((entry) => (
                  <li key={entry.seq}>
                    <span className="sm-avatar" aria-hidden="true">
                      {initials(entry.actorName)}
                    </span>
                    <p>
                      <strong>{entry.actorName}</strong> {said(entry, view, boardId, onOpen)}
                      <time dateTime={entry.at}>{new Date(entry.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</time>
                      {restorable.has(entry.seq) ? <Restore entry={entry} view={view} reader={reader} role={role} session={session} heldOptions={heldOptions} onDone={restored} /> : null}
                      {mayUndo && (entry.kind === "wording_combined" || entry.kind === "wording_separated") && !undone.has(entry.seq) ? (
                        <UndoChange entry={entry} view={view} session={session} onDone={restored} />
                      ) : null}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

/** Restore, when this entry's thing is still gone and the reader may bring it back. */
interface RestoreProps {
  entry: HistoryEntry;
  view: ReaderView;
  reader: string | null;
  role: Role | null;
  session: BoardSession;
  heldOptions: number;
  onDone(): void;
}

function Restore({ entry, view, reader, role, session, heldOptions, onDone }: RestoreProps) {
  const [busy, setBusy] = useState(false);
  const may = (action: "structure" | "add" | "hide") => can(reader, role, action, { closed: false }) === null;
  let restore: (() => Promise<boolean>) | null = null;
  /** What it brings back, for a screen reader, as GOV.UK adds hidden context to a repeated link: "Restore the option “Only in winter”". */
  let what = "";
  if (entry.kind === "option_deleted") {
    const option = view.rows.options[entry.subjectId];
    const live = Object.values(view.rows.options).filter((o) => !o.deleted).length + heldOptions;
    if (option?.deleted && may("structure") && live < OPTIONS_PER_BOARD.max) {
      restore = () => session.restoreOption(option);
      what = `the option “${option.name}”`;
    }
  } else if (entry.kind === "source_removed" && entry.detail.version && entry.detail.source) {
    const version = view.rows.versions[entry.detail.version];
    const source = view.rows.sources[entry.detail.source];
    if (version && isLiveVersion(version) && source && !version.sourceIds.includes(source.id) && may("add")) {
      restore = () => session.putSourceBack(version.id, source.id);
      what = `the source “${source.name}”`;
    }
  } else if (entry.kind === "version_hidden") {
    const version = view.rows.versions[entry.subjectId];
    if (version?.hidden && !version.deleted && may("hide")) {
      restore = () => session.restoreHidden(version.id);
      what = "the wording";
    }
  }
  if (!restore) return null;
  const run = restore;
  return (
    <button
      type="button"
      className="sm-link-button cursor-interaction"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void run().then((done) => {
          setBusy(false);
          if (done) onDone();
        });
      }}
    >
      Restore<span className="sm-sr">{` ${what}`}</span>
    </button>
  );
}

/**
 * Undo, on a combine or separation (M3a-8, J-04), as GitHub offers Revert on a merged pull request long after it: the
 * service puts the wording back, with the votes a combine set aside, or says why it can't yet.
 */
function UndoChange({ entry, view, session, onDone }: { entry: HistoryEntry; view: ReaderView; session: BoardSession; onDone(): void }) {
  const [busy, setBusy] = useState(false);
  const wording = view.rows.versions[entry.subjectId]?.wording;
  const what = `${entry.kind === "wording_combined" ? "combining" : "separating"}${wording ? ` “${short(wording)}”` : ""}`;
  return (
    <button
      type="button"
      className="sm-link-button cursor-interaction"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void session.undoChange(entry.seq, entry.subjectId).then((done) => {
          setBusy(false);
          if (done) onDone();
        });
      }}
    >
      Undo<span className="sm-sr">{` ${what}`}</span>
    </button>
  );
}

/** What the entry says after its actor's name: a sentence, naming things from the rows the reader holds. */
function said(entry: HistoryEntry, view: ReaderView, boardId: string, onOpen: (versionId: string) => void): ReactNode {
  const optionName = view.rows.options[entry.subjectId]?.name;
  const option = optionName === undefined ? "an option" : `the option “${optionName}”`;
  const sourceId = entry.detail.source ?? entry.subjectId;
  const source = view.rows.sources[sourceId] ? `the source “${view.rows.sources[sourceId]!.name}”` : "a source";
  const wording = (versionId: string): ReactNode => {
    const version = view.rows.versions[versionId];
    if (!version || version.deleted || version.wording === null) return "a wording";
    const quote = `“${short(version.wording)}”`;
    if (!isLiveVersion(version)) return quote;
    return (
      <a
        href={versionPath(boardId, versionId)}
        className="cursor-interaction"
        onClick={(event) => {
          // With a modifier held, the browser opens it in a new tab or window, as any link does.
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onOpen(versionId);
        }}
      >
        {quote}
      </a>
    );
  };
  switch (entry.kind) {
    case "board_created":
      return "created this board.";
    case "access_changed":
      return entry.detail.general === "invited" ? "made the board open only to invited people." : `let anyone with the link ${LINK_CAN[entry.detail.linkRole ?? "viewer"] ?? "view"}.`;
    case "role_changed":
      return `made ${entry.detail.accountName ?? "someone"} ${A_ROLE[entry.detail.role ?? "viewer"]}.`;
    case "option_added":
      return `added ${option}.`;
    case "option_renamed":
      // The log keeps no names (invariant 7), so this says what it's called now, which stays true after later renames.
      return optionName === undefined ? "renamed an option." : `renamed the option now called “${optionName}”.`;
    case "option_deleted":
      return `deleted ${option}.`;
    case "option_restored":
      return `restored ${option}.`;
    case "version_edited":
      return <>edited {wording(entry.subjectId)}.</>;
    case "version_deleted":
      return entry.detail.argumentDeleted ? "deleted a wording and its argument." : "deleted a wording.";
    case "version_hidden":
      return (
        <>
          hid {wording(entry.subjectId)} {AS_REASON[entry.reason ?? "other"] ?? AS_REASON.other}.
        </>
      );
    case "version_restored":
      return <>restored {wording(entry.subjectId)}.</>;
    case "source_added":
      return `added ${source}.`;
    case "source_cited":
      return `cited ${source}.`;
    case "source_removed":
      return `took ${source} off a wording.`;
    case "source_edited":
      return `edited ${source}.`;
    case "wording_combined": {
      const lead = entry.detail.into ? leadWording(view, finalArgument(view, entry.detail.into), entry.subjectId) : null;
      return (
        <>
          combined {wording(entry.subjectId)} with {lead ? `“${short(lead)}”` : "another argument"}.
        </>
      );
    }
    case "wording_separated":
      return <>made {wording(entry.subjectId)} its own argument.</>;
    case "wording_uncombined":
      return <>moved {wording(entry.subjectId)} back where it was.</>;
    case "wording_unseparated":
      return <>moved {wording(entry.subjectId)} back into its argument.</>;
    case "source_unavailable":
      return `reported that ${source} can’t be opened.`;
    case "source_available":
      return `cleared the report on ${source}.`;
    default:
      return "changed the board.";
  }
}

/** Entries grouped by the day they happened, in the reader's time zone, newest day first. */
function byDay(entries: HistoryEntry[]): [string, HistoryEntry[]][] {
  const days = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const day = shortDate(entry.at);
    days.set(day, [...(days.get(day) ?? []), entry]);
  }
  return [...days];
}

/** The entries that may offer Restore: the newest removal of each thing, so one Restore shows per thing. */
function newestOfEach(entries: HistoryEntry[]): Set<number> {
  const seen = new Set<string>();
  const newest = new Set<number>();
  for (const entry of entries) {
    if (!["option_deleted", "source_removed", "version_hidden"].includes(entry.kind)) continue;
    const key = `${entry.kind}:${entry.subjectId}:${entry.detail.source ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    newest.add(entry.seq);
  }
  return newest;
}

/** Two letters for the avatar, as the prototype's: "maya.chen" is MC. */
function initials(name: string): string {
  const parts = name.split(/[._\s-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : name.slice(0, 2)).toUpperCase();
}
