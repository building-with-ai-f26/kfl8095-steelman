// A link to a board this account may not open (M3a-9, H-02, M-06), in the
// card "This steelman doesn't exist" uses (NotFound.tsx). It names the
// account signed in and offers another one, as Google Docs' "You need access"
// page does: someone invited at one email is often signed in with another.
// Asking the owner for access is left out until there are invitations (M3b).

import { useEffect, useRef, useState } from "react";
import { readMyAccount } from "./api.ts";
import { forgetPlaces } from "./places.ts";
import { signOut } from "./signIn/account.ts";
import { AuthCard } from "./signIn/AuthCard.tsx";
import { busyButton } from "./busy.ts";
import { forgetTestUser } from "./testUser.ts";

export function NoAccess() {
  /** The email signed in with, read as Your account reads it; a test account has only a username. Null until it's known. */
  const [who, setWho] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [failed, setFailed] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const another = useRef<HTMLButtonElement>(null);
  // The card can take a board's place while someone reads it (the owner turns the link off), and what they were on
  // is gone. The keyboard's place moves to the title, as on a new page, and a screen reader reads it.
  useEffect(() => title.current?.focus(), []);
  useEffect(() => {
    let showing = true;
    void readMyAccount().then(
      (account) => {
        if (showing && account !== "signed_out") setWho(account.email ?? account.username);
      },
      // The card says the rest without it.
      () => {},
    );
    return () => {
      showing = false;
    };
  }, []);

  // The button is off while signing out, which takes the keyboard's place from it. Once it's back on, so is the place.
  useEffect(() => {
    if (failed) another.current?.focus();
  }, [failed]);

  const signInAsAnother = async () => {
    setSigningOut(true);
    setFailed(false);
    const ended = await signOut();
    if (!ended) {
      setSigningOut(false);
      setFailed(true);
      return;
    }
    forgetTestUser();
    forgetPlaces();
    // A fresh page at the same address: signed out, it shows Sign in, and signing in opens this link (App.tsx).
    window.location.reload();
  };

  return (
    <AuthCard label="No access">
      <h1 ref={title} tabIndex={-1} className="sm-auth-title sm-auth-signin sm-quiet-focus">
        You need access
      </h1>
      <p className="sm-auth-text">You don’t have access to this steelman. The owner hasn’t shared it with this account.</p>
      {who !== null && (
        <p className="sm-auth-text">
          {/* ph-no-capture: kept out of analytics and screen replays (M-08). */}
          You’re signed in as <strong className="ph-no-capture">{who}</strong>.
        </p>
      )}
      <a className="sm-button sm-solid cursor-interaction" href="/">
        Go to Your steelmen
      </a>
      {/* Drawn as the sign-in card's "Use a different email" is. */}
      <div className="sm-auth-links">
        <button ref={another} type="button" className="sm-link-button cursor-interaction" {...busyButton(signingOut)} onClick={() => void signInAsAnother()}>
          Sign in with another account
        </button>
      </div>
      {failed && (
        <p className="sm-field-error" role="alert">
          Steelman couldn’t sign you out. Try again.
        </p>
      )}
    </AuthCard>
  );
}
