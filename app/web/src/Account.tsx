// Your account (M-07, M1-12): who you are, how you sign in, Download your
// data, and Delete account, in the prototype's Account card (profileMarkup,
// privacyGroup, deleteForm, and deletedMarkup in
// docs/prototype/source/steelman-refined.html). Typing your username to
// confirm a deletion is GitHub's way too (checked on docs.github.com).

import { useEffect, useId, useRef, useState } from "react";
import { deleteMyAccount, downloadMyData, listBoards, readMyAccount } from "./api.ts";
import type { MyAccount } from "./api.ts";
import { boardPath } from "./links.ts";
import { forgetTestUser } from "./testUser.ts";

const DELETED = "deleted_account";

export function Account() {
  const [account, setAccount] = useState<MyAccount | "signed_out" | null>(null);
  const [status, setStatus] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  /** Where Take it opens the tour (L-02): the most recently changed board with arguments to point at, as the prototype's opens the last board. */
  const [tourBoard, setTourBoard] = useState<string | null>(null);
  const deleteLink = useRef<HTMLButtonElement>(null);
  const wasDeleting = useRef(false);
  useEffect(() => {
    void readMyAccount().then(setAccount);
    void listBoards().then((list) => {
      if (typeof list === "string") return;
      setTourBoard(list.boards.find((board) => board.options.some((option) => option.arguments > 0))?.id ?? null);
    });
  }, []);
  // Cancel puts the cursor back on Delete account.
  useEffect(() => {
    if (wasDeleting.current && !deleting) deleteLink.current?.focus();
    wasDeleting.current = deleting;
  }, [deleting]);

  if (deleted) return <Deleted />;
  if (account === null) return null;
  if (account === "signed_out") return <p className="sm-meta">You’ve been signed out. Reload the page to sign in.</p>;

  const download = async () => setStatus((await downloadMyData()) ? "Downloaded steelman-data.json." : "Couldn’t download your data. Try again.");
  return (
    <main className="sm-landing" data-canvas="cool">
      <div className="sm-landing-inner">
        <section className="sm-rail-card sm-landing-auth sm-account" aria-labelledby="sm-account-title">
          <h1 id="sm-account-title" className="sm-auth-title">
            Your account
          </h1>
          <div className="sm-rgroup">
            {/* ph-no-capture: kept out of analytics and screen replays (M-08). */}
            <Row label="Username">
              <span className="sm-rrow-value ph-no-capture">{account.username}</span>
            </Row>
            {account.email && (
              <Row label="Email">
                <span className="sm-rrow-value ph-no-capture">{account.email}</span>
              </Row>
            )}
          </div>
          {account.signIn.length > 0 && (
            <div className="sm-rgroup">
              <h2>Sign in with</h2>
              {account.signIn.map((method) => (
                <Row key={method} label={method} />
              ))}
            </div>
          )}
          {/* Only once there's a board with something to point at: before then, the tour hasn't shown either. */}
          {tourBoard && (
            <div className="sm-rgroup">
              <Row label="Tour" hint="The three votes, on a board">
                <span className="sm-rrow-control">
                  <a className="sm-button cursor-interaction" href={`${boardPath(tourBoard)}?tour`}>
                    Take it
                  </a>
                </span>
              </Row>
            </div>
          )}
          <div className="sm-rgroup">
            <h2>Privacy</h2>
            <Row label="Your data" hint="What you wrote, voted, and assessed">
              <span className="sm-rrow-control">
                <button type="button" className="sm-button cursor-interaction" onClick={() => void download()}>
                  Download
                </button>
              </span>
            </Row>
            <Row label="Privacy notice">
              <span className="sm-rrow-control">
                <a className="sm-button cursor-interaction" href="/privacy">
                  Read
                </a>
              </span>
            </Row>
          </div>
          {deleting ? (
            <DeleteForm
              username={account.username ?? ""}
              onCancel={() => setDeleting(false)}
              onDeleted={() => {
                forgetTestUser();
                setDeleted(true);
              }}
            />
          ) : (
            <button ref={deleteLink} type="button" className="sm-link-button sm-delete-link cursor-interaction" onClick={() => setDeleting(true)}>
              Delete account
            </button>
          )}
        </section>
      </div>
      <div id="sm-status" className="sm-live" role="status" aria-live="polite">
        {status}
      </div>
    </main>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="sm-rrow">
      <span className="sm-rrow-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </div>
  );
}

function DeleteForm({ username, onCancel, onDeleted }: { username: string; onCancel(): void; onDeleted(): void }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const errorId = useId();
  useEffect(() => field.current?.focus(), []);

  const confirm = async () => {
    // As the service does, capitals don't matter.
    if (typed.trim().toLowerCase() !== username.toLowerCase()) {
      setError(`Type ${username} exactly.`);
      field.current?.focus();
      return;
    }
    setSending(true);
    const outcome = await deleteMyAccount(typed.trim());
    setSending(false);
    if (outcome === "done") return onDeleted();
    setError(outcome === "failed" ? "Couldn’t delete your account. Nothing was deleted; try again." : `Type ${username} exactly.`);
    field.current?.focus();
  };
  return (
    <div className="sm-pw-form sm-delete-form" role="group" aria-labelledby="sm-delete-title">
      <h3 id="sm-delete-title">Delete your account?</h3>
      <p>
        Your email, votes, and assessments are removed. Arguments, wordings, and sources you wrote stay on their boards, credited to <b>{DELETED}</b>.
      </p>
      <p>A board you own passes to its longest-standing contributor. A board with no other contributor is deleted.</p>
      <label>
        {`Type ${username} to confirm`}
        <input
          ref={field}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void confirm();
            if (event.key === "Escape") onCancel();
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      {error && (
        <p className="sm-field-error" id={errorId}>
          {error}
        </p>
      )}
      <div>
        <button type="button" className="sm-button cursor-interaction" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="sm-button sm-danger cursor-interaction" disabled={sending} onClick={() => void confirm()}>
          Delete account
        </button>
      </div>
    </div>
  );
}

function Deleted() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <main className="sm-landing" data-canvas="cool" aria-label="Account deleted">
      <div className="sm-landing-inner">
        <section className="sm-rail-card sm-landing-auth">
          <h1 ref={heading} tabIndex={-1} className="sm-auth-title">
            Your account is deleted
          </h1>
          <p className="sm-auth-text">{`Your email, votes, and assessments are gone. What you wrote stays on its boards, credited to ${DELETED}.`}</p>
          <a className="sm-button sm-solid cursor-interaction" href="/">
            Back to Steelman
          </a>
        </section>
      </div>
    </main>
  );
}
