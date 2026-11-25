// Changing your email (M2-8c, L-04), as the prototype's Account card has it
// (approved Nov 22, after Notion): the Email row's Change opens New email with
// Cancel and Send code; then "Confirm your new email" asks for the 6-digit code
// sent there, with sign-in's code boxes and messages. The email changes only
// when the code is entered; the service then tells the old address.

import { useEffect, useId, useRef, useState } from "react";
import { changeEmail, emailChangeCode } from "./account.ts";
import { CodeBoxes } from "./CodeBoxes.tsx";
import { busyButton } from "../busy.ts";
import { useRowEntrance } from "../rows.ts";

const MESSAGES = {
  noEmail: "Enter your new email.",
  badEmail: "That doesn’t look like an email address.",
  same: "That’s already your email.",
  tooManyEmails: "We’ve sent too many codes to this address. Try again in an hour.",
  noCode: "Enter the 6-digit code.",
  wrongCode: "That code isn’t right.",
  tooManyTries: "You entered a wrong code too many times. Send a new code.",
  expired: "That code has expired. Send a new code.",
  taken: "Another account already uses this email.",
  // Said for no reply and for an error reply alike (account.ts answers "failed" for both), so they blame neither the
  // connection nor the service.
  sendFailed: "Steelman couldn’t send the code. Try again.",
  changeFailed: "Steelman couldn’t change your email. Try again.",
} as const;

/** Five wrong tries cancel a code, as for signing in (plans/architecture.md §7). */
const WRONG_TRIES_ALLOWED = 5;

type Step = { at: "row" } | { at: "new" } | { at: "code"; to: string };

/** The Email row, and the steps to change it. `onStatus` says something in the page's status line. */
export function ChangeEmail({ email, onChanged, onStatus }: { email: string; onChanged(email: string): void; onStatus(status: string): void }) {
  const [step, setStep] = useState<Step>({ at: "row" });
  const [typed, setTyped] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /** Whether the wait is for a new code, so the busy state is on Send a new code rather than on Change email (M3d-11). */
  const [resending, setResending] = useState(false);
  const [wrongTries, setWrongTries] = useState(0);
  /** Set once the code can't work any more, so trying again says why. */
  const [codeGone, setCodeGone] = useState<"" | "expired" | "tooManyTries">("");
  const changeButton = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const backToRow = useRef(false);
  const cancelled = useRef(false);
  const errorId = useId();
  const sentId = useId();
  const row = useRef<HTMLDivElement>(null);
  useRowEntrance(row);

  // The cursor goes to each step's field, and back to Change when the steps close.
  useEffect(() => {
    if (step.at === "row") {
      if (backToRow.current) changeButton.current?.focus();
    } else field.current?.focus();
    backToRow.current = step.at !== "row";
  }, [step]);

  const fail = (message: string) => {
    setError(message);
    setBusy(false);
    field.current?.focus();
  };

  async function sendCode(to: string, again: boolean) {
    setBusy(true);
    setResending(again);
    const answer = await emailChangeCode(to);
    // Cancelled while it was asking: the answer is no longer wanted.
    if (cancelled.current) return;
    if (answer === "too_many") return fail(MESSAGES.tooManyEmails);
    if (answer === "failed") return fail(MESSAGES.sendFailed);
    setStep({ at: "code", to });
    setCode("");
    setWrongTries(0);
    setCodeGone("");
    setError("");
    setBusy(false);
    onStatus(again ? `We sent a new code to ${to}. The earlier code no longer works.` : `We sent a code to ${to}.`);
    if (again) field.current?.focus();
  }

  function submitEmail() {
    const to = typed.trim().toLowerCase();
    cancelled.current = false;
    if (!to) return fail(MESSAGES.noEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail(MESSAGES.badEmail);
    if (to === email.toLowerCase()) return fail(MESSAGES.same);
    void sendCode(to, false);
  }

  async function submitCode(to: string) {
    if (!/^\d{6}$/.test(code)) return fail(MESSAGES.noCode);
    setBusy(true);
    setResending(false);
    const answer = await changeEmail(to, code);
    if (answer === "changed") {
      setBusy(false);
      setTyped("");
      setStep({ at: "row" });
      onChanged(to);
      onStatus(`Your email is now ${to}. We sent a note to your old email.`);
      return;
    }
    if (answer === "taken") return fail(MESSAGES.taken);
    if (answer === "failed") return fail(MESSAGES.changeFailed);
    const gone = answer === "expired" ? "expired" : answer === "too_many_tries" ? "tooManyTries" : codeGone;
    if (gone) {
      setCodeGone(gone);
      return fail(MESSAGES[gone]);
    }
    const tries = wrongTries + 1;
    setWrongTries(tries);
    if (tries < WRONG_TRIES_ALLOWED) return fail(MESSAGES.wrongCode);
    setCodeGone("tooManyTries");
    fail(MESSAGES.tooManyTries);
  }

  const close = (said?: string) => {
    cancelled.current = true;
    setBusy(false);
    setStep({ at: "row" });
    setError("");
    setTyped("");
    if (said) onStatus(said);
  };
  const keys = (submit: () => void, cancel: () => void) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") submit();
    if (event.key === "Escape") cancel();
  };
  const errorLine = error ? (
    <p className="sm-field-error" id={errorId} role="alert">
      {error}
    </p>
  ) : null;

  return (
    <>
      <div ref={row} className="sm-rrow">
        <span className="sm-rrow-label">Email</span>
        {step.at !== "new" && (
          <span className="sm-rrow-control">
            {/* ph-no-capture: kept out of analytics and screen replays (M-08). */}
            <span className="sm-rrow-value ph-no-capture">{email}</span>
            {step.at === "row" && (
              <button ref={changeButton} type="button" className="sm-button cursor-interaction" onClick={() => setStep({ at: "new" })}>
                Change
              </button>
            )}
          </span>
        )}
      </div>
      {step.at === "new" && (
        <div className="sm-pw-form" role="group" aria-label="Change email">
          <label>
            New email
            <input
              ref={field}
              className="ph-no-capture"
              type="email"
              autoComplete="email"
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
                setError("");
              }}
              onKeyDown={keys(submitEmail, () => close())}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          {errorLine}
          <div>
            <button type="button" className="sm-button cursor-interaction" onClick={() => close()}>
              Cancel
            </button>
            <button type="button" className="sm-button sm-solid cursor-interaction" {...busyButton(busy)} onClick={submitEmail}>
              Send code
            </button>
          </div>
        </div>
      )}
      {step.at === "code" && (
        <div className="sm-pw-form sm-email-confirm" role="group" aria-labelledby={`${sentId}-title`}>
          <h2 id={`${sentId}-title`}>Confirm your new email</h2>
          <p id={sentId}>
            We sent a code to <strong className="ph-no-capture">{step.to}</strong>. Your email changes when you enter it.
          </p>
          <label className="sm-field">
            <span>Code</span>
            <CodeBoxes
              value={code}
              inputRef={field}
              onChange={(entered) => {
                setCode(entered);
                setError("");
              }}
              onKeyDown={keys(() => void submitCode(step.to), () => close("Your email hasn’t changed."))}
              invalid={Boolean(error)}
              describedBy={error ? `${sentId} ${errorId}` : sentId}
            />
          </label>
          {errorLine}
          <div className="sm-auth-links">
            <button type="button" className="sm-link-button cursor-interaction" {...busyButton(busy && resending)} disabled={busy} onClick={() => {
                cancelled.current = false;
                void sendCode(step.to, true);
              }}>
              Send a new code
            </button>
          </div>
          <div>
            <button type="button" className="sm-button cursor-interaction" onClick={() => close("Your email hasn’t changed.")}>
              Cancel
            </button>
            <button type="button" className="sm-button sm-solid cursor-interaction" {...busyButton(busy && !resending)} disabled={busy} onClick={() => void submitCode(step.to)}>
              Change email
            </button>
          </div>
        </div>
      )}
    </>
  );
}
