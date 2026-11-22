# M3 against credible products and published guidance

Reviewed Nov 22, 2026, at the builder's request ("audit all the ideas in M3 against best practices and
credible app design"). It covers every feature in M3a, M3b, and M3c (`plans/build-plan.md`), plus M3a-1,
the way back, which the builder added the same day. For each feature it names what Steelman plans, what
credible products do, and what should change.

**How it was checked.** These were read live on Nov 22:
- GOV.UK's Back link component;
- Canny's help on merging posts, and Sleekplan's and ProductLift's on the same;
- WCAG 2.2's Understanding page for 2.2.1, Timing Adjustable;
- Wikipedia's Help:Archiving a source;
- Google's help pages for Drive sharing, Docs comments, and Docs version history;
- GitHub's docs on notifications and the Projects board layout;
- Notion's help on boards;
- Gmail's sender guidelines;
- Gemini's help on sources and double-checking;
- Microsoft's 18 Guidelines for Human-AI Interaction (HAX);
- OpenAI's help on prepaid credits;
- Pew Research's guidance on writing survey questions.

Where a comparison comes from memory instead (Linear, Figma, Gmail's Undo send, Material's snackbar,
Google Forms, Stripe), it says so.

## In short

Most of M3 matches what credible products do, and in two places it's more careful than they are:
- Combining merges importance votes per person, where Discourse users complain that votes don't merge at
  all.
- An option can be deleted only when it's empty.

**Seven changes are worth making before the items are built:**

1. **A 10-second Undo that's the only way back is a WCAG time limit** (2.2.1, read live). WCAG treats a timed
   message as fine when the same action is reachable another way. So every action with an Undo bar (deleting
   a wording, an option, or a source, and combining or separating) should also be undoable from History.
   Today only combine and separate are planned to be (J-04). **Change M3a-4 and M3a-8.**
2. **"Can't open it?" should offer an archived copy, as Wikipedia does.** Wikipedia's answer to a dead link
   is the Wayback Machine (`archive-url`, `url-status=dead`), not just a flag. A link to
   `web.archive.org/web/<the source's address>` costs nothing and needs no API. **Change M3a-3.**
3. **The way back should say where it goes.** GOV.UK says "Go back to [page]" is better than "Back" for
   anything but a simple journey. The prototype shows only the destination's name, after an arrow. Use
   "Back to Your steelmen" and "Back to [the board's question]". **Change M3a-1.**
4. **Email notifications need preferences and an unsubscribe link in every email.** GitHub puts an
   unsubscribe link in each notification email and lets people choose by type (read live). Gmail requires
   SPF or DKIM from every sender. It requires one-click unsubscribe only above 5,000 a day, but advises it
   for everyone. For M3b's backlog.
5. **Invites should have Google's "Notify people" choice, and Remove access.** Google Drive's share dialog
   (read live) adds people with a role, a **Notify people** box, and **Remove access** in each person's role
   menu. For M3b's backlog.
6. **An AI verdict needs a way to say it's wrong, and must say how sure it is.** HAX G2 says to make clear
   how well the system works, G9 says to support efficient correction, and G15 says to encourage granular
   feedback. Gemini's double-check links each statement to what Search found, and still warns that Gemini
   can be wrong (read live). For M3c's backlog.
7. **B-06's fading vote words are fragments** ("Important.", "Well articulated."), which AGENTS.md rule 13
   rules out. Since M2-11, a vote is already announced in a full sentence. Drop the words, or make them
   sentences.

## M3a. Structure and history

### M3a-1, a way back from every screen (M-13, new)

- **Planned:** the prototype's back link at the top of Your account, the privacy page, and New steelman,
  naming where you came from.
- **Credible products:**
  - GOV.UK (live): place it "at the top of a page, before the `<main>` element". Use "Back" for simple
    journeys, or "Go back to [page]" where there are many areas. Never use it together with breadcrumbs. It
    should work without JavaScript.
  - Linear's settings start with "Back to app" (from memory).
- **Verdict:** keep, with link text "Back to [place]". Make it a real link (`<a href>`), so it works without
  JavaScript and opens in a new tab. Don't add breadcrumbs as well.

### M3a-2, options: add, rename, delete (A-07)

- **Planned:** a ⋯ menu on the option header with Rename and Delete, and a dashed "+ Option". You can only
  delete an empty option, and never go below two options or above four.
- **Credible products:**
  - GitHub Projects (live): a ⋯ menu beside each column name, and a "+" labelled "Add a new column to the
    board".
  - Notion (live): "•••" to the right of the heading.
  - Both let you delete a column that holds items, which then fall back to an ungrouped column.
- **Verdict:** keep. Refusing to delete a non-empty option is stricter, and it's right for an argument board,
  where a column's arguments have no other home. The disabled Delete must say why, as the prototype's does
  ("Move or delete its arguments first.").

### M3a-3, "Can't open it?" (C-02)

- **Planned:** mark a source unavailable on every wording that cites it.
- **Credible products:** Wikipedia (live) keeps a dead source usable. Its citation templates take
  `archive-url`, `archive-date`, and `url-status=dead`, and InternetArchiveBot archives new links
  automatically.
- **Verdict:** add "Try an archived copy", a plain link to the Wayback Machine for that address. Show who
  reported it and when ("Reported unavailable on Nov 22"), so a reader can judge how old the report is. Let
  the reporter or an Editor clear the mark. Whether anyone who assesses may also clear it is the builder's
  question (PR 88).

### M3a-4, History (J-03)

- **Planned:** the change log read back: who hid, restored, deleted, renamed, and why.
- **Credible products:**
  - Google Docs (live): **Last edit** at the top opens Version history. It lists who changed what and when,
    groups versions by day, and offers **Restore this version**.
  - Wikipedia's history (from memory) is public, and every entry links to its diff and offers undo.
- **Verdict:**
  - Label the entry point "History" in words, not only a clock icon.
  - Group entries by day, and link each to the item it changed.
  - Show moderators' reasons to every member, for trust, but never the hidden text itself.
  - **Add Restore for deletions** (a wording, an option, a source), so the 10-second Undo isn't the only way
    back (finding 1). This makes J-04 part of History from the start, not only for combining.

### M3a-5 to M3a-7, combine and separate (A-10, J-05)

- **Planned:** wordings move with their articulation votes, assessments, and comments (Q8). Importance votes
  merge per person: two identical votes become one, two that conflict are removed, and the person is asked
  again. A 10-second Undo, and a preview before combining (PRD).
- **Credible products:**
  - Canny (live): merging moves "all the comments and votes" to the post that remains. Unmerging is offered,
    but not for a post that was merged into one that was itself merged again.
  - Sleekplan and ProductLift (live) count each voter once after a merge.
  - Discourse users report as a problem that votes don't merge (live thread).
- **Verdict:** keep. Steelman's per-person rule is more careful than any of them. The preview, designed in
  M3a-5, should show:
  - which wordings move, and the argument's importance after the merge;
  - how many people will be asked to vote again;
  - that it can be undone from History.

  Canny's limit on chained unmerges is worth copying honestly: undoing a combine that a later combine built
  on should say why it can't, not fail silently (M3a-8).

### M3a-8, undo a combine from History (J-04)

- **Planned:** move the wordings back, return the removed votes, and keep wordings added since.
- **Credible products:** Google Docs restores a version as a new step in its history (from memory), and a
  Wikipedia revert is itself an edit.
- **Verdict:** keep. Record the rollback as a new entry in the change log; never remove one.

### C-03 and J-05

- **C-03** (evidence-changed handling) is built; nothing to audit.
- **J-05** (Undo bars): Gmail lets you set Undo send from 5 to 30 seconds, and Material's snackbar lasts 4
  to 10 seconds (both from memory). Ten seconds is within what credible products use. Finding 1 covers what
  happens after it.

## M3b. Conversation and sharing (no backlog yet)

**D-01, comments.**
- **Planned:** reply, resolve and reopen, and delete your own, on the question, an option, or a wording.
- **Credible products:** Google Docs (live) has Reply, Resolve, Re-open, **Edit** and Delete your own
  (under More), @mentions that email the person, and assigning.
- **Gap:** editing your own comment. @mentions belong with L-07, since a mention is only useful if it
  notifies.

**H-01, invite by username or email.**
- **Credible products:** Google Drive (live) adds people by email with a role, has a **Notify people** box,
  and puts **Remove access** in each person's role menu.
- **Add:**
  - the Notify box, with an optional message;
  - Remove.
- **Remove's problem:** the plan notes that someone who came by the board's link comes straight back. Google
  has the same split, with removing a person separate from "Anyone with the link". Say so beside Remove, as
  Google does by showing general access just below.
- **Invites to an email with no account** should wait until that address signs up (Figma and Notion work
  this way, from memory).

**H-05, invite landing.**
- **Planned:** the landing shows the question, its options, your role, and how many people are there.
- **The conflict:** since M1-7, a signed-out board link shows nothing until you sign in, and Google Docs
  shows nothing either (from memory).
- **Recommendation:** show the inviter and the question only for an invite (which names the person), never
  for the board's plain link.
- **For the builder:** this is a privacy decision.

**I-01, board settings.**
- **Credible products:** GitHub's repository settings (from memory) group renaming under General, and put
  transferring and deleting in a "Danger zone" with a typed confirmation.
- **Recommendation:** group the board's settings the same way: General (rename, space), Access (opens
  Share), and Close or reopen. Deleting a board isn't in the feature list at all; note it as a gap.

**I-05, close by date, and reopen.**
- **Credible products:** Google Forms has an **Accepting responses** switch and a message for closed forms
  (from memory; the help page read live didn't cover it).
- **Recommendation:** show the closing time with its time zone, say "Closes Nov 30 at 5 PM ET", and tie
  "closing soon" to L-07.

**F-02, question wording hints.**
- **Credible products:** Pew (live) names four risks: biased or loaded words, double-barreled questions that
  ask about two things, single statements to agree with (it prefers "a choice between alternative
  statements"), and order effects.
- **Recommendation:** Steelman's hints cover loaded words, "Why…" questions, and options named Yes and No.
  Add the double-barreled check (a question joining two asks with "and" or "or"). Keep every hint
  dismissible and never blocking.

**B-06, vote feedback.**
- **Planned:** halos on the axes, and the words "Important." and "Well articulated." fading after a vote.
- **Problem:** the words are fragments under rule 13, and a vote is already announced in a full sentence
  (M2-11).
- **Recommendation:** keep the halo, which reduced motion stops, and drop the fading words (see the memory
  on minimal explanatory text).

**L-07, email notifications.**
- **Credible products:**
  - GitHub (live): you're subscribed to what you take part in. Each type goes to email, the web, or both.
    Every email has an unsubscribe link, and a reply posts to the thread.
  - Gmail (live): SPF or DKIM for every sender, and one-click unsubscribe (RFC 8058's `List-Unsubscribe` and
    `List-Unsubscribe-Post` headers) above 5,000 a day, advised below it.
- **Recommendation:**
  - Preferences on Your account by type. Invites are always sent; replies, decisions, and closing soon each
    have an on/off switch.
  - An unsubscribe link and the two headers in every email except invites and sign-in codes.
  - One daily digest instead of an email per reply, to stay inside Resend's free 100 a day.
  - Update the privacy page.
- **Rule 10:** Resend's paid plan, if it's needed, is the builder's to approve.

## M3c. AI evidence check, paid by credits (no backlog yet)

**K-01, the ochre visual language.**
- **Guidance:** HAX G1 and G2 (live) say to make clear what the system can do, and how well. WCAG 1.4.1 says
  colour mustn't be the only signal.
- **Recommendation:** keep ochre and the robot, and add the word "AI" (for example "AI check"), so the label
  doesn't rest on colour.

**K-02, the evidence check.**
- **Credible products:**
  - Gemini's double-check (live) highlights each statement and links what Search found. Google says the link
    is "not necessarily what the Gemini app used", and that Gemini can still be wrong.
  - HAX (live): G9, support efficient correction; G10, scope services when in doubt; G11, make clear why the
    system did what it did; G15, encourage granular feedback.
- **Recommendation:**
  - Each verdict quotes the passage of the source it rests on.
  - "Couldn't read this source" is a verdict of its own (G10).
  - Each verdict has "This looks wrong", which records it and hides nothing (G9, G15).
  - Running it automatically on every new wording spends credits nobody chose to spend. Consider running it
    on request by default (G3, time services based on context), and decide with K-04.
  - Design the verdict copy and the failure states first, as the feature row says.

**K-04, credits and a space's budget.**
- **Credible products:** OpenAI (live) sells prepaid credits from $5. Auto-recharge is optional and has a
  monthly cap. Credits expire after a year, requests fail plainly when credits run out, and it emails when a
  recharge fails.
- **Recommendation:**
  - Show each action's cost on its button before it runs (HAX G16, convey the consequences of user actions).
  - Warn when the balance runs low.
  - Give a space's budget a monthly cap.
  - State whether credits expire.
  - Leave auto-recharge out for the class trial.
  - Use Stripe Checkout rather than our own card form (from memory: it handles cards, receipts, and tax).
- **Rule 10:** this is money, so every step needs the builder.

## What this changes now

PR 88's backlog takes the M3a changes: M3a-1's link text, M3a-3's archived copy and report date, and
M3a-4's Restore for deletions, which also answers WCAG 2.2.1. The M3b and M3c points wait for those parts'
backlogs, which will cite this review.
