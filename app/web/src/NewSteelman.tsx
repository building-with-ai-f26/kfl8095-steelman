// New steelman (F-01), from the prototype's sheet (createMarkup in
// docs/prototype/source/steelman-refined.html), as the builder revised it on
// Nov 14: white, with the options side by side like the board's columns
// (scrolling sideways on a phone), and the settings under them, each an icon
// and a name. Permissions works (H-02); Space and Collaboration rules (the
// prototype's "How it runs") are shown where they'll be, marked Later. The sheet is at /new, a button on the list (E-03), and making a
// board opens it.

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { LIMITS, OPTIONS_PER_BOARD, cleanText } from "@steelman/shared";
import type { Access } from "@steelman/shared";
import { createBoard } from "./api.ts";
import { Icon } from "./icons.tsx";
import type { IconName } from "./icons.tsx";
import { boardPath } from "./links.ts";

const PLACEHOLDERS = ["First option", "Second option", "Third option", "Fourth option"];

/** What's wrong with the sheet, and which field to put the cursor in; null when it can be sent. */
function problemWith(question: string, options: string[]): { message: string; field: string } | null {
  if (!cleanText(question)) return { message: "Write the question first.", field: "question" };
  const names = options.map(cleanText);
  const filled = names.filter(Boolean);
  if (filled.length < OPTIONS_PER_BOARD.min) return { message: "A steelman needs at least two options.", field: `option-${Math.max(names.indexOf(""), 0)}` };
  const key = (name: string) => name.toLowerCase();
  const repeat = names.findIndex((name, i) => name && names.slice(0, i).some((other) => key(other) === key(name)));
  if (repeat >= 0) return { message: "Each option needs a different name.", field: `option-${repeat}` };
  return null;
}

export function NewSteelman() {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [access, setAccess] = useState<Access>({ general: "link", linkRole: "contributor" });
  const [error, setError] = useState("");
  /** The field the error is about: "question" or "option-<n>", or null when it's about the whole sheet. */
  const [badField, setBadField] = useState<string | null>(null);
  /** Counts tries, so the same message is announced again on the next try. */
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);
  /** Where the cursor goes next: "question" or "option-<n>". */
  const [focus, setFocus] = useState<string | null>("question");
  const sheet = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!focus) return;
    sheet.current?.querySelector<HTMLElement>(`[data-field="${focus}"]`)?.focus();
    setFocus(null);
  }, [focus]);

  const clearError = () => {
    setError("");
    setBadField(null);
  };
  const fail = (message: string, field: string | null) => {
    setError(message);
    setBadField(field);
    setTries((n) => n + 1);
    if (field) setFocus(field);
  };

  const setOption = (index: number, name: string) => {
    setOptions((all) => all.map((old, i) => (i === index ? name : old)));
    clearError();
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = problemWith(question, options);
    if (problem) return fail(problem.message, problem.field);
    setBusy(true);
    let answer: Awaited<ReturnType<typeof createBoard>>;
    try {
      answer = await createBoard({ question: cleanText(question), options: options.map(cleanText).filter(Boolean), access });
    } catch {
      // An answer the app can't read (a proxy's error page, say): never leave the button stuck.
      answer = { problem: "Steelman couldn’t make that board. Try again." };
    }
    if (typeof answer === "string") return window.location.assign(boardPath(answer));
    setBusy(false);
    fail(answer.problem, null);
  }

  /** What a field needs when the error is about it. */
  const marks = (field: string) => (badField === field ? { "aria-invalid": true, "aria-describedby": "sm-create-error" } : {});
  return (
    <main className="sm-landing sm-create-landing" data-canvas="cool">
      <form ref={sheet} className="sm-create sm-create-page" aria-labelledby="sm-create-title" onSubmit={(event) => void submit(event)} noValidate>
        <div className="sm-create-canvas">
          <div className="sm-create-top">
            <h1 id="sm-create-title">New steelman</h1>
          </div>
          <div className="sm-create-q" data-invalid={badField === "question" ? "" : undefined}>
            <textarea
              data-field="question"
              rows={2}
              maxLength={LIMITS.question}
              placeholder="Ask a question with more than one good answer"
              aria-label="Question"
              {...marks("question")}
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
                clearError();
              }}
              onKeyDown={(event) => {
                // The question is one line of text: Enter moves on to the options rather than starting a new line.
                // Not while an input method is composing (Chinese, Japanese…), where Enter accepts what was typed.
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  setFocus("option-0");
                }
              }}
            />
          </div>
          <div className="sm-create-options" role="group" aria-label="Options">
            {options.map((name, i) => (
              <div key={i} className="sm-create-option" data-invalid={badField === `option-${i}` ? "" : undefined}>
                <input
                  type="text"
                  data-field={`option-${i}`}
                  maxLength={LIMITS.optionName}
                  placeholder={PLACEHOLDERS[i]}
                  aria-label={`Option ${i + 1}`}
                  {...marks(`option-${i}`)}
                  value={name}
                  onChange={(event) => setOption(i, event.target.value)}
                />
                {options.length > OPTIONS_PER_BOARD.min ? (
                  <button
                    type="button"
                    className="cursor-interaction"
                    aria-label={`Remove option ${i + 1}`}
                    onClick={() => {
                      setOptions((all) => all.filter((_, j) => j !== i));
                      setFocus(`option-${Math.min(i, options.length - 2)}`);
                    }}
                  >
                    <Icon name="x" />
                  </button>
                ) : null}
              </div>
            ))}
            {options.length < OPTIONS_PER_BOARD.max ? (
              <button
                type="button"
                className="sm-create-add cursor-interaction"
                onClick={() => {
                  setOptions((all) => [...all, ""]);
                  setFocus(`option-${options.length}`);
                }}
              >
                <Icon name="plus" />
                Option
              </button>
            ) : null}
          </div>
        </div>
        <div className="sm-create-foot">
          <div className="sm-rgroup sm-create-basics">
            <div className="sm-rrow">
              <label className="sm-rrow-label sm-rrow-icon" htmlFor="sm-create-access">
                <Icon name="lock" />
                Permissions
              </label>
              <span className="sm-rrow-control">
                <select
                  id="sm-create-access"
                  className="sm-rselect"
                  value={access.general}
                  onChange={(event) => setAccess({ ...access, general: event.target.value as Access["general"] })}
                >
                  <option value="link">Anyone with the link</option>
                  <option value="invited">Invited only</option>
                </select>
                {access.general === "link" ? (
                  <select className="sm-rselect" aria-label="Link role" value={access.linkRole} onChange={(event) => setAccess({ ...access, linkRole: event.target.value as Access["linkRole"] })}>
                    <option value="contributor">can contribute</option>
                    <option value="voter">can vote</option>
                  </select>
                ) : null}
              </span>
            </div>
            <Later icon="users" name="Space" />
            <Later icon="sliders-horizontal" name="Collaboration rules" />
          </div>
          <div className="sm-create-actions">
            {error ? (
              <span key={tries} className="sm-create-error" id="sm-create-error" role="alert">
                {error}
              </span>
            ) : null}
            <button type="submit" className="sm-button sm-solid cursor-interaction" disabled={busy}>
              <Icon name="plus" size={14} />
              Create steelman
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

/** A setting that comes later, shown where it will be. */
function Later({ icon, name }: { icon: IconName; name: string }) {
  return (
    <div className="sm-rrow sm-rrow-later">
      <span className="sm-rrow-label sm-rrow-icon">
        <Icon name={icon} />
        {name}
      </span>
      <span className="sm-later">Later</span>
    </div>
  );
}
