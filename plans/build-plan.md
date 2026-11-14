# Steelman build plan

**Status:** draft for review (Nov 11, 2026), revised the same day by an independent review (M0's backlog, machine-checked "done when", no previews); the builder approved the revisions that day. Goes with [architecture.md](architecture.md); feature IDs are from [features.csv](features.csv).

## How to read this

- **Each milestone ships something people can use.**
- **Agents build it, one backlog item at a time, mostly unattended** (architecture.md §8). A milestone's **backlog** is its ordered list of items, each one pull request. An item in a backlog is approved to build; anything else needs the builder first. M0's backlog is below. Each later milestone's backlog is written when the one before it finishes, as its own pull request for the builder to approve, because by then the code will say more than a guess made today.
- **"Done when" has two parts.** *Machine:* tests that run on every pull request, so an agent knows by itself whether it's finished. *Person:* the few checks only a human can make, batched at the end of the milestone.
- **Who merges** (Q18): the builder merges M0's pull requests. From M1, a pull request merges itself when every check is green and it touches nothing protected; production releases always wait for the builder.
- **Sized by scope, not hours** (Q2). Size is a rough count of pull requests, each small enough to explain (AGENTS.md rule 2).
- **Running cost** is per month, for hosting only. AI is paid by users through credits (Q1). Figures marked *unverified* in architecture.md are estimates.
- **Order inside the MVP:** the riskiest part first (M0), then the core loop for one group (M1), then what launch needs (M2). T3 follows in three independent parts.

## Overview

| Milestone | Ships | Features | Size | Hosting cost |
|---|---|---|---|---|
| **M0. The risky slice** (Build 2) | Two browsers on one laptop voting on the same board; held-still order, the pill, Update, offline queue; the test suite everything later depends on | B-01, B-02, B-03, B-05, M-02; first part of M-01 | 7 PRs | $0 (local) |
| **M1. One group, for real** | Pod 6 builds a steelman together at `app.steelman-argument.com` | All of T1, plus the privacy parts of M-07 and M-08 | 14 PRs | ~$15–20 |
| **M2. Ready to launch** | Other pods and classes can join; moderation, phones, accessibility, the list | The rest of T2 | ~10 PRs | ~$15–20 |
| **M3a. Structure and history** | Combine, separate, undo, history | A-07, A-10, C-02, C-03, J-03, J-04, J-05 | ~8 PRs | unchanged |
| **M3b. Conversation and sharing** | Comments, invites, closing a board, email notices | B-06, D-01, F-02, H-01, H-05, I-01, I-05, L-07 | ~10 PRs | +~$0–2 |
| **M3c. AI evidence check, paid by credits** | Space admins buy credits; boards that turn it on get AI checks | K-01, K-02, K-04 | ~8 PRs | +~$0–2; AI and payment fees passed on |
| *Before public communities (T4)* | *Not planned in detail* | *G-xx, A-09, H-04, I-02–I-04, …* | — | *~$100–200* |

---

## M0. The risky slice (Build 2, due Nov 16)

**Why first:** it tests the riskiest technical problem (architecture.md §1): keeping every reader's held-still view consistent with a shared order that keeps changing underneath it.

**Backlog.** In order; each item is one pull request. Every item's acceptance tests are written first and seen to fail (architecture.md §8).

| # | Item | Builds | Acceptance tests (machine) |
|---|---|---|---|
| M0-1 ✅ done | **Toolchain and the one command** | `app/` with its three parts (`shared/`, `server/`, `web/`); TypeScript, lint, the test runner; a test database that starts itself with or without Docker; the clock and ID interfaces; `.env.example`; the GitHub Actions workflow | On a clean clone, `npm install` then `npm run check` passes with no Docker running and no network. CI runs the same command and is green. A test that moves the fake clock an hour finishes in milliseconds |
| M0-2 ✅ done | **The rules** | In `shared/`: the shared order (ties keep the previous order; unvoted items count as zero, Q23), `staleCount()`, the credibility meter, input limits | Unit tests for each rule, with cases from PRD §7 and from the *Live changes* entry (for example: the pill counts the fewest moves, 3, not every displaced row, 9) |
| M0-3 ✅ done | **Schema and invariants** | Migrations for boards, options, arguments, versions, revisions, cited sources, sources, the three vote tables, the change log; `changed_seq` and `board_id` everywhere; the two database roles | One test per invariant in architecture.md §2, each trying to break it with raw SQL and expecting the database to refuse. Migrations run on an empty database and as an upgrade |
| M0-4 ✅ done | **The write path and the API** | The one write path (lock, load, `can()`, stale rules, change, stamp); snapshot; "changes after *S*"; set a vote; assess a named revision; add an argument or wording; edit; delete; the lazy order tick. A local-only "pick a test user" switch stands in for sign-in | Every row of the stale-write table that M0 can reach (delete and edit; not hide or combine). Every write sent twice equals once. The order recalculates only after the clock passes the tick. The test-user switch is refused when the service runs in production mode |
| M0-5 ✅ done | **The simulation** | The browser's sync rules as pure functions in `shared/` (how changed rows are merged into what's on screen; what the offline queue keeps); then the seeded random simulation of architecture.md §8, running the write path and those rules together in one process | All nine "always true" checks hold over 300 sequences per run. Two planted bugs (a skipped stamp; an old revision's assessment counted) are each caught, with a shrunk sequence printed |
| M0-6 ✅ done | **The board screen** | The prototype's markup and CSS, enough to vote, see counts change in place, see the pill, and Update; polling; the offline queue, held in memory while the tab is open (architecture.md §3, Q20) | One browser test per row of *Live changes* and of *Live changes, structure* (edit and delete only), with two sessions. Leaving a tab with actions waiting brings up the browser's leave prompt, and none appears when the queue is empty. An accessibility scan and saved screenshots at desktop width and 375 px |
| M0-7 ✅ done | **Soak run and the guards** | `npm run test:soak` (30 scripted voters, 5 minutes, real time, then a recount); the protected-files check; the feature-to-test check; the nightly workflow | The soak run ends with stored counts equal to a recount. A pull request that edits an existing test is flagged. Every feature M0 covers has a test named with its ID |

**Sign-in:** none yet. The "pick a test user" switch can't be turned on in a deployed version (tested in M0-4).

**Done when (machine):** all seven items are merged and `npm run check` is green on `main`.

**Done when (person):** the builder opens two browsers, votes in one, and sees the pill in the other; reads one simulation failure report from a planted bug and can say what it means. Then writes up Build 2.

**Cost:** $0.

---

## M1. One group, for real (T1)

**Ships:** the core loop, deployed, for Pod 6.

**Features:** A-01, A-02, A-03, A-04, A-05, A-12, B-01, B-02, B-03, B-04, B-05, C-01, E-01, F-01, H-02, L-01, M-01, M-02, M-05, M-06. Plus, **brought forward from T2** because classmates' accounts are real data from day one: the privacy page rewrite, Download your data, and Delete account (M-07), and the analytics notice on the new app (M-08).

**Builds, beyond M0:**
- **Sign-in:** Better Auth with Google and 6-digit codes by email (Q21), usernames, sessions. The code-entry screen is designed in the prototype first, since the prototype shows a link. Test it with a classmate's school account early (step 1 risk).
- **Access:** link sharing with a role; the `can()` policy and its matrix test for the roles M1 uses (Owner, and the link roles Voter and Contributor).
- **The rest of the board:** add arguments and wordings, sources (resetting credibility), Strongest case, New steelman, links for boards and versions.
- **Infrastructure:** two GCP projects in Terraform; Cloud Run with domain mapping; Cloud SQL with backups and point-in-time recovery; Secret Manager; GitHub Actions with Workload Identity Federation, deploy to staging on merge, and approved releases; the scheduled calls (daily maintenance, weekly export, staging's nightly stop); budget alerts; the uptime check; the monthly restore-test workflow.
- **Stand-ins:** the fake sign-in provider and the in-memory email, so every sign-in path is tested without Google or Resend.

**Backlog.** Written Nov 12, after M0 merged. In order; each item is one pull request, with its acceptance tests written first and seen to fail. M0 already built adding arguments and wordings, the versions stack, and both votes on the board screen, so they aren't repeated here. Items 1–12 need no account and can be built before the builder's part below is done; items 13 and 14 can be written then, but only run once it is. **Needs the builder** says where an item stops for a person: a protected file (the builder adds `builder-approved`), a design to look at, or a change to what's collected about people (architecture.md §8).

| # | Item | Builds | Acceptance tests (machine) | Needs the builder |
|---|---|---|---|---|
| M1-1 ✅ done | **Mutation testing** | The nightly mutation run of architecture.md §8 on `shared/` and the write path, opening an issue for each break no test notices. First, so the tests M0 wrote are measured before M1 leans on them and before pull requests merge themselves | A planted break the tests miss is reported; the run on `main` reports its score. Holes it finds become their own tests, in this pull request or as issues | The nightly workflow is a protected file |
| M1-2 ✅ done | **Sign-in by email code, sessions, usernames** (L-01) | Better Auth with Postgres; its tables as plain SQL migrations; codes sent through an email interface whose stand-in keeps them in memory (tests) or prints them (`npm run dev`); choosing a username on first sign-in; session cookies; the `Origin` check on writes; sign-in emails limited to 5 per address per hour, counted in Postgres. The test-user switch stays, still refused outside development | A code works once; stops working ten minutes later on the test clock; is cancelled by five wrong tries and by asking for a new one. A username taken in other capitals, invalid, or reserved (`deleted_account`, `admin`, …) is refused. Signing out ends the session. A write from another origin is refused. The sixth email in an hour is refused. Codes and emails never appear in logs | The new tables change what's collected about people, as architecture.md §7 already plans: the builder confirms on the pull request |
| M1-3 | **Google sign-in, through a fake provider** (L-01) | Google through OpenID Connect, against a fake provider in tests; only a verified email is accepted; an email-code account and a Google account with the same email are one person | Sign in by fake Google and by code with the same email: one account, two sign-in methods. An unverified Google email is refused. No test calls Google | — |
| M1-4 | **The sign-in screens** (L-01) | Designed in the prototype first (it still shows the emailed link): Continue with Google, or Email me a code; entering the code (wrong, expired, resend, a different email); choosing a username. Then built in the app, and signed-out people who open a board are asked to sign in first | One browser test per path, signed in through the stand-ins. Accessibility scan and saved screenshots at desktop width and 375 px | **The design**, shown one screen at a time before it's built |
| M1-5 | **Roles and link sharing** (H-02) | `board_member`; the board's general access (invited only, or anyone with the link) and its link role; the roles Owner, Contributor, and Voter in the policy table and `can()`; the share setting under the question | The role matrix (architecture.md §7) for Owner, Contributor, Voter, signed out, and non-member, one test per action × role. Link access needs a confirmed email. Turning link access off removes link members and keeps invited ones | The policy table is a protected file, and roles let people do more than M0's switch did |
| M1-6 | **New steelman** (F-01) | The New steelman sheet (question and 2–4 option headers, laid out like the board); creating the board makes its creator Owner; the local seed script (the prototype's example boards and a few test accounts) | A board needs a question and at least two distinct options; more than four is refused. Its ID is unguessable (72 bits). The creator can open it at once; a non-member can't | — |
| M1-7 | **Links** (M-06) | An address for every board and version; the address follows what's open; Back, Forward, and reload work; Copy link on versions; opening a link reveals and rings its target; a deleted version and an unknown board have their own states | One browser test per kind of link, including a deleted version, an unknown board, and a signed-out person opening a board that isn't open to everyone (signs in first, shows nothing before) | — |
| M1-8 | **Sources, on the server** (C-01) | Add, edit, and remove a source; cite sources on a wording, which saves a new revision so its credibility starts over; editing a source's evidence (link, finding, backs up, limits) gives every wording that cites it a new revision, and fixing only its name doesn't (Q10) | The rows of PRD §4 and Q10, through the API: assessments of the old revision stop counting and stay as history; a "yes" with no available source is refused; every write sent twice equals once. Links that aren't `http` or `https` are kept as text | — |
| M1-9 | **Card details: evidence, credibility, assessing** (A-02, B-03, B-04, C-01) | On the board screen, in the prototype's markup: context and evidence when a card expands; the source form; the four-segment meter ("few" under five); the yes/no assessment; "This wording changed; take another look" when an assessment meets a newer revision | Browser tests with two people: an edit in one browser resets the meter in the other; a source edit resets every card citing it; a stale assessment shows its message. Accessibility scan and saved screenshots | The meter's form (bar or ring, still open in `plans/features.csv`), if it changes from the prototype |
| M1-10 | **The card menu** (A-12) | The ⋯ menu with M1's actions, shown by role: edit, delete (held in the browser for ten seconds with Undo, sent at once if the tab closes), suggest a revised version, copy link. Combine, separate, report, and the AI actions come later and don't appear | Each action from the menu works in the browser, as author and as someone else. Undo within ten seconds sends nothing; closing the tab within ten seconds sends the delete | — |
| M1-11 | **Strongest case** (E-01) | The Board / Strongest case switch: each option's top three arguments in their best current wording, with meter, importance, and how many wordings each beat | Derived from the shared order, not from the reader's own view: a test where the two differ. A browser test of the switch | — |
| M1-12 | **Download your data and Delete account** (M-07) | Download your data (the prototype's JSON shape); Delete account (type the username), running the deletion table of architecture.md §2 in one transaction under the deletion role, then asking PostHog's stand-in to delete their analytics | Every row of the deletion table, including a board handed to its longest-standing member and a board nobody else can open deleted (Q11). Afterwards nothing links two of their contributions. Export holds everything they wrote and nothing of anyone else | Deletion changes what's kept about people: the builder confirms the pull request matches the table |
| M1-13 | **The privacy page and analytics on the app** (M-07, M-08) | The privacy page rewritten with the eight points of architecture.md §7; the first-visit analytics notice, Global Privacy Control, and Do Not Track on the app, with typed text masked in replays; the Content Security Policy | The notice appears once and Turn off stops every PostHog call; with Global Privacy Control or Do Not Track set, none is ever made. The policy blocks a script from another site | **Yes**: the privacy page and what's collected are the builder's call. The pull request is drafted, then waits |
| M1-14 | **Infrastructure and delivery** | Terraform for staging and production (Cloud Run with domain mapping, Cloud SQL with backups and point-in-time recovery, Secret Manager, service accounts, budget alerts, the uptime check, the scheduled calls); the workflows: container build and secret scan on every pull request, deploy to staging on merge with the smoke test, the approved production release, the monthly restore test. The Resend email sender behind M1-2's interface | `terraform validate` and the container build pass in CI. Once the builder's part is done: the smoke test is green on staging after a merge, and the restore test has run once and passed | **Yes**: applying Terraform costs money and needs the builder's accounts; the workflows are protected files; releases to production are the builder's. May split into Terraform and workflows if it's too big to read in one sitting |

**Not in M1, noted while writing this:** a list of your boards. M1 has none, so people come back to a board by its link. If that's too awkward for the class test, it's a small item to add here.

**The builder's part, before agents start M1** (architecture.md §8): add the DNS records for `steelman-argument.com` (bought Nov 11) for Cloud Run and for Resend; open the GCP billing account and both projects; set up Google's consent screen and client IDs; open the Resend account and add its DNS records; turn on branch rules (required checks, auto-merge) and the protected production environment in GitHub. Agents can build and test all of M1 before those records exist, but **M1 isn't shown to classmates until email sign-in works from the domain** (Q13), so it launches with both sign-in methods.

**Done Nov 14.** What the infrastructure (M1-14) and Google sign-in need. None of it is secret: Google's client secrets and Resend's API keys are kept by the builder, and reach the service through Secret Manager.

| | Staging | Production |
|---|---|---|
| GCP project (billing linked) | `steelman-staging` (1072423828337) | `steelman-production` (1029089358609) |
| Google OAuth client ID | `1072423828337-8lva9oad7kqnae9gbsahds99d2m9qr5h.apps.googleusercontent.com`, also used locally | `1029089358609-f0m56dpc56ulpq5vm0l5nct16klg2ope.apps.googleusercontent.com` |
| Its redirect addresses | `http://localhost:5173/api/auth/callback/google`, `https://staging.steelman-argument.com/api/auth/callback/google` | `https://app.steelman-argument.com/api/auth/callback/google` |

Google's consent screen is in Testing, so only the test users added there can sign in with Google until it's published. Search Console has verified `steelman-argument.com`, and Resend has verified it for sending (from `send.steelman-argument.com`, through Cloudflare). GitHub: `main` requires the two `npm run check` jobs and the protected-files check, auto-merge is on, and the `production` environment needs the builder's approval. The DNS records for Cloud Run come with M1-14, when the services exist.

**Done when (machine):** browser tests sign in by emailed code and by the fake Google, and the two reach the same account when the email matches. A code works once, stops working ten minutes later on the test clock, and is cancelled by five wrong tries. The role matrix passes for Owner, Voter, Contributor, signed out, and non-member. Deleting an account passes every row of the deletion table in architecture.md §2. The staging smoke test is green after a merge. The restore-test workflow has run once and passed.

**Done when (person):** three classmates on their own devices build one board together, from creating it to Strongest case. Two of them sign in with different methods, one with a school Google account.

**Cost:** about $15–20 a month: production Cloud SQL ~$9–10 (not yet confirmed from Google's pricing page), Cloud Run ~$0–5, staging's database stopped except around deploys (~$2), domain ~$1, Resend and PostHog free tiers.

---

## M2. Ready to launch (T2)

**Ships:** a version you can open to other pods and classes.

**Features:** A-06 (edit and delete your own wording, with "edited", the earlier wording, and on hover or tap the vote counts it had before the edit, Q22), E-03 (the list), H-03 (every role enforced, including Editor and Viewer, the full matrix), J-01 and J-02 (report; hide and restore with a reason, recorded in the change log), L-02 (tour), L-04 (account card: email change, Google connect, sign out), M-03 (phones), M-04 (accessibility: rerun axe on every screen), M-07 (finished: retention jobs, PostHog deletion), M-08 (server events).

**Done when (machine):** every action in the role matrix passes for all seven personas; a report → hide → restore cycle shows in the change log with its reason; the accessibility scan reports no violations on the screens checked on Nov 11; the core loop passes as a browser test at 375 px; the simulation includes hide, restore, and edit by an editor.

**Done when (person):** someone completes the core loop on a real phone; someone tries it with a real screen reader.

**Cost:** unchanged, about $15–20 a month.

---

## M3. Enhance (T3), in three independent parts

Each part can ship on its own, in any order. M3c is last only because it involves money.

### M3a. Structure and history

**Features:** A-07 (options: add, rename, delete), A-10 (combine and separate: stable version IDs, articulation votes travel, Q8), C-02 (report a source unavailable), C-03 (evidence-changed handling), J-03 (History panel, reading the change log), J-04 (structural rollback), J-05 (Undo bars).

**Done when (machine):** the simulation gains combine, separate, and undo, and its checks still hold; combine, then undo, restores the earlier structure and votes, while a wording added in between stays where it was added; offline votes against a combined argument follow the rules in architecture.md §3.

### M3b. Conversation and sharing

**Features:** B-06, D-01 (comments, with links), F-02, H-01 (invite by username or email), H-05 (copy link + invite landing), I-01 (board settings), I-05 (close by date: lazy, no timer), L-07 (email notifications: the first background jobs, via Cloud Tasks).

**Cost:** Cloud Tasks inside its free tier at this scale (*unverified*); Resend may need its $20 plan if notification volume passes 3,000 emails a month or 100 a day.

### M3c. AI evidence check, paid by credits

**Features:** K-01 (the ochre visual language), K-02 (evidence check), K-04 (credits and a space's budget; moved to T3, Q9).

**Builds:** the credit ledger; Stripe Checkout for credit packs and its webhook; the evidence check as a Cloud Tasks job, saved against the version revision; the guarded fetcher for sources; the model provider's spend limit set; privacy page updated (Stripe, the model provider).

**Done when (machine, with stored Stripe messages and recorded model answers; then once by hand on staging):** a space admin buys a credit pack in Stripe's test mode; an evidence check runs, costs the shown credits, and shows its verdict, basis, and limits; with no credits left, the button is disabled with the "Out of AI credits" note; AI is off on a new board by default.

**Cost:** hosting barely changes. Every model call and every Stripe fee is covered by the credits users buy; pricing the credit packs to cover both is a product decision for M3c.

---

## Before public communities (T4, not planned in detail)

Infrastructure that has to be in place first, whatever T4's features turn out to be:

- the global load balancer instead of domain mapping, with Cloud Armor rate limiting (architecture.md §6, §7);
- new-member holds and spam checks;
- a larger database and 2+ Cloud Run instances; server-sent events if polling passes ~100 requests a second;
- the privacy page reviewed by someone qualified.

Expected hosting cost: about $100–200 a month.
