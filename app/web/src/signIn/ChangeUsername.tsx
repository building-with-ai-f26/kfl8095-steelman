// Changing your username (L-04, M3d-15). The Username row on Your account
// gains Change, as GitHub's account settings offer "Change username" (its docs,
// checked Nov 25: the old name's profile links then answer 404, which the
// hold here avoids for 30 days) and as Google Account's Name row offers Edit
// next to the current name, a field holding it, and Save (support.google.com,
// checked Nov 25). The prototype has no username change, so the form is the
// Email row's (ChangeEmail.tsx): the row keeps its label, its value is hidden
// while editing, and the field with Cancel and Save opens under it. The rules
// and refusal sentences are the ones Choose a username uses (usernameRules.ts).

import { useEffect, useId, useRef, useState } from "react";
import { USERNAME } from "@steelman/shared";
import { changeMyUsername } from "../api.ts";
import { busyButton } from "../busy.ts";
import { useRowEntrance } from "../rows.ts";
import { monthDay } from "../when.ts";
import { USERNAME_SHAPE, usernameProblem, usernameTaken } from "./usernameRules.ts";

const HINT = "Your old username stays reserved for you for 30 days, and links to it lead to your new one.";
const SAME = "That’s already your username.";
const FAILED = "Steelman couldn’t change your username. Try again.";

/** The Username row, and the field to change it. `onStatus` says something in the page's status line. */
export function ChangeUsername({ username, onChanged, onStatus }: { username: string; onChanged(username: string): void; onStatus(status: string): void }) {
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState(username);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const changeButton = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(false);
  // Counts each save and each close, so an answer that comes back after Cancel, Escape, or a newer save leaves the form alone.
  const attempt = useRef(0);
  const errorId = useId();
  const hintId = useId();
  const row = useRef<HTMLDivElement>(null);
  useRowEntrance(row);

  // The cursor goes into the field, with the name selected to type over, and back to Change when it closes.
  useEffect(() => {
    if (editing) field.current?.select();
    else if (wasEditing.current) changeButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const open = () => {
    setTyped(username);
    setError("");
    setEditing(true);
  };
  const close = () => {
    attempt.current++;
    setBusy(false);
    setError("");
    setEditing(false);
  };
  const fail = (message: string) => {
    setError(message);
    setBusy(false);
    field.current?.focus();
  };

  async function save() {
    if (busy) return;
    const name = typed.trim();
    const problem = usernameProblem(name);
    if (problem) return fail(problem);
    if (name === username.toLowerCase()) return fail(SAME);
    setBusy(true);
    const mine = ++attempt.current;
    const answer = await changeMyUsername(name);
    const current = attempt.current === mine;
    if (answer !== "failed" && (answer.status === "done" || answer.status === "already_done")) {
      const now = answer.status === "done" ? answer.username : name;
      // The name changed even if the form was closed meanwhile, so the row shows it either way.
      if (current) close();
      onChanged(now);
      onStatus(`Your username is now ${now}.`);
      return;
    }
    if (!current) return;
    if (answer === "failed") return fail(FAILED);
    if (answer.reason === "taken") return fail(usernameTaken(name));
    if (answer.reason === "reserved") return fail(`${name} is reserved.`);
    if (answer.reason === "invalid") return fail(USERNAME_SHAPE);
    if (answer.reason === "too_soon") return fail(`You can change your username again on ${monthDay(answer.again)}.`);
    fail(FAILED);
  }

  return (
    <>
      <div ref={row} className="sm-rrow">
        <span className="sm-rrow-label">Username</span>
        <span className="sm-rrow-control">
          {/* ph-no-capture: kept out of analytics and screen replays (M-08). */}
          {!editing && <span className="sm-rrow-value ph-no-capture">{username}</span>}
          {!editing && (
            <button ref={changeButton} type="button" className="sm-button cursor-interaction" aria-label="Change username" onClick={open}>
              Change
            </button>
          )}
        </span>
      </div>
      {editing && (
        <div className="sm-pw-form sm-username-form" role="group" aria-label="Change username">
          <label>
            New username
            <input
              ref={field}
              className="ph-no-capture"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={USERNAME.max}
              value={typed}
              onChange={(event) => {
                // Usernames are kept in lower case, so they're shown that way as they're typed.
                setTyped(event.target.value.toLowerCase());
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void save();
                if (event.key === "Escape") close();
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            />
          </label>
          {error && (
            <p className="sm-field-error" id={errorId} role="alert">
              {error}
            </p>
          )}
          <p className="sm-field-hint" id={hintId}>
            {HINT}
          </p>
          <div>
            <button type="button" className="sm-button cursor-interaction" onClick={close}>
              Cancel
            </button>
            <button type="button" className="sm-button sm-solid cursor-interaction" {...busyButton(busy)} onClick={() => void save()}>
              Save
            </button>
          </div>
        </div>
      )}
    </>
  );
}
