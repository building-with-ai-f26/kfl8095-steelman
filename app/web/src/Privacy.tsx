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
import { TitleBar } from "./BackLink.tsx";

const STATE: Record<AnalyticsStatus, string> = {
  none: "Usage analytics aren’t running here.",
  signal: "Usage analytics are off because your browser asks not to be tracked.",
  on: "Usage analytics are on in this browser.",
  off: "Usage analytics are off in this browser.",
};

export function Privacy() {
  return (
    <main className="sm-privacy">
      <TitleBar here="/privacy">
        <h1>Privacy</h1>
      </TitleBar>
      <p className="sm-privacy-date">Updated November 25, 2026</p>
      <p className="sm-privacy-lede">This page says what Steelman keeps about you, who can see it, how long Steelman keeps it, and what you can do about it.</p>

      <h2>What we collect</h2>
      <ul>
        <li>We keep your email, the username you choose, and whether you sign in with an emailed code or with Google.</li>
        <li>We keep the arguments, wordings, context, and sources that you write on the boards you join.</li>
        <li>We keep your importance votes, your wording votes, your assessments of whether a wording’s evidence holds up, and your reports.</li>
        <li>We keep the comments you write on boards, until you delete them.</li>
        <li>Our server logs record your IP address and browser with each request, and we keep them for 30 days.</li>
        <li>We collect usage analytics unless you turn them off, as Cookies and analytics explains below.</li>
      </ul>

      <h2>Who sees what</h2>
      <ul>
        <li>
          Everyone who can open a board sees what you write there, with your username beside it. Your username links to your profile, which shows each signed-in person the arguments, wordings, and sources you added on the boards where they have a role.
        </li>
        <li>Your votes and assessments count toward the totals everyone sees, but no one is shown which ones are yours.</li>
        <li>Everyone who can open a board sees its history. The history shows who did what there and when, including when you added each argument and wording. It never shows your votes.</li>
        <li>When you report that a source can’t be opened, everyone who can open that board sees that you reported it. The board’s history keeps a record of your report even after the report is cleared.</li>
        <li>No one but you sees your email.</li>
        <li>Steelman shows you counts of what you wrote, worked out from what it already keeps, and no one else sees them.</li>
      </ul>

      <h2>Who processes it for us</h2>
      <ul>
        <li>
          <b>Google Cloud</b> runs Steelman and its database in the US.
        </li>
        <li>
          <b>Google</b> tells us your email if you sign in with Google.
        </li>
        <li>
          <b>Resend</b> sends the codes you use to sign in or to change your email. When your email changes, Resend also sends a note to your old address. If you ask to change to an email that another account already uses, Resend emails that address to say so instead of sending a code.
        </li>
        <li>
          <b>PostHog</b> records usage analytics in the US.
        </li>
        <li>
          <b>Google Fonts</b> serves the page’s fonts. Your browser asks Google for them, so Google sees your IP address.
        </li>
      </ul>
      <p>We don’t sell what we keep about you, and we don’t use it for advertising.</p>

      <h2>Cookies and analytics</h2>
      <p>
        A cookie keeps you signed in. Signing in with Google uses a second cookie for a few minutes while the sign-in runs. These cookies are essential, so there is no switch for them. Deleting your account ends them.
      </p>
      <p>
        Usage analytics send PostHog the pages you view, what you click, your IP address, and screen replays of your visits. A replay shows what was on your screen, such as the boards you read, but it
        hides what you type and your email. PostHog isn’t told who you are. Instead, a random ID groups your visits. The ID is kept in a cookie and in your browser’s storage until you clear this
        site’s data, and it isn’t tied to your account. Your choice to turn analytics off or on is kept in your browser too. We use analytics only to see where people get stuck.
      </p>
      <p>
        While your analytics are on, our service also tells PostHog each time you vote, assess, or save something you wrote, because the browser’s own analytics are sometimes blocked. Each of these
        events says only what was saved and whether it was on our test site or the real one. An event doesn’t say who you are, which board it was on, or what you wrote. Each event has its own random
        ID instead of your browser’s ID, so these events can’t be joined to your visits.
      </p>
      <AnalyticsSwitch />
      <p>If your browser sends Global Privacy Control or Do Not Track, Steelman sends nothing to PostHog and doesn’t ask you about analytics.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>A code for signing in or for a new email works for 10 minutes. Unused codes are deleted each day.</li>
        <li>You stay signed in until 30 days after you last use Steelman.</li>
        <li>Google Cloud keeps request logs, which hold your IP address and browser, for 30 days.</li>
        <li>We keep what you write, and the record of changes to a board, for as long as the board exists.</li>
        <li>When two arguments are combined, we keep your earlier importance votes on them for as long as the board exists, so the combine can be undone.</li>
        <li>
          We keep daily backups of the database for 14 days and weekly backups for 8 weeks. Something deleted stays in a backup until it expires. If we restore a backup, every deletion made since the
          backup was made is applied again.
        </li>
        <li>We hold a deleted account’s username for 30 days so that no one can take it straight away. After that, anyone can choose it.</li>
        <li>When you change your username, Steelman keeps your old one for 30 days so that no one else takes it and links to it still work.</li>
        <li>PostHog keeps analytics for the period our PostHog plan sets. Analytics aren’t tied to your account, so deleting your account doesn’t delete them.</li>
        <li>Resend keeps records of the emails it sent for a period that Resend sets.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>
          <b>Download your data</b> and <b>Delete account</b> are in <a href="/account">Your account</a>. Deleting your account removes your email, your ways of signing in, your votes, your
          assessments, and the text of your comments. What you wrote stays on its boards and is credited to deleted_account, so other people’s work keeps its context. A board you own passes to its longest-standing contributor. If
          the board’s other members are all voters, or it has no other members, the board is deleted with everything on it.
        </li>
        <li>You can turn analytics off or on in Cookies and analytics above.</li>
      </ul>

      <h2>Children</h2>
      <p>Steelman isn’t for children under 13.</p>

      <h2>Changes to this page</h2>
      <p>We date each change at the top of this page, so the date shows when what we keep about you last changed.</p>

      <h2>Questions</h2>
      <p>
        If you have a question, ask Kieran LaMee or <a href="https://github.com/building-with-ai-f26/kfl8095-steelman/issues">open an issue on GitHub</a>.
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
