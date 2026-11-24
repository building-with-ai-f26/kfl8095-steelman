// Who can get in (H-02): the pill under the question, and the Share panel it
// opens, in the prototype's markup (shareMarkup in
// docs/prototype/source/steelman-refined.html): People with access, General
// access, and the link. The Owner adds people by username and removes them
// (H-01, M3b-7); invitations by email and Preview (H-05) come later. Everyone
// sees the panel; only the owner can change it, and in the people list the
// owner sets each member's role, from Viewer to Editor
// (M2-2b, Q27), with a menu by each name, as Google Drive and Figma do.

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { MEMBER_ROLES, can } from "@steelman/shared";
import type { Access, Closing, Person, Role } from "@steelman/shared";
import { Icon } from "../icons.tsx";
import { closedDay, momentWithZone } from "../when.ts";
import { WHY, blockedProps } from "./display.ts";
import type { Blocked } from "./display.ts";
import type { BoardSession } from "./session.ts";

const GENERAL = { invited: "Invited only", link: "Anyone with the link" } as const;
const LINK_ROLE = { viewer: "can view", voter: "can vote", contributor: "can contribute" } as const;
const MEMBER_ROLE = { ...LINK_ROLE, editor: "can edit" } as const;
const MAY = { viewer: "read", voter: "read and vote", contributor: "read, vote, and write" } as const;

/** Initials from a username's words, ignoring numbers, as the prototype makes them: maya.chen → MC, samr_92 → SA. */
export function initials(name: string): string {
  const words = name.split(/[\s_.@]+/).filter((word) => /^[a-z]/i.test(word));
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? name).slice(0, 2)).toUpperCase();
}

interface SharingProps {
  access: Access;
  role: Role;
  me: string | null;
  session: BoardSession;
  /** Counts the times Settings' "Sharing and access" asked for the panel (M3b-2): each new count opens it. */
  asked?: number;
  /** Whether the board is closed and when (M3b-5): the pill beside this one says so. */
  closing?: Closing | null;
  /** Opens Settings, from the closing pill: the Owner's. */
  onSettings?: () => void;
  /** Whether Settings is open, which the Owner's closing pill says, as the Settings button does. */
  settingsOpen?: boolean;
}

export function Sharing({ access, role, me, session, asked = 0, closing = null, onSettings, settingsOpen = false }: SharingProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (asked > 0) setOpen(true);
  }, [asked]);
  /** Everyone on the board; undefined while it's first read, null if it couldn't be. */
  const [people, setPeople] = useState<Person[] | null | undefined>(undefined);
  /** Each read of the list is numbered, so an older answer can't replace a newer one. */
  const reads = useRef(0);
  const readPeople = async () => {
    const read = ++reads.current;
    const list = await session.people();
    if (read === reads.current) setPeople((shown) => list ?? shown ?? null);
  };
  const [copied, setCopied] = useState(false);
  const pill = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const owner = role === "owner";
  // The shared rule decides (M3b-5): someone who isn't the Owner sees the settings off; on a closed board the Owner
  // sees them faded, saying why, as the service would refuse them.
  const refusal = can(me, role, "share", { closed: closing?.closed ?? false });
  const lockedBy = refusal === "board_closed" ? WHY.closed : null;
  const locked = lockedBy ? { ...blockedProps(lockedBy), onMouseDown: stopOpening, onKeyDown: stopChoosing } : {};
  const link = `${window.location.origin}${window.location.pathname}`;

  const close = () => {
    setOpen(false);
    pill.current?.focus();
  };

  // Escape, or a click anywhere else, closes it.
  useEffect(() => {
    if (!open) return;
    // The cursor goes to the panel itself, not its first setting: a setting focused on opening shows the
    // browser's focus outline even after a click (the builder, Nov 17). Tab reaches the settings from here.
    panel.current?.focus();
    // Only while the cursor is in the panel or on the pill: Escape elsewhere belongs to whatever has the cursor.
    const onKey = (event: KeyboardEvent) => {
      const here = document.activeElement;
      if (event.key === "Escape" && (panel.current?.contains(here) || pill.current === here)) close();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !pill.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  // The list is read with the board, so the panel opens with it drawn, and again each time the panel opens and
  // after the owner changes a role.
  useEffect(() => {
    void readPeople();
  }, [session]);
  useEffect(() => {
    if (open) void readPeople();
  }, [open]);

  /** Removes someone, at once (M3b-7): off the list, and the keyboard back in Add people, as the prototype does. */
  async function remove(person: Person) {
    if (lockedBy) return;
    if (await session.removeMember(person)) {
      setPeople((list) => list?.filter((each) => each.id !== person.id));
      void readPeople();
    }
    panel.current?.querySelector<HTMLInputElement>("#sm-invite-field")?.focus();
  }

  async function setRole(person: Person, next: Exclude<Role, "owner">) {
    const shown = (role: Role) => setPeople((list) => list?.map((each) => (each.id === person.id ? { ...each, role } : each)));
    shown(next);
    // Not saved: the menu goes back to the role they have.
    if (!(await session.setRole(person, next))) shown(person.role);
    await readPeople();
  }

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      session.announce("Link copied.");
    } catch {
      // No clipboard (an insecure page, or permission refused): select the link so it can be copied by hand.
      panel.current?.querySelector<HTMLInputElement>("footer input")?.select();
    }
  }

  const change = (next: Partial<Access>) => {
    if (!lockedBy) void session.share({ ...access, ...next });
  };
  const hint = access.general === "link" ? `Anyone with the link can ${MAY[access.linkRole]}.` : "Only invited people can open it.";

  return (
    <ul className="sm-question-meta" aria-label="About this question">
      <li className="sm-meta-vis">
        <button
          ref={pill}
          type="button"
          className="sm-meta-pill cursor-interaction"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="sm-share"
          onClick={() => (open ? close() : setOpen(true))}
        >
          <Icon name={access.general === "link" ? "globe" : "lock"} size={13} />
          {GENERAL[access.general]}
        </button>
        {open ? (
          <section ref={panel} id="sm-share" className="sm-share" role="dialog" aria-modal="false" aria-labelledby="sm-share-title" tabIndex={-1}>
            <div className="sm-share-head">
              <h2 id="sm-share-title">Share</h2>
              <button type="button" className="sm-icon-button cursor-interaction" aria-label="Close sharing" onClick={close}>
                <Icon name="x" />
              </button>
            </div>
            <div className="sm-share-body">
              {owner ? <InviteRow session={session} lockedBy={lockedBy} onAdded={() => void readPeople()} /> : null}
              <section aria-labelledby="sm-people-title">
                <h3 id="sm-people-title">People with access</h3>
                {people ? (
                  <ul className="sm-people">
                    {people.map((person) => (
                      <PersonRow
                        key={person.id}
                        person={person}
                        you={person.id === me}
                        owner={owner}
                        locked={locked}
                        lockedBy={lockedBy}
                        onRole={(next) => lockedBy || void setRole(person, next)}
                        onRemove={() => void remove(person)}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="sm-access-hint">{people === null ? "Couldn’t load who has access. Close and open Share to try again." : "Loading…"}</p>
                )}
              </section>
              <section aria-labelledby="sm-general-title">
                <h3 id="sm-general-title">General access</h3>
                <div className="sm-person">
                  <span className="sm-avatar sm-access" aria-hidden="true">
                    <Icon name={access.general === "link" ? "globe" : "lock"} />
                  </span>
                  <span>
                    <select aria-label="General access" value={access.general} disabled={refusal === "not_allowed"} {...locked} onChange={(event) => change({ general: event.target.value as Access["general"] })}>
                      <option value="invited">{GENERAL.invited}</option>
                      <option value="link">{GENERAL.link}</option>
                    </select>
                  </span>
                  {access.general === "link" ? (
                    <select aria-label="Link role" value={access.linkRole} disabled={refusal === "not_allowed"} {...locked} onChange={(event) => change({ linkRole: event.target.value as Access["linkRole"] })}>
                      <option value="viewer">{LINK_ROLE.viewer}</option>
                      <option value="voter">{LINK_ROLE.voter}</option>
                      <option value="contributor">{LINK_ROLE.contributor}</option>
                    </select>
                  ) : null}
                </div>
                <p className="sm-access-hint">{hint}</p>
                {owner ? null : <p className="sm-access-hint">Only the owner can change who can get in.</p>}
              </section>
            </div>
            <footer>
              <input type="text" readOnly value={link} aria-label="Link to this steelman" />
              <button type="button" className="sm-button cursor-interaction" onClick={() => void copy()}>
                <Icon name={copied ? "check" : "link"} size={14} />
                {copied ? "Copied" : "Copy link"}
              </button>
            </footer>
          </section>
        ) : null}
      </li>
      {closing ? <ClosingPill closing={closing} onSettings={owner ? onSettings : undefined} settingsOpen={settingsOpen} /> : null}
    </ul>
  );
}

/** A select that's faded doesn't open: a press on it says why instead (Hints.tsx shows its tooltip). */
const stopOpening = (event: ReactMouseEvent) => event.preventDefault();
/** Nor does the keyboard choose in it, though Tab still moves on and the browser's own shortcuts still work. */
const CHOOSING_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", " ", "Enter"]);
const stopChoosing = (event: ReactKeyboardEvent) => {
  const typed = event.key.length === 1 && !event.ctrlKey && !event.metaKey;
  if (CHOOSING_KEYS.has(event.key) || typed) event.preventDefault();
};

/**
 * Beside the sharing pill, with a lock (M3b-5, I-05): "Closed Nov 7", or "Closes Nov 30 at 5 PM EST" while a time is
 * ahead, in the reader's own zone. The time is in its text, not a title, so it can be read on a phone and from the
 * keyboard. For the Owner it is a button that opens Settings, as the prototype's pill opens its settings.
 */
function ClosingPill({ closing, onSettings, settingsOpen }: { closing: Closing; onSettings?: () => void; settingsOpen: boolean }) {
  const text = closing.closed ? `Closed ${closedDay(closing)}` : closing.closesAt ? `Closes ${momentWithZone(closing.closesAt, closing.closesAt)}` : null;
  if (!text) return null;
  const inner = (
    <>
      <Icon name="lock" size={13} />
      {text}
    </>
  );
  return (
    <li className="sm-meta-closing">
      {onSettings ? (
        <button
          type="button"
          className="sm-meta-pill sm-closing-pill cursor-interaction"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          aria-controls={settingsOpen ? "sm-settings" : undefined}
          onClick={onSettings}
        >
          {inner}
        </button>
      ) : (
        <span className="sm-meta-pill sm-closing-pill">{inner}</span>
      )}
    </li>
  );
}

/** One person on the board: the owner sees a menu of roles by each name but their own; everyone else sees the role. */
interface PersonRowProps {
  person: Person;
  you: boolean;
  owner: boolean;
  locked: object;
  lockedBy: Blocked | null;
  onRole(role: Exclude<Role, "owner">): void;
  onRemove(): void;
}

function PersonRow({ person, you, owner, locked, lockedBy, onRole, onRemove }: PersonRowProps) {
  const name = person.name ?? "No username yet";
  return (
    <li className="sm-person">
      <span className={`sm-avatar${you ? " sm-you" : ""}`} aria-hidden="true">
        {person.name ? initials(person.name) : "?"}
      </span>
      <span>
        {name}
        {you ? <small> (you)</small> : null}
      </span>
      {person.role === "owner" ? (
        <span className="sm-person-role">Owner</span>
      ) : owner ? (
        <select aria-label={`Access level for ${name}`} value={person.role} {...locked} onChange={(event) => onRole(event.target.value as Exclude<Role, "owner">)}>
          {MEMBER_ROLES.map((each) => (
            <option key={each} value={each}>
              {MEMBER_ROLE[each]}
            </option>
          ))}
        </select>
      ) : (
        <span className="sm-person-role">{MEMBER_ROLE[person.role]}</span>
      )}
      {/* A button of its own at the row's end, as GitHub's collaborator rows have and as the prototype's × is: not an
          entry in the role menu, which saves on every change, so an arrow key could remove someone (M3b-7). */}
      {owner && person.role !== "owner" ? (
        <button
          type="button"
          className="sm-person-remove cursor-interaction"
          aria-label={`Remove ${person.name ?? "someone without a username"}`}
          data-tooltip={lockedBy?.why ?? "Remove"}
          {...(lockedBy ? { "aria-disabled": true, "data-blocked": "", "aria-describedby": lockedBy.noteId } : {})}
          onClick={() => lockedBy || onRemove()}
        >
          <Icon name="x" />
        </button>
      ) : null}
    </li>
  );
}

/**
 * The prototype's invite row, above People with access, as Google Drive's Add people is (M3b-7, H-01): a field for a
 * username, the role they'll have (it starts at "can contribute"), and Invite. Enter invites too. A problem shows
 * under the field and is read out, as GOV.UK's error message is. No names are suggested while typing: that would make
 * a directory of every account, and Google suggests only your own contacts.
 */
function InviteRow({ session, lockedBy, onAdded }: { session: BoardSession; lockedBy: Blocked | null; onAdded(): void }) {
  const [typed, setTyped] = useState("");
  const [role, setRole] = useState<Exclude<Role, "owner">>("contributor");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Counts attempts, so the same problem twice is a new alert and is read out again.
  const [attempt, setAttempt] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const locked = lockedBy ? blockedProps(lockedBy) : {};

  async function send() {
    if (lockedBy || busy) return;
    setAttempt((n) => n + 1);
    if (!typed.trim()) {
      setProblem("Type who you want to add.");
      field.current?.focus();
      return;
    }
    setBusy(true);
    let refused: string | null;
    try {
      refused = await session.invite(typed, role);
    } finally {
      setBusy(false);
    }
    setProblem(refused);
    if (refused) return field.current?.focus();
    setTyped("");
    onAdded();
    field.current?.focus();
  }

  return (
    <div className="sm-share-invite">
      <div className="sm-share-field" data-invalid={problem ? "" : undefined}>
        <input
          ref={field}
          id="sm-invite-field"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="Username"
          aria-label="Add people"
          aria-invalid={problem ? true : undefined}
          aria-describedby={[problem ? "sm-invite-error" : "", lockedBy?.noteId ?? ""].filter(Boolean).join(" ") || undefined}
          readOnly={lockedBy !== null}
          {...(lockedBy ? { "aria-disabled": true, "data-blocked": "", "data-tooltip": lockedBy.why } : {})}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <select
          aria-label="Access level for new people"
          value={role}
          {...locked}
          {...(lockedBy ? { onMouseDown: stopOpening, onKeyDown: stopChoosing } : {})}
          onChange={(event) => lockedBy || setRole(event.target.value as Exclude<Role, "owner">)}
        >
          {MEMBER_ROLES.map((each) => (
            <option key={each} value={each}>
              {MEMBER_ROLE[each]}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="sm-button sm-solid cursor-interaction" disabled={busy} {...locked} onClick={() => void send()}>
        Invite
      </button>
      {problem ? (
        <p key={attempt} className="sm-field-error" id="sm-invite-error" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
