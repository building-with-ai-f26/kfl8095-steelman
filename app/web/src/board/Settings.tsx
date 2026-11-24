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
import { Icon } from "../icons.tsx";
import type { BoardSession } from "./session.ts";

interface SettingsProps {
  question: string;
  session: BoardSession;
  onClose(): void;
  /** Closes the panel and opens Share. */
  onShare(): void;
}

export function Settings({ question, session, onClose, onShare }: SettingsProps) {
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
            aria-describedby={empty ? "sm-question-empty sm-question-hint" : "sm-question-hint"}
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
      </div>
    </div>
  );
}
