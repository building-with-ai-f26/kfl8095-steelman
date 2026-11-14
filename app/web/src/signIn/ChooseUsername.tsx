// Choose a username (L-01), as designed in the prototype on Nov 14: suggested
// from the email, lower case as it's typed, checked against the same rule the
// service uses (@steelman/shared), and picked once.

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { RESERVED_USERNAMES, USERNAME, isAllowedUsername } from "@steelman/shared";
import { chooseUsername } from "./account.ts";
import { AuthCard } from "./AuthCard.tsx";

const SHAPE = `Use ${USERNAME.min} to ${USERNAME.max} letters, numbers, or underscores.`;

/** The part of the email before @, made into a username, if that gives one that's allowed. Whether it's free, the service says. */
export function suggestUsername(email: string): string {
  const name = (email.split("@")[0] ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, USERNAME.max);
  return isAllowedUsername(name) ? name : "";
}

function problemWith(name: string): string {
  if (RESERVED_USERNAMES.includes(name)) return `${name} is reserved.`;
  return isAllowedUsername(name) ? "" : SHAPE;
}

export function ChooseUsername({ email, onChosen }: { email: string; onChosen: () => void }) {
  const [name, setName] = useState(() => suggestUsername(email));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, [error]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const typed = name.trim();
    const problem = problemWith(typed);
    if (problem) return setError(problem);
    setBusy(true);
    const answer = await chooseUsername(typed);
    setBusy(false);
    if (answer === "chosen") return onChosen();
    setError(answer === "taken" ? `${typed} is taken.` : answer === "invalid" ? SHAPE : "Couldn’t reach Steelman. Try again.");
  }

  return (
    <AuthCard>
      <form className="sm-auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <h1 className="sm-auth-title sm-auth-signin">Choose a username</h1>
        <label className="sm-field">
          <span>Username</span>
          <input
            ref={field}
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={USERNAME.max}
            value={name}
            onChange={(event) => {
              // Usernames are kept in lower case, so they're shown that way as they're typed.
              setName(event.target.value.toLowerCase());
              setError("");
            }}
            {...(error ? { "aria-invalid": true, "aria-describedby": "sm-auth-error" } : {})}
          />
        </label>
        {error ? (
          <p className="sm-field-error" id="sm-auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="sm-field-hint sm-auth-hint">Shown on everything you write. You can’t change it later.</p>
        <button type="submit" className="sm-button sm-solid cursor-interaction" disabled={busy}>
          Continue
        </button>
      </form>
    </AuthCard>
  );
}
