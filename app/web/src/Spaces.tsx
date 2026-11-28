// Spaces on screen (M3d-19; G-01, G-05, E-08): the sidebar beside Home's
// list, a space's card, and the rail's "Needs your help", ported from the
// prototype's sidebar(), spaceCard(), and rail() (docs/prototype/source/
// steelman-refined.html) and drawn by its own CSS (sm-side, sm-space-card,
// sm-rail).
//
// Public spaces (M3d-20, G-07): "Find spaces" ends the sidebar, after New
// space, where Slack's sidebar ends with "Add channels", whose menu browses
// channels (from memory); Slack's Channels directory, read live on Nov 28,
// lists public channels to browse or search by name or description, each
// with Join Channel. A space you joined sits under "Your spaces" with the
// rest, since it's one of yours now, where the prototype grouped joined
// communities apart. The card says "Public space" with a globe or "Private
// space" with a lock (security review F13), where the prototype said
// "Public community"; a found space's card has Join, and a member's card has
// Leave for anyone but its Owner, who can't leave. Leaving a private space
// asks first, in place, since only an invite brings you back, as GitHub asks
// before you leave an organization (from memory); leaving a public one
// doesn't, as Slack's Leave channel doesn't (from memory).
//
// The layout is the prototype's, which copies a workspace sidebar. Slack's
// help page on the sidebar, read live on Nov 26, names its groups with short
// headings ("Channels", "Direct messages") over the items in them; the
// current item is filled in and "Add channels" ends the list (from memory,
// since the app needs a sign-in). Notion's sidebar puts "New page" at its
// foot (from memory), and Discord's server list is a dark rail beside the
// channel list (from memory). GitHub's organization page, read live on Nov
// 26 (github.com/github), leads with the organization's avatar, its name, a
// one-line description, and facts such as its followers and location, with
// its repositories under them: the space's card leads its list the same way,
// with the canvas standing in for the avatar. Google Drive's shared drives
// sit in its sidebar under "Shared drives" (from memory).
//
// Under 900 px the sidebar folds behind a button named "Spaces" in the
// header, as Slack's and Gmail's narrow layouts fold theirs behind a menu
// button (from memory). The button says whether it's open (aria-expanded) and
// names what it opens (aria-controls), as the ARIA disclosure pattern has
// it. Opening it puts the cursor on where you are; Escape, or a click outside
// it, closes it and puts the cursor back on the button. It slides in on
// --sm-medium; the prototype's reduced-motion rule stops the slide.
//
// Every space name and every username sits in ph-no-capture, so PostHog's
// replays never record one (M-08). Tooltips are left off anything that names
// a space, since the tooltip box sits outside the page's masks (Hints.tsx).

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { canInSpace } from "@steelman/shared";
import type { BoardListing, FoundSpace, SpaceSummary } from "@steelman/shared";
import { removeFromSpace } from "./api.ts";
import type { SpaceAnswer } from "./api.ts";
import { busyButton } from "./busy.ts";
import { Icon } from "./icons.tsx";
import { FIND_SPACES_PATH, NEW_SPACE_PATH, boardPath, spacePath, spaceSettingsPath } from "./links.ts";
import { useReader } from "./reader.ts";
import { boardsIn, helpEmpty, helpSentence, membersLabel, needsYourHelp, visibilityLabel } from "./spaces.ts";

/** Whether the folded sidebar is open, and the way to open or close it: held by the page, which draws its button. */
export const NavContext = createContext<{ open: boolean; setOpen(open: boolean): void }>({ open: false, setOpen: () => undefined });

/** Your spaces as the page holds them: not read yet, couldn't be read, or the list. */
export type Spaces = SpaceSummary[] | "failed" | null;

/** The space with this ID among yours, or null. */
export function spaceOf(spaces: Spaces, id: string | null | undefined): SpaceSummary | null {
  return Array.isArray(spaces) && id ? (spaces.find((space) => space.id === id) ?? null) : null;
}

/** Where the prototype's CSS folds the sidebar behind its button. */
const FOLDED = "(max-width: 900px)";

/** Where the reader is, for the sidebar's current link. */
export type SidebarAt = { kind: "home" } | { kind: "space"; space: string } | { kind: "new-space" } | { kind: "find-spaces" };

/**
 * The sidebar (G-01): Home, "Your spaces" with each space's swatch, name, and board count, New space, and Find spaces
 * (G-07). The count
 * waits for the list; the sidebar's width never does, so the list doesn't move when it arrives.
 */
export function Sidebar({ spaces, counts, at }: { spaces: Spaces; counts: Map<string, number> | null; at: SidebarAt }) {
  const nav = useRef<HTMLElement>(null);
  const { open, setOpen } = useContext(NavContext);
  // Folded, it opens on where you are; Escape or a click outside it closes it, and the cursor goes back to its button.
  useEffect(() => {
    if (!open) return;
    nav.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus({ preventScroll: true });
    const button = () => document.getElementById("sm-nav-toggle");
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button()?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!nav.current?.contains(target) && !button()?.contains(target)) setOpen(false);
    };
    // It closes when the window widens past the fold, where the sidebar stands beside the list. A phone's address
    // bar and keyboard resize the window too, so a plain resize leaves it open.
    const folded = window.matchMedia(FOLDED);
    const onFold = () => {
      if (!folded.matches) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    folded.addEventListener("change", onFold);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      folded.removeEventListener("change", onFold);
    };
  }, [open, setOpen]);
  const mine = Array.isArray(spaces) ? spaces : [];
  const current = (here: boolean) => (here ? { "aria-current": "page" as const } : {});
  return (
    <nav ref={nav} className="sm-side" id="sm-side" aria-label="Spaces">
      <div className="sm-side-box">
        <a className="sm-side-link cursor-interaction" href="/" {...current(at.kind === "home")}>
          <Icon name="house" />
          <span>Home</span>
        </a>
      </div>
      {mine.length ? (
        <>
          <h2>Your spaces</h2>
          <div className="sm-side-box ph-no-capture">
            {mine.map((space) => {
              const count = counts?.get(space.id) ?? 0;
              return (
                <a key={space.id} className="sm-side-link cursor-interaction" href={spacePath(space.id)} {...current(at.kind === "space" && at.space === space.id)}>
                  <span className="sm-swatch" data-canvas={space.canvas} aria-hidden="true" />
                  <span className="sm-tag">{space.name}</span>
                  {/* The count's word is said, not drawn, so a screen reader reads "Quokka pod 2 steelmen". */}
                  {counts ? (
                    <span className="sm-side-count">
                      {count}
                      <span className="sm-sr"> {count === 1 ? "steelman" : "steelmen"}</span>
                    </span>
                  ) : null}
                </a>
              );
            })}
          </div>
        </>
      ) : null}
      <a className="sm-side-link sm-side-new cursor-interaction" href={NEW_SPACE_PATH} {...current(at.kind === "new-space")}>
        <Icon name="plus" />
        <span>New space</span>
      </a>
      <a className="sm-side-link sm-side-find cursor-interaction" href={FIND_SPACES_PATH} {...current(at.kind === "find-spaces")}>
        <Icon name="globe" />
        <span>Find spaces</span>
      </a>
    </nav>
  );
}

/**
 * A space's card (G-05): a strip of its canvas, its name and about text, whether it's private or public, how many
 * members it has, Settings for its Owner and Admins, and Leave for anyone but its Owner (G-07). The prototype draws it
 * in the rail on a wide screen and above the list otherwise; its CSS shows one at a time.
 */
export function SpaceCard({ space, onLeft }: { space: SpaceSummary; onLeft?(answer: SpaceAnswer): void }) {
  const settings = canInSpace("reader", space.role, "space_edit") === null;
  // The Owner can't leave; the service refuses them too.
  const leaves = space.role !== "owner" && canInSpace("reader", space.role, "space_leave") === null;
  return (
    <section className="sm-rail-card sm-space-card ph-no-capture" aria-label={`About ${space.name}`}>
      <div className="sm-space-banner" data-canvas={space.canvas} />
      <div className="sm-space-body">
        <h2>{space.name}</h2>
        {space.about ? <p>{space.about}</p> : null}
        <SpaceFacts members={space.members} visibility={space.visibility} />
        {settings || leaves ? (
          <div className="sm-space-actions">
            {settings ? (
              <a className="sm-button cursor-interaction" href={spaceSettingsPath(space.id)}>
                <Icon name="settings" size={14} />
                Settings
              </a>
            ) : null}
            {leaves ? <LeaveSpace space={space} onLeft={onLeft} /> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Leave: at once from a public space, and after asking, in place, from a private one, which only an invite brings you back to. */
function LeaveSpace({ space, onLeft }: { space: SpaceSummary; onLeft: ((answer: SpaceAnswer) => void) | undefined }) {
  const me = useReader();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  // Each of Leave and its question replaces the other, so focus moves with them: to the question's Cancel when it
  // opens, and back to Leave when it's cancelled.
  const cancel = useRef<HTMLButtonElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    (asking ? cancel : button).current?.focus();
  }, [asking]);
  const ask = (next: boolean) => {
    moved.current = true;
    setAsking(next);
  };
  const leave = async () => {
    if (busy || !me) return;
    setBusy(true);
    const answer = await removeFromSpace(space.id, me);
    setBusy(false);
    setAsking(false);
    onLeft?.(answer);
  };
  if (asking) {
    return (
      <div className="sm-space-ask" role="group" aria-label={`Leave ${space.name}`} aria-describedby={`sm-leave-${space.id}`}>
        <p id={`sm-leave-${space.id}`}>You need an invite from its Admins or its Owner to come back to {space.name}.</p>
        <div className="sm-space-actions">
          <button ref={cancel} type="button" className="sm-button cursor-interaction" onClick={() => ask(false)}>
            Cancel
          </button>
          <button type="button" className="sm-button sm-solid cursor-interaction" {...busyButton(busy)} onClick={() => void leave()}>
            Leave
          </button>
        </div>
      </div>
    );
  }
  return (
    <button ref={button} type="button" className="sm-button cursor-interaction" {...busyButton(busy)} onClick={() => (space.visibility === "public" ? void leave() : ask(true))}>
      <Icon name="log-out" size={14} />
      Leave
    </button>
  );
}

/**
 * A public space's card in Find spaces (G-07): the prototype's space card, with Join, which turns into a way to the
 * space once you're in. `justJoined` says this card's Join was the one pressed, so its Open link takes the focus Join had.
 */
export function FoundSpaceCard({ space, joined, justJoined = false, busy, onJoin }: { space: FoundSpace; joined: boolean; justJoined?: boolean; busy: boolean; onJoin(): void }) {
  const open = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (joined && justJoined) open.current?.focus();
  }, [joined, justJoined]);
  return (
    <li className="sm-rail-card sm-space-card ph-no-capture" aria-label={`About ${space.name}`}>
      <div className="sm-space-banner" data-canvas={space.canvas} />
      <div className="sm-space-body">
        <h2>{space.name}</h2>
        {space.about ? <p>{space.about}</p> : null}
        <SpaceFacts members={space.members} visibility={space.visibility} />
        <div className="sm-space-actions">
          {joined ? (
            <a ref={open} className="sm-button cursor-interaction" href={spacePath(space.id)} aria-label={`Open ${space.name}`}>
              Open
            </a>
          ) : (
            <button type="button" className="sm-button sm-solid cursor-interaction" aria-label={`Join ${space.name}`} {...busyButton(busy)} onClick={onJoin}>
              Join
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Whether the space is private or public, and the member count, as the prototype's spaceFacts() lists them. */
export function SpaceFacts({ members, visibility = "private" }: { members: number; visibility?: string }) {
  return (
    <ul className="sm-space-facts">
      <li>
        <Icon name={visibility === "public" ? "globe" : "lock"} />
        {visibilityLabel(visibility)}
      </li>
      <li>
        <Icon name="users" />
        {membersLabel(members)}
      </li>
    </ul>
  );
}

/**
 * The rail's "Needs your help" (E-08): the space's boards with an option under two arguments, each with a sentence that
 * says which. A space with no steelmen has nothing to ask, so the card is left out; its list already says so.
 */
export function HelpCard({ boards, space }: { boards: readonly BoardListing[]; space: string }) {
  if (!boardsIn(boards, space).length) return null;
  const thin = needsYourHelp(boards, space);
  return (
    <section className="sm-rail-card" aria-labelledby="sm-rail-help">
      <h2 id="sm-rail-help">Needs your help</h2>
      {thin.length ? (
        <ul className="sm-rail-list">
          {thin.map((board) => (
            <li key={board.id}>
              <a className="cursor-interaction" href={boardPath(board.id)}>
                <strong>{board.question}</strong>
                <small>{helpSentence(board)}</small>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sm-rail-empty">{helpEmpty(boards, space)}</p>
      )}
    </section>
  );
}
