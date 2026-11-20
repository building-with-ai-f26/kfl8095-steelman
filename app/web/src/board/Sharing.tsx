// Who can get in (H-02): the pill under the question, and the Share panel it
// opens, in the prototype's markup (shareMarkup in
// docs/prototype/source/steelman-refined.html): People with access, General
// access, and the link. Inviting people by name (H-01) and Preview (H-05)
// come later. Everyone sees the panel; only the owner can change it, and in
// the people list the owner sets each member's role, from Viewer to Editor
// (M2-2b, Q27), with a menu by each name, as Google Drive and Figma do.

import { useEffect, useRef, useState } from "react";
import { MEMBER_ROLES } from "@steelman/shared";
import type { Access, Person, Role } from "@steelman/shared";
import { Icon } from "../icons.tsx";
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

export function Sharing({ access, role, me, session }: { access: Access; role: Role; me: string | null; session: BoardSession }) {
  const [open, setOpen] = useState(false);
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

  const change = (next: Partial<Access>) => void session.share({ ...access, ...next });
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
              <section aria-labelledby="sm-people-title">
                <h3 id="sm-people-title">People with access</h3>
                {people ? (
                  <ul className="sm-people">
                    {people.map((person) => (
                      <PersonRow key={person.id} person={person} you={person.id === me} owner={owner} onRole={(next) => void setRole(person, next)} />
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
                    <select aria-label="General access" value={access.general} disabled={!owner} onChange={(event) => change({ general: event.target.value as Access["general"] })}>
                      <option value="invited">{GENERAL.invited}</option>
                      <option value="link">{GENERAL.link}</option>
                    </select>
                  </span>
                  {access.general === "link" ? (
                    <select aria-label="Link role" value={access.linkRole} disabled={!owner} onChange={(event) => change({ linkRole: event.target.value as Access["linkRole"] })}>
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
    </ul>
  );
}

/** One person on the board: the owner sees a menu of roles by each name but their own; everyone else sees the role. */
function PersonRow({ person, you, owner, onRole }: { person: Person; you: boolean; owner: boolean; onRole(role: Exclude<Role, "owner">): void }) {
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
        <select aria-label={`Access level for ${name}`} value={person.role} onChange={(event) => onRole(event.target.value as Exclude<Role, "owner">)}>
          {MEMBER_ROLES.map((each) => (
            <option key={each} value={each}>
              {MEMBER_ROLE[each]}
            </option>
          ))}
        </select>
      ) : (
        <span className="sm-person-role">{MEMBER_ROLE[person.role]}</span>
      )}
    </li>
  );
}
