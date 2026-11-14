// Sign in, and Check your email (L-01), as designed in the prototype on Nov 14
// (docs/prototype/source/steelman-refined.html, authCard): Continue with Google,
// or a 6-digit code by email, typed into six boxes. The prototype's own CSS
// classes, so it looks as approved.

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { emailCode, googleAddress, signInWithCode } from "./account.ts";
import { AuthCard } from "./AuthCard.tsx";

const MESSAGES = {
  noEmail: "Enter your email.",
  badEmail: "That doesn’t look like an email address.",
  tooManyEmails: "Too many codes sent to this address. Try again in an hour.",
  noCode: "Enter the 6-digit code.",
  wrongCode: "That code isn’t right.",
  tooManyTries: "Too many wrong tries. Send a new code.",
  expired: "That code has expired. Send a new code.",
  google: "Google couldn’t confirm your email. Use a code instead.",
  googleOff: "Google sign-in isn’t available. Use a code instead.",
  unreachable: "Couldn’t reach Steelman. Try again.",
} as const;

/** Five wrong tries cancel a code (plans/architecture.md §7). */
const WRONG_TRIES_ALLOWED = 5;

/** Google sends the browser back with ?error=… when it didn't sign someone in. Someone who cancelled at Google needs no message. */
function googleErrorIn(search: string): string {
  const error = new URLSearchParams(search).get("error");
  return error && error !== "access_denied" ? MESSAGES.google : "";
}

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [step, setStep] = useState<"start" | "code">("start");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [googleError, setGoogleError] = useState(() => googleErrorIn(window.location.search));
  const [resent, setResent] = useState(false);
  const [wrongTries, setWrongTries] = useState(0);
  // Once a code has expired or been cancelled by wrong tries, the service deletes it and only says a code is wrong.
  // The screen keeps saying why until a new code is sent.
  const [codeGone, setCodeGone] = useState<"" | "expired" | "tooManyTries">("");
  const [busy, setBusy] = useState(false);
  // Moves the cursor back to the field after something that changes neither the step nor the error (a new code).
  const [refocus, setRefocus] = useState(0);
  const field = useRef<HTMLInputElement>(null);

  // Google's ?error=… has been read; the address goes back to the board's own.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("error")) return;
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  // Each step, and each error, puts the cursor where it's needed.
  useEffect(() => {
    field.current?.focus();
  }, [step, error, googleError, refocus]);

  const fail = (message: string) => {
    setError(message);
    setBusy(false);
  };

  async function sendCode(again: boolean) {
    setBusy(true);
    const answer = await emailCode(email);
    if (answer === "too_many") return fail(MESSAGES.tooManyEmails);
    if (answer === "failed") return fail(MESSAGES.unreachable);
    setStep("code");
    setResent(again);
    setCode("");
    setWrongTries(0);
    setCodeGone("");
    setError("");
    setBusy(false);
    setRefocus((n) => n + 1);
  }

  function submitEmail(event: FormEvent) {
    event.preventDefault();
    setGoogleError("");
    const typed = email.trim();
    setEmail(typed);
    if (!typed) return fail(MESSAGES.noEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed)) return fail(MESSAGES.badEmail);
    void sendCode(false);
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return fail(MESSAGES.noCode);
    setBusy(true);
    const answer = await signInWithCode(email, code);
    if (answer === "signed_in") return onSignedIn();
    if (answer === "failed") return fail(MESSAGES.unreachable);
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

  async function continueWithGoogle() {
    setError("");
    const address = await googleAddress(window.location.pathname);
    if (address) window.location.assign(address);
    else setGoogleError(MESSAGES.googleOff);
  }

  const invalid = error ? { "aria-invalid": true, "aria-describedby": "sm-auth-error" } : {};
  const errorLine = error ? (
    <p className="sm-field-error" id="sm-auth-error" role="alert">
      {error}
    </p>
  ) : null;

  if (step === "code") {
    return (
      <AuthCard>
        <form className="sm-auth-form" onSubmit={(event) => void submitCode(event)} noValidate>
          <h1 className="sm-auth-title sm-auth-signin">Check your email</h1>
          <p className="sm-auth-text" id="sm-auth-sent">
            {resent ? "We sent a new code to" : "We sent a code to"} <strong>{email.toLowerCase()}</strong>.
          </p>
          <label className="sm-field">
            <span>Code</span>
            <span className="sm-code">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="sm-code-box" aria-hidden="true" data-next={i === Math.min(code.length, 5) ? "" : undefined}>
                  {code[i] ?? ""}
                </span>
              ))}
              <input
                ref={field}
                className="sm-code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                spellCheck={false}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setError("");
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "sm-auth-sent sm-auth-error" : "sm-auth-sent"}
              />
            </span>
          </label>
          {errorLine}
          <button type="submit" className="sm-button sm-solid cursor-interaction" disabled={busy}>
            Sign in
          </button>
          <div className="sm-auth-links">
            <button type="button" className="sm-link-button cursor-interaction" disabled={busy} onClick={() => void sendCode(true)}>
              Send a new code
            </button>
            <button
              type="button"
              className="sm-link-button cursor-interaction"
              disabled={busy}
              onClick={() => {
                setStep("start");
                setError("");
              }}
            >
              Use a different email
            </button>
          </div>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <form className="sm-auth-form" onSubmit={submitEmail} noValidate>
        <h1 className="sm-auth-title sm-auth-signin">Sign in</h1>
        <button type="button" className="sm-button sm-google cursor-interaction" onClick={() => void continueWithGoogle()}>
          <GoogleLogo />
          Continue with Google
        </button>
        {googleError ? (
          <p className="sm-field-error sm-auth-google-error" role="alert">
            {googleError}
          </p>
        ) : null}
        <p className="sm-or">
          <span>or</span>
        </p>
        <label className="sm-field">
          <span>Email</span>
          <input
            ref={field}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError("");
            }}
            {...invalid}
          />
        </label>
        {errorLine}
        <button type="submit" className="sm-button sm-solid cursor-interaction" disabled={busy}>
          Email me a code
        </button>
        <p className="sm-field-hint sm-auth-hint sm-auth-terms">
          {/* Plain text until there are pages to link to: the privacy page comes with M1-13, the terms with M-11. */}
          By continuing, you agree to Steelman’s Terms and Privacy Policy.
        </p>
      </form>
    </AuthCard>
  );
}

/** Google's own G, as its sign-in guidelines ask. */
function GoogleLogo() {
  return (
    <svg className="sm-g" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
