import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Account } from "./Account.tsx";
import { Hints } from "./Hints.tsx";
import { AnalyticsNotice } from "./AnalyticsNotice.tsx";
import { Board } from "./board/Board.tsx";
import type { Zoom } from "./board/Board.tsx";
import { Icon, Logo } from "./icons.tsx";
import { Home } from "./Home.tsx";
import { NEW_PATH, boardPath, readLink, spacePath } from "./links.ts";
import { ReaderContext } from "./reader.ts";
import { NewSteelman } from "./NewSteelman.tsx";
import { NotFound } from "./NotFound.tsx";
import { Privacy } from "./Privacy.tsx";
import { Profile } from "./Profile.tsx";
import { whoIsSignedIn } from "./signIn/account.ts";
import type { Me } from "./signIn/account.ts";
import { AuthCard } from "./signIn/AuthCard.tsx";
import { ChooseUsername } from "./signIn/ChooseUsername.tsx";
import { SignIn } from "./signIn/SignIn.tsx";
import { chooseTestUser, chosenTestUser, listTestUsers } from "./testUser.ts";
import type { TestUser } from "./testUser.ts";
import { forgetPlaces } from "./places.ts";
import { cameFromHome, cameFromList, forgetOpening, lastAddress, leavesQuietly, noteReturn, plainClick } from "./opening.ts";
import { beforeZoom, holdBoard, putAway } from "./board/zoom.ts";
import { watchPageChanges } from "./paging.ts";
import { NavContext } from "./Spaces.tsx";
import { SpaceSettings } from "./SpaceSettings.tsx";
import { FindSpaces } from "./FindSpaces.tsx";

/**
 * Links look like /b/<board ID>, /b/<board ID>/v/<version ID>, or /b/<board ID>/c/<comment ID> (links.ts).
 * Anything outside /b/ is the home page, the list of your steelmen (E-03),
 * except New steelman's sheet (F-01), at /new, and a person's profile (L-03), at /u/<username>.
 * A space's page, /s/<space ID>, is the list showing only that space's boards; its settings are
 * /s/<space ID>/settings, and New space is /spaces/new (M3d-19). Find spaces, the public spaces you haven't joined,
 * is /spaces/find (M3d-20); signed out, SignedIn asks for sign-in and shows none of them.
 *
 * A board opened from the list by a plain click, and the way back to the list
 * from it, change the page inside this one, with the browser's history
 * (M3d-9, opening.ts), so that the board grows out of its miniature and
 * shrinks back into it. Every other way between pages loads the page, and
 * between Home, New steelman, Your account, and the privacy page the browser
 * draws the new page rising over the old (M3d-11, paging.ts).
 */
export function App({ path: first = typeof window === "undefined" ? "/" : window.location.pathname }: { path?: string }) {
  const [path, setPath] = useState(first);
  const link = readLink(path);
  const board = link.kind === "board" ? link.board : undefined;
  /** The board's view (E-01): the whole board, or each option's strongest case. */
  const [zoom, setZoom] = useState<Zoom>("read");
  /** The switch shows only while a board is on screen, not on its not-found or no-access page. */
  const [boardShown, setBoardShown] = useState(false);
  /** The board's space, for the top bar's breadcrumb, when the reader is in it (M3d-19). */
  const [boardSpace, setBoardSpace] = useState<{ id: string; name: string } | null>(null);
  /** Whether the sidebar, folded behind its button under 900 px, is open (M3d-19). */
  const [navOpen, setNavOpen] = useState(false);
  const nav = useMemo(() => ({ open: navOpen, setOpen: setNavOpen }), [navOpen]);
  /** The pages with the sidebar beside them: Home, a space's page, its settings, New space, and Find spaces. */
  const withSidebar = link.kind === "home" || link.kind === "space-settings" || link.kind === "new-space" || link.kind === "find-spaces";
  const shownPath = useRef(path);
  shownPath.current = path;
  const zoomShown = useRef(zoom);
  zoomShown.current = zoom;
  /** Each page opens on the whole board, as a page load does. */
  const show = useCallback((next: string) => {
    setPath(next);
    setZoom("read");
    setNavOpen(false);
  }, []);
  /** Switching views scales the scene from the centred card, or from the card Strongest case opens (M3d-9). */
  const zoomTo = useCallback((level: Zoom, card: string | null = null) => {
    if (zoomShown.current === level) return;
    beforeZoom(level, card);
    setZoom(level);
  }, []);
  /** A post's question opens its board inside the page, with its own entry in the browser's history. */
  const open = useCallback(
    (next: string) => {
      putAway();
      window.history.pushState(null, "", next);
      // A board opens at its top, as a page load opens it.
      window.scrollTo(0, 0);
      show(next);
    },
    [show],
  );
  // The page transition between the pages outside a board (M3d-11).
  useEffect(() => watchPageChanges(), []);
  // Back and Forward between the list and a board opened from it. A board with actions waiting is left by loading
  // the page, so the browser asks first (Q20): its address goes back, and the page then loads the one asked for.
  useEffect(() => {
    const popped = () => {
      const was = readLink(shownPath.current);
      const next = window.location.pathname;
      const going = readLink(next);
      forgetOpening();
      putAway();
      if (was.kind === "board" && !(going.kind === "board" && going.board === was.board)) {
        if (!leavesQuietly()) {
          window.history.pushState(null, "", lastAddress(was.board) ?? boardPath(was.board));
          window.location.assign(next);
          return;
        }
        if (going.kind === "home" && cameFromList(was.board)) noteReturn(was.board, holdBoard(was.board));
      }
      show(next);
    };
    window.addEventListener("popstate", popped);
    return () => window.removeEventListener("popstate", popped);
  }, [show]);
  // The wordmark leads home, to the list of your steelmen (E-03), as the prototype's does. From a board opened from
  // the list it goes back there, as Back does, so that the board shrinks into its post. From a board opened from a
  // space's list, it loads Home, since that's where it says it leads.
  const wordmark = (
    <a
      className="sm-wordmark"
      href="/"
      aria-label="steelman. Your steelmen"
      onClick={(event) => {
        if (!board || !plainClick(event) || !cameFromHome(board) || !leavesQuietly()) return;
        event.preventDefault();
        window.history.back();
      }}
    >
      <Logo />
      {/* On a phone the prototype shows only the logo while a board is open, leaving room for the view switch. */}
      <span className="sm-wordmark-text">steelman.</span>
    </a>
  );
  return (
    <div id="steelman-study" data-indicator="dossier" data-density="comfortable" data-zoom={boardShown ? zoom : undefined} data-nav-open={navOpen && withSidebar ? "" : undefined}>
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
              {/* The sidebar's button, drawn under 900 px by the prototype's CSS, on the pages that have the sidebar. */}
              {signedIn && withSidebar ? (
                <button
                  id="sm-nav-toggle"
                  type="button"
                  className="sm-nav-toggle cursor-interaction"
                  aria-expanded={navOpen}
                  aria-controls="sm-side"
                  aria-label="Spaces"
                  onClick={() => setNavOpen((open) => !open)}
                >
                  <Icon name={navOpen ? "x" : "menu"} />
                </button>
              ) : null}
              {wordmark}
              {/* The board's space, as the prototype's breadcrumb names it after the wordmark: a way to the space's page. */}
              {signedIn && board && boardSpace ? (
                <nav className="sm-crumbs ph-no-capture" aria-label="Breadcrumb">
                  <span aria-hidden="true">/</span>
                  <a className="sm-tag cursor-interaction" href={spacePath(boardSpace.id)}>
                    {boardSpace.name}
                  </a>
                </nav>
              ) : null}
              <div className="sm-site-tools">
                {signedIn && boardShown ? <ViewSwitch zoom={zoom} onZoom={zoomTo} /> : null}
                {signedIn && (board || link.kind === "home") ? (
                  // On a space's page, the new steelman starts in that space, as the prototype's draft does.
                  <a className="sm-share-button cursor-interaction" href={link.kind === "home" && link.space ? `${NEW_PATH}?space=${link.space}` : NEW_PATH} aria-label="New steelman">
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
            <Board key={link.board} boardId={link.board} version={link.version} comment={link.comment ?? null} zoom={zoom} onZoom={zoomTo} onShown={setBoardShown} onSpace={setBoardSpace} />
          ) : link.kind === "account" ? (
            <Account />
          ) : link.kind === "profile" ? (
            // Signed out, SignedIn asks for sign-in and shows nothing of the profile (L-03).
            <Profile key={link.username ?? ""} username={link.username} />
          ) : link.kind === "unknown" ? (
            <NotFound />
          ) : link.kind === "new" ? (
            <NewSteelman />
          ) : link.kind === "find-spaces" ? (
            <NavContext.Provider value={nav}>
              <FindSpaces />
            </NavContext.Provider>
          ) : link.kind === "space-settings" || link.kind === "new-space" ? (
            <NavContext.Provider value={nav}>
              <SpaceSettings space={link.kind === "space-settings" ? link.space : null} />
            </NavContext.Provider>
          ) : (
            <NavContext.Provider value={nav}>
              <Home key={link.space ?? ""} space={link.space ?? null} onOpen={open} />
            </NavContext.Provider>
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
          // Another person, so not the last one's way back (M3a-1).
          forgetPlaces();
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
