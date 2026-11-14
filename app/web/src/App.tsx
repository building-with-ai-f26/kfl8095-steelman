import { useCallback, useEffect, useState } from "react";
import { Board } from "./board/Board.tsx";
import { Logo } from "./icons.tsx";
import { whoIsSignedIn } from "./signIn/account.ts";
import type { Me } from "./signIn/account.ts";
import { ChooseUsername } from "./signIn/ChooseUsername.tsx";
import { SignIn } from "./signIn/SignIn.tsx";
import { chooseTestUser, chosenTestUser, listTestUsers } from "./testUser.ts";
import type { TestUser } from "./testUser.ts";

/** Links look like /b/<board ID>. Anything else is the home page, which for now only points to the demo board. */
export function App({ path = typeof window === "undefined" ? "/" : window.location.pathname }: { path?: string }) {
  const board = /^\/b\/([A-Za-z0-9_-]{12})\/?$/.exec(path)?.[1];
  if (!board) {
    return (
      <main>
        <h1>Steelman</h1>
        <p>
          <a href="/b/demo-board-1">Open the demo board</a>
        </p>
      </main>
    );
  }
  return (
    <div id="steelman-study" data-indicator="dossier" data-density="comfortable" data-zoom="read">
      <header className="sm-site">
        <div className="sm-wordmark">
          <Logo />
          steelman.
        </div>
        <TestUserSwitch />
      </header>
      <SignedIn>
        <Board boardId={board} />
      </SignedIn>
    </div>
  );
}

type Who = { kind: "asking" } | { kind: "test user" } | { kind: "signed out" } | { kind: "signed in"; me: Me };

/**
 * Draws the board only for someone signed in with a username (L-01). Signed
 * out, it asks them to sign in first and shows nothing of the board; signed in
 * without a username, it asks for one. A tab acting as a test account
 * (development and tests only) skips all of that.
 */
function SignedIn({ children }: { children: React.ReactNode }) {
  const [who, setWho] = useState<Who>(() => (chosenTestUser() !== null ? { kind: "test user" } : { kind: "asking" }));
  const ask = useCallback(() => {
    void whoIsSignedIn().then((me) => setWho(me ? { kind: "signed in", me } : { kind: "signed out" }));
  }, []);
  useEffect(() => {
    if (who.kind === "asking") ask();
  }, [who.kind, ask]);

  if (who.kind === "asking") return null;
  if (who.kind === "signed out") return <SignIn onSignedIn={ask} />;
  if (who.kind === "signed in" && who.me.username === null) return <ChooseUsername email={who.me.email} onChosen={ask} />;
  return children;
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
