// A person's profile (L-03, L-04, M3d-16) at /u/<username>, as the
// prototype's profileMarkup draws it (docs/prototype/source/steelman-refined.html):
// the way back, a dark header with the person's initials and username, with
// "you" on your own, then Contributions, with Arguments, Wordings, and
// Sources in tabs, each with its count after the label, as GitHub's profile
// tabs read "Repositories 12" and "Stars 2" (checked live, Nov 26). Each item
// links to its card and says its board and its age, newest first, as
// Wikipedia's Special:Contributions lists each edit with its page and its
// time (checked live, Nov 26). The prototype's points are left out, as are
// votes and assessments: the row allows no such counts. Your own profile
// links to Your statistics instead.
//
// The service sends only boards where you have a role (server/src/profiles.ts).
// A name held after a change answers with the new name, and the address moves
// to it, as GitHub's renamed repositories do.
//
// ph-no-capture: the page is a person's name and what they wrote, so analytics
// and screen replays don't see it (M-08). The address is rewritten before
// PostHog sends it (analytics.ts).

import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Profile as ProfileAnswer, ProfileItem } from "@steelman/shared";
import { readProfile } from "./api.ts";
import { BackLink, usePlaceBefore } from "./BackLink.tsx";
import { initials } from "./board/Sharing.tsx";
import { profilePath, versionPath } from "./links.ts";
import { rememberPlace } from "./places.ts";
import { AuthCard } from "./signIn/AuthCard.tsx";
import { ago, fullDate } from "./when.ts";

type Tab = "arguments" | "wordings" | "sources";

const TABS: { key: Tab; label: string; empty: string }[] = [
  { key: "arguments", label: "Arguments", empty: "There are no arguments here yet." },
  { key: "wordings", label: "Wordings", empty: "There are no other wordings here yet." },
  { key: "sources", label: "Sources", empty: "There are no sources here yet." },
];
/**
 * When the viewer has a role on none of the person's boards, or nothing the person wrote stands on them (the row's
 * sentence). Your own profile says it too: what you wrote on a board you've left, or that is hidden, is left out.
 */
const NOTHING = "There is nothing here that you can open.";

type Answer = ProfileAnswer | "missing" | "signed_out" | "failed";

export function Profile({ username }: { username: string | null }) {
  const [answer, setAnswer] = useState<Answer | null>(username === null ? "missing" : null);
  const [tab, setTab] = useState<Tab>("arguments");
  const here = username === null ? "/u/" : profilePath(username);
  // Read before this screen notes itself below (M3a-1).
  const cameFrom = usePlaceBefore(here);
  useEffect(() => {
    if (username === null) return;
    void readProfile(username).then((read) => {
      if (typeof read === "object" && read.username !== username) window.history.replaceState(window.history.state, "", profilePath(read.username));
      setAnswer(read);
    });
  }, [username]);
  // Your account, opened from here, leads back here. Someone else's profile is "the profile", so no name sits in a
  // back link's text on another page, and BackLink keeps a profile's address out of screen replays.
  useEffect(() => {
    if (answer === null || typeof answer !== "object") return;
    return rememberPlace(() => ({ path: profilePath(answer.username), name: answer.you ? "Your profile" : "the profile" }));
  }, [answer]);

  if (answer === null) return null;
  if (answer === "missing") return <Missing username={username} />;
  if (answer === "signed_out") return <p className="sm-meta">You’ve been signed out. Reload the page to sign in.</p>;
  if (answer === "failed")
    return (
      <AuthCard label="Profile">
        <h1 className="sm-auth-title sm-auth-signin">Profile unavailable</h1>
        <p className="sm-auth-text">Steelman couldn’t read this profile. Reload the page to try again.</p>
      </AuthCard>
    );

  const total = answer.arguments.length + answer.wordings.length + answer.sources.length;
  const move = (event: KeyboardEvent, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = TABS[(index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length]!.key;
    setTab(next);
    document.getElementById(`sm-contrib-tab-${next}`)?.focus();
  };
  return (
    <main className="sm-landing ph-no-capture" data-canvas="cool">
      <div className="sm-landing-inner">
        <section className="sm-profile-page" aria-labelledby="sm-profile-title">
          <BackLink here={here} place={cameFrom} />
          <header className="sm-profile-head">
            <span className="sm-profile-avatar" aria-hidden="true">
              {initials(answer.username)}
            </span>
            <div className="sm-profile-who">
              <h1 id="sm-profile-title">
                {answer.username}
                {answer.you ? (
                  <>
                    {" "}
                    <small>you</small>
                  </>
                ) : null}
              </h1>
              {answer.you ? (
                <a className="sm-profile-stats cursor-interaction" href="/account#statistics">
                  Your statistics
                </a>
              ) : null}
            </div>
          </header>
          <section className="sm-rail-card sm-contrib" aria-labelledby="sm-contrib-title">
            <h2 id="sm-contrib-title">Contributions</h2>
            {/* The ARIA tab pattern, as the board's sides on a phone: one tab stop, and the arrow keys move between them. */}
            <div className="sm-sort sm-contrib-tabs" role="tablist" aria-labelledby="sm-contrib-title">
              {TABS.map(({ key, label }, index) => (
                <button
                  key={key}
                  id={`sm-contrib-tab-${key}`}
                  type="button"
                  role="tab"
                  className="cursor-interaction"
                  aria-selected={tab === key}
                  aria-controls={`sm-contrib-${key}`}
                  tabIndex={tab === key ? 0 : -1}
                  onClick={() => setTab(key)}
                  onKeyDown={(event) => move(event, index)}
                >
                  {label} <b>{answer[key].length}</b>
                </button>
              ))}
            </div>
            {TABS.map(({ key, empty }) => (
              <div key={key} id={`sm-contrib-${key}`} role="tabpanel" aria-labelledby={`sm-contrib-tab-${key}`} hidden={tab !== key}>
                {answer[key].length > 0 ? (
                  <ul className="sm-contrib-list">
                    {answer[key].map((item) => (
                      <Item key={item.id} item={item} now={answer.now} />
                    ))}
                  </ul>
                ) : (
                  <p className="sm-contrib-empty">{total > 0 ? empty : NOTHING}</p>
                )}
              </div>
            ))}
          </section>
        </section>
      </div>
    </main>
  );
}

/** One thing the person wrote: its words, then its board's question and when it was added, as Home's posts say "Updated 3d ago". */
function Item({ item, now }: { item: ProfileItem; now: string }) {
  return (
    <li>
      <a className="cursor-interaction" href={versionPath(item.board, item.version)}>
        <strong>{item.text}</strong>
        <small>
          <span className="sm-contrib-q">{item.question}</span>
          <span className="sm-dot" />
          <time dateTime={item.at} title={fullDate(item.at)}>
            Added {ago(item.at, now)}
          </time>
        </small>
      </a>
    </li>
  );
}

/** No one has the name, nor holds it after a change. */
function Missing({ username }: { username: string | null }) {
  return (
    <AuthCard label="Not found">
      <h1 className="sm-auth-title sm-auth-signin">Profile not found</h1>
      <p className="sm-auth-text ph-no-capture">{username === null ? "This link doesn’t name anyone." : `No one is called ${username}. Check the username.`}</p>
      <a className="sm-button sm-solid cursor-interaction" href="/">
        Go to Your steelmen
      </a>
    </AuthCard>
  );
}
