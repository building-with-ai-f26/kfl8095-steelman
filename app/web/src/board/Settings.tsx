// Board settings (M3b-2, I-01), in the prototype's drawer (settingsMarkup in
// docs/prototype/source/steelman-refined.html), the one History uses: the
// Owner renames the question, and "Sharing and access" opens Share. Only the
// Owner sees the Settings button, as Google Docs hides what you can't use.
//
// The prototype saves the question on every keystroke, which here would be a
// write per letter. Instead Enter or leaving the field saves once, as the
// app's option rename and GitHub's Rename button do, and Escape puts the old
// text back. Space, How it runs, Who's weighed in, and the prototype's reset
// are left out; closing the board (M3b-6) goes below these.

import { useEffect, useRef, useState } from "react";
import { LIMITS, cleanText } from "@steelman/shared";
import type { Closing } from "@steelman/shared";
import { browserNow } from "../system.ts";
import { closedDay, momentWithZone, zoneName } from "../when.ts";
import { Icon } from "../icons.tsx";
import { WHY } from "./display.ts";
import type { BoardSession } from "./session.ts";

interface SettingsProps {
  question: string;
  /** A closed board's question can't be renamed (M3b-5): the field is read only and says why. */
  closed: boolean;
  /** Whether the board is closed and when, for the Timing group (M3b-6); null when it's open with no closing time. */
  closing: Closing | null;
  session: BoardSession;
  onClose(): void;
  /** Closes the panel and opens Share. */
  onShare(): void;
}

export function Settings({ question, closed, closing, session, onClose, onShare }: SettingsProps) {
  const [text, setText] = useState(question);
  const [empty, setEmpty] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  /** The question a save is on its way to becoming, so leaving the field after Enter doesn't send it twice. */
  const saving = useRef<string | null>(null);

  // A rename by someone else, or this one once it's taken, shows in the field unless the Owner is typing.
  useEffect(() => {
    if (document.activeElement !== field.current) setText(question);
  }, [question]);
  // A board that closes while the Owner types keeps its question: the field goes back to it and is read only (M3b-5).
  useEffect(() => {
    if (closed) {
      setText(question);
      setEmpty(false);
    }
  }, [closed]);

  useEffect(() => {
    field.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      // Escape in a field with changes puts the old text back first (the field's own handler); otherwise it closes.
      if (event.key === "Escape" && !event.defaultPrevented && drawer.current?.contains(document.activeElement)) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (closed) return;
    const next = cleanText(text);
    if (next === "") {
      setText(question);
      setEmpty(true);
      return;
    }
    setEmpty(false);
    if (next === question || next === saving.current) return setText(next);
    saving.current = next;
    const taken = await session.renameQuestion(next);
    saving.current = null;
    // Refused or unreachable: the session has said why, and the old question stays.
    setText(taken ? next : question);
  }

  return (
    <div ref={drawer} className="sm-drawer sm-settings-drawer" role="dialog" aria-modal="false" aria-labelledby="sm-settings-title" id="sm-settings">
      <div className="sm-drawer-head">
        <h2 id="sm-settings-title">Settings</h2>
        <button type="button" className="sm-icon-button cursor-interaction" aria-label="Close settings" data-tooltip="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="sm-drawer-body">
        <div className="sm-field">
          <label htmlFor="sm-question">Question</label>
          <textarea
            ref={field}
            id="sm-question"
            rows={2}
            maxLength={LIMITS.question}
            aria-describedby={[empty ? "sm-question-empty" : "", "sm-question-hint", closed ? WHY.closed.noteId : ""].filter(Boolean).join(" ")}
            readOnly={closed}
            // Read only, saying why, but not faded: its text must stay readable (M3b-6's scan).
            {...(closed ? { "data-tooltip": WHY.closed.why } : {})}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setEmpty(false);
            }}
            onBlur={() => void save()}
            onKeyDown={(event) => {
              // The question is one line of text, as on New steelman: Enter saves rather than starting a new line.
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void save();
              }
              if (event.key === "Escape" && cleanText(text) !== question) {
                event.preventDefault();
                setText(question);
                setEmpty(false);
              }
            }}
          />
          {/* Said, not marked invalid: the field holds the old question again, which is fine. */}
          {empty ? (
            <p className="sm-field-error" id="sm-question-empty" role="alert">
              A steelman needs a question, so the old one stays.
            </p>
          ) : null}
          <p className="sm-field-hint" id="sm-question-hint">
            Ask it neutrally, so each option can make its strongest case.
          </p>
        </div>
        <div className="sm-field">
          <button type="button" className="sm-text-button cursor-interaction" onClick={onShare}>
            <Icon name="user-plus" />
            Sharing and access
          </button>
        </div>
        {/* Closing comes last, as GitHub's settings keep such actions last (M3b-6). */}
        <Timing closing={closing} session={session} />
      </div>
    </div>
  );
}

/** A date input's and a time input's values for a moment, in the reader's own zone: "2026-11-30" and "17:00". */
function inputsFor(at: string): { date: string; time: string } {
  const when = new Date(at);
  const two = (n: number) => String(n).padStart(2, "0");
  return { date: `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())}`, time: `${two(when.getHours())}:${two(when.getMinutes())}` };
}

/** A week from now, on the hour: where the prototype starts a closing date. */
function aWeekAhead(): string {
  const at = browserNow();
  at.setDate(at.getDate() + 7);
  at.setMinutes(0, 0, 0);
  return at.toISOString();
}

/**
 * The Owner's closing controls (M3b-6, I-05), the prototype's Timing group: "Closes", with Add a date, which becomes
 * the browser's own date and time inputs with the zone named beside them and Remove; and "Open" with Close now, or
 * "Closed Nov 7" with Reopen. Each is sent at once, with no confirmation, as the prototype and GitHub's issues have
 * none. A time that has passed is the service's to refuse, and the panel says so under the field.
 */
function Timing({ closing, session }: { closing: Closing | null; session: BoardSession }) {
  const closesAt = closing?.closesAt ?? null;
  const [inputs, setInputs] = useState(closesAt ? inputsFor(closesAt) : null);
  const [past, setPast] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The control the focus goes to once the change shows: after Close now, Reopen, and so on. */
  const [focusTo, setFocusTo] = useState<string | null>(null);
  const group = useRef<HTMLElement>(null);
  /** A save on its way, so leaving an input right after Enter doesn't send the same time again. */
  const saving = useRef(false);
  /** A change made while a save was on its way, saved once that one is back. */
  const pending = useRef(false);
  /** What the inputs say now, for a commit that waits for a save. */
  const latest = useRef(inputs);
  latest.current = inputs;

  // A time set or cleared elsewhere, or this one once it's taken, shows in the inputs.
  useEffect(() => {
    setInputs(closesAt ? inputsFor(closesAt) : null);
  }, [closesAt]);
  useEffect(() => {
    if (!focusTo) return;
    const target = group.current?.querySelector<HTMLElement>(`[data-focus="${focusTo}"]`);
    if (!target) return;
    target.focus();
    setFocusTo(null);
  });

  async function saveTime(at: string | null, after: string | null) {
    saving.current = true;
    setBusy(true);
    // The year shows only for a time in another year than the one it's set in, as the pill says it.
    const said = at ? `The board closes on ${momentWithZone(at, closesAt ?? at)}.` : "The closing time was removed.";
    const saved = await session.setClosingTime(at, said);
    saving.current = false;
    setBusy(false);
    if (pending.current) {
      pending.current = false;
      commit();
    }
    setPast(saved === "past");
    if (saved === true && after) setFocusTo(after);
  }

  /** Saves what the inputs say, once both are filled in and it differs from the time the board has. */
  function commit() {
    const inputs = latest.current;
    if (!inputs) return;
    if (saving.current) {
      pending.current = true;
      return;
    }
    // An input emptied goes back to the time the board has: Remove is the way to clear it.
    if (!inputs.date || !inputs.time) return setInputs(closesAt ? inputsFor(closesAt) : null);
    const at = new Date(`${inputs.date}T${inputs.time}`);
    if (Number.isNaN(at.getTime()) || at.toISOString() === closesAt) return;
    void saveTime(at.toISOString(), null);
  }

  /** Whether the keyboard is leaving the date and time, rather than moving from one to the other, which saves once. */
  const leaving = (next: EventTarget | null) => !(next instanceof HTMLInputElement && next.classList.contains("sm-rdate"));

  async function setClosed(closed: boolean) {
    setBusy(true);
    const done = await session.setClosed(closed);
    setBusy(false);
    if (done) setFocusTo(closed ? "reopen" : "close-now");
  }

  const shownAt = inputs ? new Date(`${inputs.date}T${inputs.time || "00:00"}`) : null;
  return (
    <section ref={group} className="sm-rgroup sm-timing" aria-labelledby="sm-timing-title">
      <h3 id="sm-timing-title">Timing</h3>
      <div className="sm-rrow">
        <span className="sm-rrow-label">Closes</span>
        <span className="sm-rrow-control">
          {inputs ? (
            <>
              <input
                type="date"
                className="sm-rdate"
                max="9999-12-31"
                aria-label="Closing date"
                aria-describedby={past ? "sm-closing-past" : undefined}
                aria-invalid={past || undefined}
                value={inputs.date}
                onChange={(event) => setInputs({ ...inputs, date: event.target.value })}
                onBlur={(event) => leaving(event.relatedTarget) && commit()}
                onKeyDown={(event) => event.key === "Enter" && commit()}
              />
              <input
                type="time"
                className="sm-rdate"
                aria-label="Closing time"
                aria-describedby={past ? "sm-closing-past" : undefined}
                aria-invalid={past || undefined}
                value={inputs.time}
                onChange={(event) => setInputs({ ...inputs, time: event.target.value })}
                onBlur={(event) => leaving(event.relatedTarget) && commit()}
                onKeyDown={(event) => event.key === "Enter" && commit()}
              />
              {shownAt && !Number.isNaN(shownAt.getTime()) ? <span className="sm-zone">{zoneName(shownAt)}</span> : null}
              <button
                type="button"
                className="sm-icon-button cursor-interaction"
                aria-label="Remove the closing time"
                data-tooltip="Remove"
                disabled={busy}
                onClick={() => {
                  setPast(false);
                  void saveTime(null, "add-date");
                }}
              >
                <Icon name="x" />
              </button>
            </>
          ) : (
            <button type="button" className="sm-link-button cursor-interaction" data-focus="add-date" disabled={busy} onClick={() => void saveTime(aWeekAhead(), null)}>
              Add a date
            </button>
          )}
        </span>
      </div>
      {past ? (
        <p className="sm-field-error" id="sm-closing-past" role="alert">
          Choose a time that hasn’t passed.
        </p>
      ) : null}
      <div className="sm-rrow">
        <span className="sm-rrow-label">{closing?.closed ? `Closed ${closedDay(closing)}` : "Open"}</span>
        <span className="sm-rrow-control">
          {closing?.closed ? (
            <button type="button" className="sm-link-button cursor-interaction" data-focus="reopen" disabled={busy} onClick={() => void setClosed(false)}>
              Reopen
            </button>
          ) : (
            <button type="button" className="sm-link-button cursor-interaction" data-focus="close-now" disabled={busy} onClick={() => void setClosed(true)}>
              Close now
            </button>
          )}
        </span>
      </div>
    </section>
  );
}
