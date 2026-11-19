import { useCallback, useEffect, useState } from "react";
import { Account } from "./Account.tsx";
import { Hints } from "./Hints.tsx";
import { AnalyticsNotice } from "./AnalyticsNotice.tsx";
import { Board } from "./board/Board.tsx";
import type { Zoom } from "./board/Board.tsx";
import { Icon, Logo } from "./icons.tsx";
import { Home } from "./Home.tsx";
import { NEW_PATH, readLink } from "./links.ts";
import { ReaderContext } from "./reader.ts";
import { NewSteelman } from "./NewSteelman.tsx";
import { NotFound } from "./NotFound.tsx";
import { Privacy } from "./Privacy.tsx";
import { whoIsSignedIn } from "./signIn/account.ts";
import type { Me } from "./signIn/account.ts";
import { AuthCard } from "./signIn/AuthCard.tsx";
import { ChooseUsername } from "./signIn/ChooseUsername.tsx";
import { SignIn } from "./signIn/SignIn.tsx";
import { chooseTestUser, chosenTestUser, listTestUsers } from "./testUser.ts";
import type { TestUser } from "./testUser.ts";

/**
 * Links look like /b/<board ID>, or /b/<board ID>/v/<version ID> (links.ts).
 * Anything outside /b/ is the home page, the list of your steelmen (E-03),
 * except New steelman's sheet (F-01), at /new.
 */
export function App({ path = typeof window === "undefined" ? "/" : window.location.pathname }: { path?: string }) {
  const link = readLink(path);
  const board = link.kind === "board" ? link.board : undefined;
  /** The board's view (E-01): the whole board, or each option's strongest case. */
  const [zoom, setZoom] = useState<Zoom>("read");
  /** The switch shows only while a board is on screen, not on its not-found or no-access page. */
  const [boardShown, setBoardShown] = useState(false);
  const wordmark = (
    <div className="sm-wordmark">
      <Logo />
      {/* On a phone the prototype shows only the logo while a board is open, leaving room for the view switch. */}
      <span className="sm-wordmark-text">steelman.</span>
    </div>
  );
  return (
    <div id="steelman-study" data-indicator="dossier" data-density="comfortable" data-zoom={boardShown ? zoom : undefined}>
      <Hints />
      {link.kind === "privacy" ? (
        // Readable by anyone, signed in or not (M-07).
        <>
          <header className="sm-site">{wordmark}</header>
          <Privacy />
        </>
      ) : (
        <SignedIn
          header={(signedIn) => (
            <header className="sm-site">
              {wordmark}
              <div className="sm-site-tools">
                {signedIn && boardShown ? <ViewSwitch zoom={zoom} onZoom={setZoom} /> : null}
                {signedIn && (board || link.kind === "home") ? (
                  <a className="sm-share-button cursor-interaction" href={NEW_PATH} aria-label="New steelman">
                    <Icon name="plus" size={14} />
                    <span>New steelman</span>
                  </a>
                ) : null}
                {signedIn ? (
                  <a className="sm-me cursor-interaction" href="/account" aria-label="Your account" data-tooltip="Your account" aria-current={link.kind === "account" ? "page" : undefined}>
                    <Icon name="user" size={15} />
                  </a>
                ) : null}
                <TestUserSwitch />
              </div>
            </header>
          )}
        >
          {link.kind === "board" ? (
            <Board boardId={link.board} version={link.version} zoom={zoom} onZoom={setZoom} onShown={setBoardShown} />
          ) : link.kind === "account" ? (
            <Account />
          ) : link.kind === "unknown" ? (
            <NotFound />
          ) : link.kind === "new" ? (
            <NewSteelman />
          ) : (
            <Home />
          )}
        </SignedIn>
      )}
      <AnalyticsNotice />
    </div>
  );
}

/** Board / Strongest case, as the prototype's switch: two pressed buttons, the label hidden on a phone. */
function ViewSwitch({ zoom, onZoom }: { zoom: Zoom; onZoom(zoom: Zoom): void }) {
  const choice = (level: Zoom, icon: "layout-grid" | "award", label: string) => (
    <button type="button" className="cursor-interaction" aria-pressed={zoom === level} aria-label={label} data-tooltip={label} onClick={() => onZoom(level)}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
  return (
    <div className="sm-zoom" role="group" aria-label="View">
      {choice("read", "layout-grid", "Board")}
      {choice("case", "award", "Strongest case")}
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
      {ready ? (
        <ReaderContext.Provider value={who.kind === "signed in" ? who.me.id : chosenTestUser()}>{children}</ReaderContext.Provider>
      ) : (
        <NotYet who={who} ask={ask} retry={() => setWho({ kind: "asking" })} />
      )}
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
