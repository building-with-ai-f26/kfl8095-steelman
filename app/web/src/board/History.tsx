// History (M3a-4, J-03), in the prototype's drawer (historyMarkup in
// docs/prototype/source/steelman-refined.html): what happened on the board,
// newest first, as Google Drive's Activity panel shows a file's: grouped by
// day, each entry a sentence saying who did what to what, with its time. It
// lists the board's change log and, with it, each argument and wording that
// was added (the builder, Nov 22, 2026). Adding one writes nothing to the
// log, so the service builds those entries from the wordings the board
// already holds (server/src/history.ts). An entry holds no one's words
// (invariant 7), so each thing is named from the rows the reader already has:
// a hidden wording's words only for a moderator, and a deleted one's not at
// all, since deleting erases them (A-06).
//
// Restore brings back what was taken away, so a ten-second Undo is never the
// only way back (WCAG 2.2.1; plans/reviews/m3-design-audit.md): a deleted
// option (an Editor's or the Owner's), a source taken off a wording (anyone
// who may add one), and a hidden wording (an Editor's or the Owner's). It
// shows on the newest such entry while the thing is still gone.
//
// Undo, on a combine or a separation not yet undone (M3a-8, J-04), for an
// Editor or the Owner: as GitHub offers Revert on a merge long after it.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { OPTIONS_PER_BOARD, can } from "@steelman/shared";
import type { HistoryEntry, ReaderView, Role } from "@steelman/shared";
import { Icon } from "../icons.tsx";
import { versionPath } from "../links.ts";
import { shortDate } from "../when.ts";
import { endQuote, endsSentence, isLiveVersion, leadWording, short } from "./display.ts";
import type { BoardSession } from "./session.ts";

interface HistoryProps {
  boardId: string;
  view: ReaderView;
  reader: string | null;
  role: Role | null;
  session: BoardSession;
  /** The newest change-log row the board has polled: History reads again when it moves, not on every vote. */
  logSeq: number;
  /** Opens a wording on the board. */
  onOpen(versionId: string): void;
  onClose(): void;
}

/** A moderator's reason, as the end of the sentence that says they hid something. */
const AS_REASON: Record<string, string> = { spam: "as spam", abuse: "as abusive", offtopic: "as off-topic", other: "for another reason" };
const A_ROLE: Record<Role, string> = { viewer: "a viewer", voter: "a voter", contributor: "a contributor", editor: "an editor", owner: "the owner" };
const LINK_CAN: Partial<Record<Role, string>> = { viewer: "view", voter: "vote", contributor: "contribute" };

export function History({ boardId, view, reader, role, session, logSeq, onOpen, onClose }: HistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  // Read when it opens, and again when a poll brings a new change-log row or a new wording, which has no row in the
  // log: History takes in what others do, but votes, which aren't in it, don't make it read again.
  const newestWording = Object.values(view.rows.versions).reduce((newest, version) => Math.max(newest, version.createdSeq), 0);
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
  }, [session, logSeq, newestWording]);

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
            <section key={day} className="sm-history-day" aria-labelledby={`sm-day-${keyOf(list[0]!)}`}>
              <h3 id={`sm-day-${keyOf(list[0]!)}`}>{day}</h3>
              <ol className="sm-history">
                {list.map((entry) => (
                  <li key={keyOf(entry)}>
                    <span className="sm-avatar" aria-hidden="true">
                      {initials(entry.actorName)}
                    </span>
                    <div className="sm-history-entry">
                      <p>
                        <strong>{entry.actorName}</strong> {said(entry, view, boardId, onOpen)}
                      </p>
                      {/* Its time, and beside it what can still be done about it, as GitHub puts Revert on a merge's own line. */}
                      <div className="sm-history-meta">
                        <time dateTime={entry.at}>{new Date(entry.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</time>
                        {restorable.has(keyOf(entry)) ? <Restore entry={entry} view={view} reader={reader} role={role} session={session} onDone={restored} /> : null}
                        {/* Only a combine's or a separation's own entry: its number is the change the service undoes. */}
                        {mayUndo && (entry.kind === "wording_combined" || entry.kind === "wording_separated") && !undone.has(entry.seq) && undoable(entry, view) ? (
                          <UndoChange entry={entry} view={view} session={session} onDone={restored} />
                        ) : null}
                      </div>
                    </div>
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
  onDone(): void;
}

function Restore({ entry, view, reader, role, session, onDone }: RestoreProps) {
  const [busy, setBusy] = useState(false);
  const may = (action: "structure" | "add" | "hide") => can(reader, role, action, { closed: false }) === null;
  let restore: (() => Promise<boolean>) | null = null;
  /** What it brings back, for a screen reader, as GOV.UK adds hidden context to a repeated link: "Restore the option “Only in winter”". */
  let what = "";
  if (entry.kind === "option_deleted") {
    const option = view.rows.options[entry.subjectId];
    // An option this tab holds for its ten seconds of Undo is still in the rows, so it's counted here already.
    const live = Object.values(view.rows.options).filter((o) => !o.deleted).length;
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
  const what = `${entry.kind === "wording_combined" ? "combining" : "separating"} ${wording ? `“${short(wording)}”` : "a wording"}`;
  return (
    <button
      type="button"
      className="sm-link-button cursor-interaction"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        // Taken, it stays disabled until History reads the undo and the button goes.
        void session.undoChange(entry.seq, entry.subjectId).then((done) => {
          if (!done) setBusy(false);
          else onDone();
        });
      }}
    >
      Undo<span className="sm-sr">{` ${what}`}</span>
    </button>
  );
}

/**
 * Whether the service could undo it: not once its wording is deleted, nor, unless two arguments became one, once the
 * argument it would go back to is. Moved on since is only "not yet", which the service says, so Undo stays.
 */
function undoable(entry: HistoryEntry, view: ReaderView): boolean {
  if (view.rows.versions[entry.subjectId]?.deleted) return false;
  const from = entry.detail.from ? view.rows.arguments[entry.detail.from] : undefined;
  return !(from?.deleted && !entry.detail.merged);
}

/** What the entry says after its actor's name: a sentence, naming things from the rows the reader holds. */
function said(entry: HistoryEntry, view: ReaderView, boardId: string, onOpen: (versionId: string) => void): ReactNode {
  const optionName = view.rows.options[entry.subjectId]?.name;
  const option = optionName === undefined ? "an option" : `the option “${optionName}”`;
  const sourceId = entry.detail.source ?? entry.subjectId;
  const source = view.rows.sources[sourceId] ? `the source “${view.rows.sources[sourceId]!.name}”` : "a source";
  /** A wording's words, when the reader's rows have them: not a deleted one's, nor a hidden one's unless the reader moderates. */
  const words = (versionId: string): string | null => {
    const version = view.rows.versions[versionId];
    return version && !version.deleted ? version.wording : null;
  };
  /** A wording, named by its words. With `last`, it ends the sentence, which then takes no second full stop. */
  const wording = (versionId: string, last = false): ReactNode => {
    const text = words(versionId);
    if (text === null) return last ? "a wording." : "a wording";
    const quote = `“${short(text)}”`;
    const stop = last && !endsSentence(short(text)) ? "." : "";
    if (!isLiveVersion(view.rows.versions[versionId])) return quote + stop;
    return (
      <>
        {link(versionId, quote)}
        {stop}
      </>
    );
  };
  const link = (versionId: string, quote: string): ReactNode => (
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
    case "argument_added":
      // A wording that began an argument. One the reader can't be shown is only "an argument".
      return words(entry.subjectId) === null ? "added an argument." : <>added the argument {wording(entry.subjectId, true)}</>;
    case "wording_added":
      return words(entry.subjectId) === null ? "added a wording." : <>added the wording {wording(entry.subjectId, true)}</>;
    case "version_edited":
      return <>edited {wording(entry.subjectId, true)}</>;
    case "version_deleted":
      return entry.detail.argumentDeleted ? "deleted a wording and its argument." : "deleted a wording.";
    case "version_hidden":
      return (
        <>
          hid {wording(entry.subjectId)} {AS_REASON[entry.reason ?? "other"] ?? AS_REASON.other}.
        </>
      );
    case "version_restored":
      return <>restored {wording(entry.subjectId, true)}</>;
    case "source_added":
      return `added ${source}.`;
    case "source_cited":
      return `cited ${source}.`;
    case "source_removed":
      return `took ${source} off a wording.`;
    case "source_edited":
      // An edit that changed a reported source's link also cleared its "can't be opened" report (C-02).
      return entry.detail.cleared ? `edited ${source}, which cleared its report.` : `edited ${source}.`;
    case "wording_combined": {
      // The argument it joined, by its own lead: not one that argument was combined into later, which took no part.
      const lead = entry.detail.into ? leadWording(view, entry.detail.into, entry.subjectId) : null;
      return (
        <>
          combined {wording(entry.subjectId)} with {lead ? endQuote(lead) : "another argument."}
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

/**
 * What tells one entry from every other, for React and for an ID on the page. A change number alone doesn't: a
 * wording's addition carries the number of the write that added it, which other additions and a change can share.
 */
function keyOf(entry: HistoryEntry): string {
  return `${entry.seq}-${entry.kind}-${entry.subjectId}`;
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
function newestOfEach(entries: HistoryEntry[]): Set<string> {
  const seen = new Set<string>();
  const newest = new Set<string>();
  for (const entry of entries) {
    if (!["option_deleted", "source_removed", "version_hidden"].includes(entry.kind)) continue;
    const key = `${entry.kind}:${entry.subjectId}:${entry.detail.source ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    newest.add(keyOf(entry));
  }
  return newest;
}

/** Two letters for the avatar, as the prototype's: "maya.chen" is MC. */
function initials(name: string): string {
  const parts = name.split(/[._\s-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : name.slice(0, 2)).toUpperCase();
}
