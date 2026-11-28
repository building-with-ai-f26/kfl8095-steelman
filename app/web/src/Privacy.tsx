// The privacy page (M-07, M1-13): the points plans/architecture.md §7 says it
// must cover once accounts exist, in plain words, with the analytics switch
// the Product Page's privacy page has (docs/privacy.html). Readable signed
// out. Its headings follow GitHub's privacy statement in order and spirit
// (checked on docs.github.com): what's collected, who sees it, who processes
// it, cookies, retention, your choices, children, changes.
//
// The November 28, 2026 version (M3d-37) follows a claim-by-claim audit
// against the code (tests/build-1-manual.md, November 28). It adds section 6
// of plans/reviews/public-spaces-security-review.md with the builder's
// member-list rule (F6), the deletion sentence for M3d-33 (F14), the people a
// board lists (F17), the page addresses logs and PostHog hold (F18), and
// Cloudflare. GitHub's statement (checked live, Nov 28) dates itself at the
// top and doesn't list its changes on the page; this one says what each
// version changed in three sentences, as the backlog asks. The periods it
// states are checked against shared/src/periods.ts and the database's backup
// settings in infra/ (web/test/privacy-periods.test.ts).
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
  // The page draws after the browser has looked for #questions (Account suspended links there, J-06), so it scrolls to
  // the section itself, as Your account does for #statistics.
  useEffect(() => {
    if (window.location.hash === "#questions") document.getElementById("questions")?.scrollIntoView();
  }, []);
  return (
    <main className="sm-privacy">
      <TitleBar here="/privacy">
        <h1>Privacy</h1>
      </TitleBar>
      <p className="sm-privacy-date">Updated November 28, 2026</p>
      <p className="sm-privacy-lede">This page says what Steelman keeps about you, who can see it, how long Steelman keeps it, and what you can do about it.</p>

      <h2>What we collect</h2>
      <ul>
        <li>We keep your email, the username you choose, and whether you sign in with an emailed code or with Google.</li>
        <li>If you sign in with Google, we also keep the ID that Google gives your account, but not your name or picture.</li>
        <li>One email address has one Steelman account, so signing in with Google opens the account that already uses your Google email.</li>
        <li>We keep when you made your account and whether you have seen the tour.</li>
        <li>We keep the arguments, wordings, context, and sources that you write on the boards you join.</li>
        <li>We keep your importance votes, your wording votes, your assessments of whether a wording’s evidence holds up, and your reports.</li>
        <li>We keep the comments you write on boards, until you delete them.</li>
        <li>We keep the boards you are on, your role on each, and whether you were invited or came by the board’s link.</li>
        <li>We keep the spaces you make, the spaces you join and leave, and when.</li>
        <li>When an admin removes you from a space, we keep a record of who removed you and when, and you can’t rejoin that space by yourself until an admin invites you back.</li>
        <li>
          If we suspend your account, you are signed out everywhere and can’t sign in again until we lift the suspension. What you wrote stays on its boards. We keep when we suspended your
          account, even after the account is deleted.
        </li>
        <li>
          Each time Steelman emails a code, or tells an address that another account already uses it, it records a hash of that email address and the time, so that it can limit how many emails
          one address gets.
        </li>
        <li>To limit how many codes are sent, Steelman counts the code requests from each network address for an hour, in memory only, and never saves that address.</li>
        <li>We don’t record your IP address or your browser with your sign-in.</li>
        <li>Google Cloud logs each request to Steelman with your IP address, your browser, and the address of the page.</li>
        <li>For each request, Steelman’s own log records only which part of Steelman it asked for, how it ended, and how long it took. It records no IDs.</li>
        <li>When something goes wrong, the log also records the error and where in Steelman’s code it happened. Steelman removes any email address from the errors that sign-in logs.</li>
        <li>When we suspend an account or lift a suspension, our log records its username. When we make a space private, our log records the space’s ID.</li>
        <li>We collect usage analytics unless you turn them off, as Cookies and analytics explains below.</li>
      </ul>

      <h2>Who sees what</h2>
      <ul>
        <li>
          Everyone who can open a board sees what you write there, with your username beside it. Your username links to your profile, which shows each signed-in person the arguments, wordings, and sources you added on the boards where they have a role.
        </li>
        <li>In a private space, every member sees the usernames of the other members and how many members it has.</li>
        <li>Anyone can make a Steelman account, so anyone can find a public space and join it.</li>
        <li>Every signed-in account sees a public space’s name, about text, canvas, and how many members it has.</li>
        {/* The builder's rule for F6. It holds from M3d-20, which makes public spaces possible and limits the list. */}
        <li>In a public space, only its admins and owner see its member list. Other members see your username only where you write and on the boards you are on.</li>
        <li>Everyone in a space opens the steelmen shared with the space, with their history, comments, and the names of the people on them.</li>
        <li>When the owner makes a private space public, everything above opens to anyone who joins, including what members wrote before.</li>
        <li>Your profile shows anyone who joins a public space what you wrote on that space’s steelmen.</li>
        <li>Leaving a space doesn’t remove what you wrote on its steelmen.</li>
        <li>An admin of a space can add you to it by your username without asking you first. You can leave any space you don’t own at any time.</li>
        <li>Your votes and assessments count toward the totals everyone sees, but no one is shown which ones are yours.</li>
        {/* F17: the Share panel lists everyone recorded on the board, link joiners included. */}
        <li>Everyone who can open a board sees the usernames of everyone on it, whether they were invited or came by its link.</li>
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
          <b>Google</b> tells us your email and the ID of your Google account if you sign in with Google.
        </li>
        <li>
          <b>Resend</b> sends the codes you use to sign in or to change your email. When your email changes, Resend also sends your old address a note that names your new one. If you ask to change to an email that another account already uses, Resend emails that address to say so instead of sending a code.
        </li>
        <li>
          <b>PostHog</b> records usage analytics in the US.
        </li>
        <li>
          <b>Google Fonts</b> serves the page’s fonts. Your browser asks Google for them, so Google sees your IP address.
        </li>
        <li>
          <b>Cloudflare</b> manages our web addresses. If you visit our old address or the www address, Cloudflare sees that visit and sends you on to Steelman.
        </li>
      </ul>
      <p>We don’t sell what we keep about you, and we don’t use it for advertising.</p>

      <h2>Cookies and analytics</h2>
      <p>
        A cookie keeps you signed in. Signing in with Google uses a second cookie for a few minutes while the sign-in runs. These cookies are essential, so there is no switch for them. Deleting your account ends them.
      </p>
      <p>
        Usage analytics send PostHog the pages you view, what you click, your IP address, and screen replays of your visits. A replay shows what was on your screen, such as the boards you read, but it
        hides what you type and your email. Replays also hide usernames where boards, spaces, profiles, and Your account show them, and they hide space names, comments, sources, and the
        wordings on cards. They show a board’s question and the context of a card you open. A replay can still show your username where a message repeats it, such as the request to type it
        before you delete your account. The address of each page you visit goes to PostHog, and it includes the IDs of the boards, wordings, comments, and spaces you open. A profile’s address goes without its username.
        PostHog isn’t told who you are. Instead, a random ID groups your visits. The ID is kept in a cookie and in your browser’s storage until you clear this
        site’s data, and it isn’t tied to your account. Your choice to turn analytics off or on is kept in your browser too. We use analytics only to see where people get stuck.
      </p>
      <p>
        While your analytics are on, our service also tells PostHog each time you vote, assess, or save an argument, a wording, or a source, because the browser’s own analytics are sometimes
        blocked. Each of these events says only what was saved and whether it came from the real site, our test site, or a developer’s computer. An event doesn’t say who you are, which board it was on, or what you wrote. Each event has its own random
        ID instead of your browser’s ID, so these events can’t be joined to your visits.
      </p>
      <AnalyticsSwitch />
      <p>If your browser sends Global Privacy Control or Do Not Track, Steelman sends nothing to PostHog and doesn’t ask you about analytics.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>A code for signing in or for a new email works for 10 minutes. Unused codes are deleted each day.</li>
        <li>You stay signed in until 30 days after you last use Steelman.</li>
        <li>We delete each record of an email we sent at the first daily clean-up after the record is 24 hours old.</li>
        <li>
          On our test site, the daily clean-up runs only when the site is updated, so codes, sessions, records of emails, and held usernames can stay there longer than this list says.
        </li>
        <li>Google Cloud keeps request logs, which hold your IP address, your browser, and the address of each page you visit, for 30 days. It keeps Steelman’s own log for 30 days too.</li>
        <li>We keep what you write, and the record of changes to a board, for as long as the board exists.</li>
        <li>When two arguments are combined, we keep your earlier importance votes on them for as long as the board exists, so the combine can be undone.</li>
        <li>
          We keep daily backups of the database for 14 days and weekly backups for 8 weeks. Something deleted stays in a backup until it expires. If we restore a backup, every deletion made since the
          backup was made is applied again. The database can also be restored to any moment in the last 7 days.
        </li>
        <li>We hold a deleted account’s username for 30 days so that no one can take it straight away. After that, anyone can choose it.</li>
        <li>When you change your username, Steelman keeps your old one for 30 days so that no one else takes it and links to it still work.</li>
        <li>
          The block that keeps you out of a space ends when an admin invites you back or when you delete your account. The space’s record of changes keeps the removal, even after the space is
          deleted. After you delete your account, that record shows deleted_account instead of you.
        </li>
        <li>PostHog keeps analytics for the period our PostHog plan sets. Analytics aren’t tied to your account, so deleting your account doesn’t delete them.</li>
        <li>Resend keeps records of the emails it sent for a period that Resend sets.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>
          <b>Download your data</b> and <b>Delete account</b> are in <a href="/account">Your account</a>. Deleting your account removes your email, your ways of signing in, your votes, your
          assessments, and the text of your comments. It also signs you out everywhere and deletes your reports. What you wrote stays on its boards and is credited to deleted_account, so
          other people’s work keeps its context. A board you own in a space passes to the space’s owner, or else to its longest-standing admin. Otherwise the board passes to its
          longest-standing editor, or else to its longest-standing contributor. If no one can take it, the board is deleted with everything on it. A space you own passes to its
          longest-standing admin, or else to the longest-standing member the space invited. A space with no one left to take it is deleted.
        </li>
        <li>You can turn analytics off or on in Cookies and analytics above.</li>
      </ul>

      <h2>Children</h2>
      <p>Steelman isn’t for children under 13.</p>

      <h2>Changes to this page</h2>
      <p>We date each change at the top of this page, so the date shows when what we keep about you last changed.</p>
      <p>
        This version, from November 28, 2026, adds what happens in public spaces, when an admin removes you from a space, and when we suspend an account. It also says that one email address has one
        account, names Cloudflare as a service we use, and says what our logs and analytics hold. It corrects what happens to your boards and spaces when you delete your account.
      </p>

      {/* Account suspended links here (J-06). */}
      <h2 id="questions">Questions</h2>
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
