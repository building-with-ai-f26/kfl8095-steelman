// New steelman (F-01), from the prototype's sheet (createMarkup in
// docs/prototype/source/steelman-refined.html), as the builder revised it on
// Nov 14: white, with the options side by side like the board's columns
// (scrolling sideways on a phone), and the settings under them, each an icon
// and a name. Permissions works (H-02); Collaboration rules (the prototype's
// "How it runs") is shown where it'll be, marked Later. Wording hints (F-02)
// show under the question. The sheet is at /new, a button on the list (E-03),
// and making a board opens it.
//
// Space (M3d-19, G-05) is the prototype's menu of your spaces, first among
// the settings, as its createMarkup() has it, with None for a board in no
// space. Choosing a space offers "Everyone in <space>" in Permissions, chosen
// for you, at the link's role, as Google Drive's General access names the
// organisation (from memory), and the sheet takes the space's canvas. The
// board is made in its space in one write, so it is never left outside it.
// /new?space=<ID> starts on that space, as a space's empty list links here.
// Space names sit in ph-no-capture (M-08).
//
// A public space is in the menu only for its Admins and its Owner (M3d-34,
// security review F1), as GitHub leaves an organization out of a member's
// Owner menu when only its owners create repositories (from memory); the
// prototype lists every joined community, and the app departs from it here
// on purpose. A Member the service refuses anyway, made a Member after the
// sheet opened, reads why, as Slack tells someone in a channel where only
// admins post (checked live, Nov 28).

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { LIMITS, OPTIONS_PER_BOARD, cleanText } from "@steelman/shared";
import type { Access, SpaceSummary } from "@steelman/shared";
import { createBoard, listSpaces } from "./api.ts";
import { questionHints } from "./questionHints.ts";
import { Icon } from "./icons.tsx";
import type { IconName } from "./icons.tsx";
import { boardPath } from "./links.ts";
import { spacesToPostIn } from "./spaces.ts";
import { TitleBar, usePlaceBefore } from "./BackLink.tsx";
import { busyButton } from "./busy.ts";
import { arrivingWithTransition } from "./paging.ts";
import { generalLabel } from "./board/spaceAccess.ts";

/** The space named in the address (/new?space=<ID>), or none. */
function spaceAsked(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("space") ?? "";
}

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
  const [access, setAccess] = useState<Access>(() => ({ general: spaceAsked() ? "space" : "link", linkRole: "contributor" }));
  /** Your spaces, for the Space menu; empty until they're read, or when they can't be. */
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  /** The chosen space's ID, or "" for none. */
  const [spaceId, setSpaceId] = useState(spaceAsked);
  const space = spaces.find((each) => each.id === spaceId) ?? null;
  /** Who can get in as it will be sent: everyone in a space only once that space is one of yours. */
  const chosen: Access = space || access.general !== "space" ? access : { ...access, general: "link" };
  const [error, setError] = useState("");
  /** The field the error is about: "question" or "option-<n>", or null when it's about the whole sheet. */
  const [badField, setBadField] = useState<string | null>(null);
  /** Counts tries, so the same message is announced again on the next try. */
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);
  /** Where the cursor goes next: "question" or "option-<n>". */
  const [focus, setFocus] = useState<string | null>("question");
  const sheet = useRef<HTMLFormElement>(null);
  /** Arriving through the page transition, the sheet rises with the page, not again on its own (M3d-11). */
  const [arrived] = useState(arrivingWithTransition);

  useEffect(() => {
    void listSpaces().then((all) => {
      // Only the spaces you may start a board in (M3d-34).
      const mine = spacesToPostIn(all ?? []);
      setSpaces(mine);
      // A space asked for by the address that isn't one of yours to post in is none.
      if (!mine.some((each) => each.id === spaceAsked()) && spaceAsked()) {
        setSpaceId("");
        setAccess((was) => (was.general === "space" ? { ...was, general: "link" } : was));
      }
    });
  }, []);

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
      answer = await createBoard({ question: cleanText(question), options: options.map(cleanText).filter(Boolean), access: chosen, ...(space ? { space: space.id } : {}) });
    } catch {
      // An answer the app can't read (a proxy's error page, say): never leave the button stuck.
      answer = { problem: "Steelman couldn’t make that board. Try again." };
    }
    if (typeof answer === "string") return window.location.assign(boardPath(answer));
    setBusy(false);
    fail(answer.problem, null);
  }

  /** Where the back arrow and Cancel go (M3a-1). */
  const cameFrom = usePlaceBefore("/new");
  /** What a field needs when the error is about it. */
  const marks = (field: string) => (badField === field ? { "aria-invalid": true, "aria-describedby": "sm-create-error" } : {});
  return (
    <main className="sm-landing sm-create-landing" data-canvas={space?.canvas ?? "cool"}>
      <form ref={sheet} className={arrived ? "sm-create sm-create-page sm-arrived" : "sm-create sm-create-page"} aria-labelledby="sm-create-title" onSubmit={(event) => void submit(event)} noValidate>
        <div className="sm-create-canvas">
          {/* The way back, at the left of the title as on Your account (the builder, Nov 22: "That back option
              should also exist from the 'New steelman' screen"). */}
          <TitleBar here="/new" place={cameFrom}>
            <h1 id="sm-create-title">New steelman</h1>
          </TitleBar>
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
          {/* The prototype's hints (F-02), worked out again as the person types. The list stays in the page when
              it's empty, so that a screen reader reads the first hint when it appears. */}
          <ul className="sm-create-hints" aria-live="polite">
            {questionHints(question, options).map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
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
              <label className="sm-rrow-label sm-rrow-icon" htmlFor="sm-create-space">
                <Icon name="users" />
                Space
              </label>
              <span className="sm-rrow-control">
                <select
                  id="sm-create-space"
                  className="sm-rselect ph-no-capture"
                  value={space ? space.id : ""}
                  onChange={(event) => {
                    const next = event.target.value;
                    setSpaceId(next);
                    // In a space, it starts shared with everyone there; out of one, it can't be.
                    if (next && access.general !== "space") setAccess({ ...access, general: "space" });
                    if (!next && access.general === "space") setAccess({ ...access, general: "link" });
                  }}
                >
                  <option value="">None</option>
                  {spaces.map((each) => (
                    <option key={each.id} value={each.id}>
                      {each.name}
                    </option>
                  ))}
                </select>
              </span>
            </div>
            <div className="sm-rrow">
              <label className="sm-rrow-label sm-rrow-icon" htmlFor="sm-create-access">
                <Icon name="lock" />
                Permissions
              </label>
              <span className="sm-rrow-control">
                <select
                  id="sm-create-access"
                  className="sm-rselect ph-no-capture"
                  value={chosen.general}
                  onChange={(event) => setAccess({ ...access, general: event.target.value as Access["general"] })}
                >
                  {space ? <option value="space">{generalLabel("space", space.name)}</option> : null}
                  <option value="link">Anyone with the link</option>
                  <option value="invited">Invited only</option>
                </select>
                {chosen.general !== "invited" ? (
                  <select
                    className="sm-rselect"
                    aria-label={chosen.general === "space" ? "Space role" : "Link role"}
                    value={access.linkRole}
                    onChange={(event) => setAccess({ ...access, linkRole: event.target.value as Access["linkRole"] })}
                  >
                    <option value="contributor">can contribute</option>
                    <option value="voter">can vote</option>
                  </select>
                ) : null}
              </span>
            </div>
            <Later icon="sliders-horizontal" name="Collaboration rules" />
          </div>
          <div className="sm-create-actions">
            {error ? (
              <span key={tries} className="sm-create-error" id="sm-create-error" role="alert">
                {error}
              </span>
            ) : null}
            {/* The prototype's Cancel, back to where you came from (M3a-1), as the back arrow goes: a board, or the
                list. Google's own forms keep both, the arrow by the title and Cancel by the form's button. */}
            <a className="sm-link-button cursor-interaction" href={cameFrom.path}>
              Cancel
            </a>
            <button type="submit" className="sm-button sm-solid cursor-interaction" {...busyButton(busy)}>
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
