import { useCallback, useEffect, useState } from "react";
import { AnalyticsNotice } from "./AnalyticsNotice.tsx";
import { Board } from "./board/Board.tsx";
import { Icon, Logo } from "./icons.tsx";
import { NewSteelman } from "./NewSteelman.tsx";
import { whoIsSignedIn } from "./signIn/account.ts";
import type { Me } from "./signIn/account.ts";
import { AuthCard } from "./signIn/AuthCard.tsx";
import { ChooseUsername } from "./signIn/ChooseUsername.tsx";
import { SignIn } from "./signIn/SignIn.tsx";
import { chooseTestUser, chosenTestUser, listTestUsers } from "./testUser.ts";
import type { TestUser } from "./testUser.ts";

/**
 * Links look like /b/<board ID>. Anything else is the home page, which in M1
 * is New steelman (F-01): there's no list of boards yet, so people come back
 * to a board by its link.
 */
export function App({ path = typeof window === "undefined" ? "/" : window.location.pathname }: { path?: string }) {
  const board = /^\/b\/([A-Za-z0-9_-]{12})\/?$/.exec(path)?.[1];
  return (
    <div id="steelman-study" data-indicator="dossier" data-density="comfortable" data-zoom="read">
      <SignedIn
        header={(signedIn) => (
          <header className="sm-site">
            <div className="sm-wordmark">
              <Logo />
              steelman.
            </div>
            <div className="sm-site-tools">
              {signedIn && board ? (
                <a className="sm-share-button cursor-interaction" href="/" aria-label="New steelman">
                  <Icon name="plus" size={14} />
                  <span>New steelman</span>
                </a>
              ) : null}
              <TestUserSwitch />
            </div>
          </header>
        )}
      >
        {board ? <Board boardId={board} /> : <NewSteelman />}
      </SignedIn>
      <AnalyticsNotice />
    </div>
  );
}

type Who = { kind: "asking" } | { kind: "test user" } | { kind: "signed out" } | { kind: "signed in"; me: Me } | { kind: "unreachable" };

/**
 * Draws the board only for someone signed in with a username (L-01). Signed
 * out, it asks them to sign in first and shows nothing of the board; signed in
 * without a username, it asks for one. A tab acting as a test account
 * (development and tests only) skips all of that.
 */
function SignedIn({ header, children }: { header: (signedIn: boolean) => React.ReactNode; children: React.ReactNode }) {
  const [who, setWho] = useState<Who>(() => (chosenTestUser() !== null ? { kind: "test user" } : { kind: "asking" }));
  const ask = useCallback(() => {
    void whoIsSignedIn().then((me) => setWho(me === "unreachable" ? { kind: "unreachable" } : me ? { kind: "signed in", me } : { kind: "signed out" }));
  }, []);
  useEffect(() => {
    if (who.kind === "asking") ask();
  }, [who.kind, ask]);

  const ready = who.kind === "test user" || (who.kind === "signed in" && who.me.username !== null);
  return (
    <>
      {header(ready)}
      {ready ? children : <NotYet who={who} ask={ask} retry={() => setWho({ kind: "asking" })} />}
    </>
  );
}

/** What stands before the page: nothing while asking, then Sign in, Choose a username, or Couldn't reach Steelman. */
function NotYet({ who, ask, retry }: { who: Who; ask: () => void; retry: () => void }) {
  if (who.kind === "unreachable") {
    return (
      <AuthCard>
        <h1 className="sm-auth-title sm-auth-signin">Couldn’t reach Steelman</h1>
        <button type="button" className="sm-button sm-solid cursor-interaction" onClick={retry}>
          Try again
        </button>
      </AuthCard>
    );
  }
  if (who.kind === "signed out") return <SignIn onSignedIn={ask} />;
  if (who.kind === "signed in") return <ChooseUsername email={who.me.email} onChosen={ask} />;
  return null;
}

/** Each tab can act as a test account instead of signing in (development and tests only). */
function TestUserSwitch() {
  const [users, setUsers] = useState<TestUser[]>([]);
  useEffect(() => {
    void listTestUsers().then(setUsers);
  }, []);
  if (users.length === 0) return null;
  return (
    <label className="sm-test-user">
      <span>Acting as</span>
      <select
        value={chosenTestUser() ?? ""}
        onChange={(event) => {
          chooseTestUser(event.target.value);
          window.location.reload();
        }}
      >
        {chosenTestUser() === null ? (
          <option value="" disabled>
            No one
          </option>
        ) : null}
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.username}
          </option>
        ))}
      </select>
    </label>
  );
}
