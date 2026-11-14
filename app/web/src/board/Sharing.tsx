// Who can get in (H-02): the pill under the question, and the Share panel it
// opens, in the prototype's markup (shareMarkup in
// docs/prototype/source/steelman-refined.html). M1 has the panel's General
// access and its link; inviting people by name (H-01) and Preview (H-05)
// come later. Everyone sees the panel; only the owner can change it.

import { useEffect, useRef, useState } from "react";
import type { Access, Role } from "@steelman/shared";
import { Icon } from "../icons.tsx";
import type { BoardSession } from "./session.ts";

const GENERAL = { invited: "Invited only", link: "Anyone with the link" } as const;
const LINK_ROLE = { voter: "can vote", contributor: "can contribute" } as const;
const MAY = { voter: "read and vote", contributor: "read, vote, and write" } as const;

export function Sharing({ access, role, session }: { access: Access; role: Role; session: BoardSession }) {
  const [open, setOpen] = useState(false);
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
    panel.current?.querySelector<HTMLElement>("select:not(:disabled), footer button")?.focus();
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
          <section ref={panel} id="sm-share" className="sm-share" role="dialog" aria-modal="false" aria-labelledby="sm-share-title">
            <div className="sm-share-head">
              <h2 id="sm-share-title">Share</h2>
              <button type="button" className="sm-icon-button cursor-interaction" aria-label="Close sharing" onClick={close}>
                <Icon name="x" />
              </button>
            </div>
            <div className="sm-share-body">
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
