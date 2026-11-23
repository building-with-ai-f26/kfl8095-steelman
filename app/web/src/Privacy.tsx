// The privacy page (M-07, M1-13): the eight points plans/architecture.md §7
// says it must cover once accounts exist, in plain words, with the analytics
// switch the Product Page's privacy page has (docs/privacy.html). Readable
// signed out. Its headings follow GitHub's privacy statement in order and
// spirit (checked on docs.github.com): what's collected, who sees it, who
// processes it, cookies, retention, your choices, children, changes.
//
// What it says is the builder's call: it is a draft until they approve it.

import { useEffect, useState } from "react";
import { analyticsStatus, chooseAnalytics, turnOnAnalytics } from "./analytics.ts";
import type { AnalyticsStatus } from "./analytics.ts";
import { BackLink } from "./BackLink.tsx";

const STATE: Record<AnalyticsStatus, string> = {
  none: "Usage analytics aren’t running here.",
  signal: "Usage analytics are off: your browser asks not to be tracked.",
  on: "Usage analytics are on in this browser.",
  off: "Usage analytics are off in this browser.",
};

export function Privacy() {
  return (
    <main className="sm-privacy">
      <BackLink here="/privacy" />
      <p className="sm-privacy-date">Updated November 22, 2026</p>
      <h1>Privacy</h1>
      <p className="sm-privacy-lede">Steelman is a class project. This page says what it keeps about you, who can see it, how long it’s kept, and what you can do about it.</p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <b>Your account:</b> your email, the username you choose, and how you sign in (an emailed code, or Google).
        </li>
        <li>
          <b>What you write:</b> arguments, wordings, their context, and sources, on the boards you join.
        </li>
        <li>
          <b>Your judgments:</b> your importance and wording votes, whether a wording’s evidence holds up, and your reports.
        </li>
        <li>
          <b>Server logs:</b> your IP address and browser, with each request, for 30 days.
        </li>
        <li>
          <b>Usage analytics,</b> unless you turn them off: see Cookies and analytics.
        </li>
      </ul>

      <h2>Who sees what</h2>
      <ul>
        <li>What you write, and your username beside it, is seen by everyone who can open that board.</li>
        <li>Your votes and assessments count toward the totals everyone sees, but no one is shown which are yours.</li>
        <li>A board’s history shows everyone who can open the board who did what there, and when, including when you added each argument and wording. It never shows your votes.</li>
        <li>When you report that a source can’t be opened, everyone who can open that board sees that you reported it. The board’s history keeps that you did, even after the report is cleared.</li>
        <li>Your email is seen by no one but you.</li>
      </ul>

      <h2>Who processes it for us</h2>
      <ul>
        <li>
          <b>Google Cloud</b> runs Steelman and its database, in the US.
        </li>
        <li>
          <b>Google</b>, if you sign in with Google: it tells us your email.
        </li>
        <li>
          <b>Resend</b> sends the codes you use to sign in or to change your email. When your email changes, it also sends a note to your old address. If you ask to change to an email another account already uses, it tells that address instead of sending a code.
        </li>
        <li>
          <b>PostHog</b> records usage analytics, in the US.
        </li>
        <li>
          <b>Google Fonts</b> serves the page’s fonts, so your browser asks Google for them, which shows Google your IP address.
        </li>
      </ul>
      <p>We don’t sell what we keep about you or use it for advertising.</p>

      <h2>Cookies and analytics</h2>
      <p>
        A cookie keeps you signed in, and signing in with Google uses a second one for a few minutes while it runs. They’re essential, so there’s no switch for them; deleting your account ends them.
      </p>
      <p>
        Usage analytics send PostHog the pages you view, what you click, your IP address, and screen replays of your visits. A replay shows what was on your screen, such as the boards you read, but
        hides what you type and your email. PostHog isn’t told who you are: a random ID, kept in a cookie and in your browser’s storage, groups your visits until you clear this site’s data, and it
        isn’t tied to your account. Your choice to turn analytics off or on is kept in your browser too. We use analytics only to see where people get stuck.
      </p>
      <p>
        While your analytics are on, our service also tells PostHog each time you vote, assess, or save something you wrote, because the browser’s own analytics are sometimes blocked. Each of these
        events says only what was saved and whether it was on our test site or the real one. It doesn’t say who you are, which board it was on, or what you wrote. Each one has its own random ID, not
        your browser’s, so these events can’t be joined to your visits.
      </p>
      <AnalyticsSwitch />
      <p>If your browser sends Global Privacy Control or Do Not Track, nothing is sent and you aren’t asked.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Codes for signing in or for a new email: they work for 10 minutes, and unused ones are deleted each day.</li>
        <li>Being signed in: until 30 days after you last use Steelman.</li>
        <li>Request logs (your IP address and browser), kept by Google Cloud: 30 days.</li>
        <li>What you write, and the record of changes to a board: for as long as the board exists.</li>
        <li>When two arguments are combined, your importance votes on them from before: for as long as the board exists, so the combine can be undone.</li>
        <li>
          Backups of the database: 14 days for daily ones, 8 weeks for weekly ones. Something deleted stays in a backup until it expires, and a restored backup has every deletion since it was made
          applied again.
        </li>
        <li>A deleted account’s username: held for 30 days, so no one can take it straight away, then free.</li>
        <li>Analytics: as long as PostHog keeps them on our plan. They aren’t tied to your account, so deleting it doesn’t delete them.</li>
        <li>Resend keeps records of the emails it sent, for a period it sets.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>
          <b>Download your data</b> and <b>Delete account</b> are in <a href="/account">Your account</a>. Deleting removes your email, ways of signing in, votes, and assessments. What you wrote stays
          on its boards, credited to deleted_account, so others’ work keeps its context. A board you own passes to its longest-standing contributor; one whose other members are all voters, or that has
          none, is deleted with everything on it.
        </li>
        <li>Turn analytics off or on above.</li>
      </ul>

      <h2>Children</h2>
      <p>Steelman isn’t for children under 13.</p>

      <h2>Changes to this page</h2>
      <p>Each change is dated at the top. When one matters to what we keep about you, people signed in are told.</p>

      <h2>Questions</h2>
      <p>
        Ask Kieran LaMee through the course, or <a href="https://github.com/building-with-ai-f26/kfl8095-steelman/issues">open an issue on GitHub</a>.
      </p>
    </main>
  );
}

/** "Usage analytics are on in this browser." with Turn off, as the Product Page's privacy page has it. */
function AnalyticsSwitch() {
  const [status, setStatus] = useState<AnalyticsStatus | null>(null);
  useEffect(() => {
    void analyticsStatus().then(setStatus);
  }, []);
  if (status === null) return null;
  const change = async (on: boolean) => {
    if (on) await turnOnAnalytics();
    else chooseAnalytics(false);
    setStatus(await analyticsStatus());
  };
  return (
    <div className="sm-privacy-switch">
      <p id="sm-analytics-state" role="status">
        {STATE[status]}
      </p>
      {status === "on" || status === "off" ? (
        <button type="button" className="sm-button cursor-interaction" onClick={() => void change(status === "off")}>
          {status === "on" ? "Turn off" : "Turn on"}
        </button>
      ) : null}
    </div>
  );
}
