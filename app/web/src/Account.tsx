// Your account (M-07, M1-12, L-04): who you are, changing your email (M2-8c,
// in ChangeEmail.tsx), how you sign in, the
// usage-analytics switch, Download your data, Sign out, and Delete account, in
// the prototype's Account card (profileMarkup, privacyGroup, deleteForm, and
// deletedMarkup in docs/prototype/source/steelman-refined.html), laid out as
// Google Account's settings are (the builder, Nov 22: "too cramped / too many
// lines"): the title with its back arrow on the page, then each group a card
// of its own, with a short title and rows of label and value, ruled only
// between rows (pages.css). Typing your
// username to confirm a deletion is GitHub's way too (checked on
// docs.github.com). Sign out sits at the foot of the card, above Delete
// account, as in the prototype; GitHub and Google keep it last in the account
// menu too (from memory). Your statistics (L-09, M3d-14) follows Username:
// counts of what you wrote, each said as a sentence, as Wikipedia's
// Special:Contributions says "A user with 15,156 edits." (checked Nov 25),
// with zeros shown quieter, as the prototype's profile Points do.

import { useEffect, useId, useRef, useState } from "react";
import { CHOSEN, analyticsStatus, chooseAnalytics, turnOnAnalytics } from "./analytics.ts";
import type { AnalyticsStatus } from "./analytics.ts";
import type { AccountStatistics } from "@steelman/shared";
import { deleteMyAccount, downloadMyData, listBoards, readMyAccount, readMyStatistics } from "./api.ts";
import { Icon } from "./icons.tsx";
import { signOut } from "./signIn/account.ts";
import { ChangeEmail } from "./signIn/ChangeEmail.tsx";
import type { MyAccount } from "./api.ts";
import { boardPath } from "./links.ts";
import { forgetTestUser } from "./testUser.ts";
import { TitleBar, usePlaceBefore } from "./BackLink.tsx";
import { forgetPlaces, rememberPlace } from "./places.ts";
import { busyButton } from "./busy.ts";
import { useRowEntrance, useStatisticEntrance } from "./rows.ts";
import { statisticLines } from "./statistics.ts";
import type { StatisticLine } from "./statistics.ts";
import type { IconName } from "./icons.tsx";

const DELETED = "deleted_account";

export function Account() {
  const [account, setAccount] = useState<MyAccount | "signed_out" | null>(null);
  /** Read with the account, so the page is drawn once, at its full height. */
  const [statistics, setStatistics] = useState<AccountStatistics | "failed">("failed");
  const [status, setStatus] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [downloading, setDownloading] = useState(false);
  /** Where Start opens the tour (L-02): the most recently changed board with arguments to point at, as the prototype's opens the last board. */
  const [tourBoard, setTourBoard] = useState<string | null>(null);
  const deleteLink = useRef<HTMLButtonElement>(null);
  const signOutButton = useRef<HTMLButtonElement>(null);
  const wasDeleting = useRef(false);
  /** Set when signing out failed, so the cursor goes back to Sign out once it can be pressed again. */
  const backToSignOut = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  useRowEntrance(end);
  useEffect(() => {
    void Promise.all([readMyAccount(), readMyStatistics()]).then(([mine, counts]) => {
      setStatistics(counts === "signed_out" ? "failed" : counts);
      setAccount(mine);
    });
    void listBoards().then((list) => {
      if (typeof list === "string") return;
      setTourBoard(list.boards.find((board) => board.options.some((option) => option.arguments > 0))?.id ?? null);
    });
  }, []);
  // Read before this screen notes itself below (M3a-1).
  const cameFrom = usePlaceBefore("/account");
  // Privacy, opened from here, leads back here (M3a-1).
  useEffect(() => rememberPlace(() => ({ path: "/account", name: "Your account" })), []);
  useEffect(() => {
    if (signingOut || !backToSignOut.current) return;
    backToSignOut.current = false;
    signOutButton.current?.focus();
  }, [signingOut]);
  // Cancel puts the cursor back on Delete account.
  useEffect(() => {
    if (wasDeleting.current && !deleting) deleteLink.current?.focus();
    wasDeleting.current = deleting;
  }, [deleting]);

  if (deleted) return <Deleted />;
  if (account === null) return null;
  if (account === "signed_out") return <p className="sm-meta">You’ve been signed out. Reload the page to sign in.</p>;

  const download = async () => {
    setDownloading(true);
    const saved = await downloadMyData();
    setDownloading(false);
    setStatus(saved ? "Your browser saved steelman-data.json." : "Steelman couldn’t download your data. Try again.");
  };
  const leave = async () => {
    setSigningOut(true);
    const ended = await signOut();
    if (!ended) {
      setStatus("Steelman couldn’t sign you out. Try again.");
      // Once it's drawn pressable again, the keyboard's place is back on it (the effect above). A timer here could run
      // before that, while the button was still disabled.
      backToSignOut.current = true;
      setSigningOut(false);
      return;
    }
    setSigningOut(false);
    forgetTestUser();
    forgetPlaces();
    // A fresh page, so nothing of the account stays in memory; signed out, it shows Sign in.
    window.location.assign("/");
  };
  return (
    <main className="sm-landing" data-canvas="cool">
      <div className="sm-landing-inner">
        <section className="sm-account" aria-labelledby="sm-account-title">
          <TitleBar here="/account" place={cameFrom}>
            <h1 id="sm-account-title">Your account</h1>
          </TitleBar>
          <div className="sm-rgroup">
            {/* ph-no-capture: kept out of analytics and screen replays (M-08). */}
            <Row label="Username">
              <span className="sm-rrow-value ph-no-capture">{account.username}</span>
            </Row>
            {account.email && <ChangeEmail email={account.email} onChanged={(email) => setAccount({ ...account, email })} onStatus={setStatus} />}
          </div>
          {/* ph-no-capture: what you wrote is counted for you alone, so analytics and screen replays don't see it (L-09). */}
          <div className="sm-rgroup sm-stats ph-no-capture">
            <h2>Your statistics</h2>
            <p className="sm-stats-note">Only you can see these numbers.</p>
            {statistics === "failed" ? (
              <p className="sm-stats-failed">Steelman couldn’t count what you wrote. Reload the page to try again.</p>
            ) : (
              <ul className="sm-stats-list">
                {statisticLines(statistics).map((line) => (
                  <Statistic key={line.name} line={line} />
                ))}
              </ul>
            )}
          </div>
          {/* As Notion: Google signs in to the account with the same email, so there's nothing to connect or
              disconnect (M2-8b). Accounts without an email are the demo's test people, who can't sign in. */}
          {account.email && (
            <div className="sm-rgroup">
              <h2>Sign in with</h2>
              <Row label="Email code" hint="We email you a code each time you sign in." />
              <Row label="Google" hint="You can sign in with Google if your Google account uses this email." />
            </div>
          )}
          {/* Only once there's a board with something to point at: before then, the tour hasn't shown either. */}
          {tourBoard && (
            <div className="sm-rgroup">
              <Row label="Tour" hint="Learn how voting works on a board.">
                <span className="sm-rrow-control">
                  <a className="sm-button cursor-interaction" href={`${boardPath(tourBoard)}?tour`}>
                    Start
                  </a>
                </span>
              </Row>
            </div>
          )}
          <div className="sm-rgroup">
            <h2>Privacy</h2>
            <AnalyticsRow onChange={setStatus} />
            <Row label="Your data" hint="Download a copy of everything you wrote, voted on, and assessed.">
              <span className="sm-rrow-control">
                <button type="button" className="sm-button cursor-interaction" {...busyButton(downloading)} onClick={() => void download()}>
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
          <div ref={end} className="sm-account-end">
            <button ref={signOutButton} type="button" className="sm-button sm-signout cursor-interaction" {...busyButton(signingOut)} onClick={() => void leave()}>
              <Icon name="log-out" size={16} />
              Sign out
            </button>
            {deleting ? (
              <DeleteForm
                username={account.username ?? ""}
                onCancel={() => setDeleting(false)}
                onDeleted={() => {
                  forgetTestUser();
                  forgetPlaces();
                  setDeleted(true);
                }}
              />
            ) : (
              <button ref={deleteLink} type="button" className="sm-link-button sm-delete-link cursor-interaction" onClick={() => setDeleting(true)}>
                Delete account
              </button>
            )}
          </div>
        </section>
      </div>
      <div id="sm-status" className="sm-live" role="status" aria-live="polite">
        {status}
      </div>
    </main>
  );
}

/** Usage analytics, as the prototype's privacyGroup has it: the same choice as the first-visit notice and the privacy page, kept in this browser. No row when analytics aren't running here. */
function AnalyticsRow({ onChange }: { onChange(status: string): void }) {
  const [status, setStatus] = useState<AnalyticsStatus | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const read = () => void analyticsStatus().then(setStatus);
    read();
    // The first-visit notice changes the same choice; the row follows it.
    window.addEventListener(CHOSEN, read);
    return () => window.removeEventListener(CHOSEN, read);
  }, []);
  if (status === null || status === "none") return null;
  if (status === "signal")
    return (
      <Row label="Usage analytics" hint="Your browser asks sites not to track you.">
        <span className="sm-rrow-value">Off</span>
      </Row>
    );
  const change = async () => {
    if (status === "off") await turnOnAnalytics();
    else chooseAnalytics(false);
    const now = await analyticsStatus();
    setStatus(now);
    onChange(now === "on" ? "Usage analytics are on." : "Usage analytics are off. Nothing more is sent from this browser.");
    toggle.current?.focus();
  };
  return (
    <Row label="Usage analytics" hint="Steelman sends PostHog the pages you visit, what you click, and replays of your screen. Anything you type is hidden.">
      <span className="sm-rrow-control">
        <span className="sm-rrow-value">{status === "on" ? "On" : "Off"}</span>
        <button ref={toggle} type="button" className="sm-button cursor-interaction" aria-label={status === "on" ? "Turn off usage analytics" : "Turn on usage analytics"} onClick={() => void change()}>
          {status === "on" ? "Turn off" : "Turn on"}
        </button>
      </span>
    </Row>
  );
}

const STATISTIC_ICONS: Record<StatisticLine["name"], IconName> = {
  arguments: "arrow-up-down",
  wordings: "arrow-left-right",
  sources: "paperclip",
  comments: "message-square",
  boards: "layout-grid",
  nothing: "pencil",
};

/** One line of Your statistics, with the icon the prototype's profile gives the same kind of count. */
function Statistic({ line }: { line: StatisticLine }) {
  const item = useRef<HTMLLIElement>(null);
  useStatisticEntrance(item);
  return (
    <li ref={item} className="sm-stat" data-zero={line.zero ? "" : undefined}>
      <Icon name={STATISTIC_ICONS[line.name]} size={16} />
      <span>{line.text}</span>
    </li>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  useRowEntrance(row);
  return (
    <div ref={row} className="sm-rrow">
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
    setError(outcome === "failed" ? "Steelman couldn’t delete your account, so nothing was deleted. Try again." : `Type ${username} exactly.`);
    field.current?.focus();
  };
  return (
    <div className="sm-pw-form sm-delete-form" role="group" aria-labelledby="sm-delete-title">
      <h3 id="sm-delete-title">Delete your account?</h3>
      <p>
        Your email, votes, and assessments are removed. Arguments, wordings, and sources you wrote stay on their boards, credited to <b>{DELETED}</b>.
      </p>
      <p>A board you own passes to its longest-standing contributor. A board with no other contributor is deleted.</p>
      <p>Your comments are deleted.</p>
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
        <button type="button" className="sm-button sm-danger cursor-interaction" {...busyButton(sending)} onClick={() => void confirm()}>
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
          <p className="sm-auth-text">Your comments are gone too.</p>
          <a className="sm-button sm-solid cursor-interaction" href="/">
            Back to Steelman
          </a>
        </section>
      </div>
    </main>
  );
}
