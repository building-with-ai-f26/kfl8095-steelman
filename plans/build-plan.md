# Steelman build plan

**Status:** draft for review (Nov 11, 2026). Goes with [architecture.md](architecture.md); feature IDs are from [features.csv](features.csv).

## How to read this

- **Each milestone ships something people can use**, and has a "done when" test you can check in a browser.
- **Sized by scope, not hours** (Q2): Claude writes the code, so the limit is how much you can review and understand. Size is given as a rough count of pull requests, each small enough to explain (AGENTS.md rule 2).
- **Running cost** is per month, for hosting only. AI is paid by users through credits (Q1). Figures marked *unverified* in architecture.md are estimates.
- **Order inside the MVP:** the riskiest part first (M0), then the core loop for one group (M1), then what launch needs (M2). T3 follows in three independent parts.

## Overview

| Milestone | Ships | Features | Size | Hosting cost |
|---|---|---|---|---|
| **M0. The risky slice** (Build 2) | Two browsers on one laptop voting on the same board; held-still order, the pill, Update, offline queue | B-01, B-02, B-03, B-05, M-02; first part of M-01 | ~6 PRs | $0 (local) |
| **M1. One group, for real** | Pod 6 builds a steelman together at `app.<domain>` | All of T1, plus the privacy parts of M-07 and M-08 | ~12 PRs | ~$15–20 |
| **M2. Ready to launch** | Other pods and classes can join; moderation, phones, accessibility, the list | The rest of T2 | ~10 PRs | ~$15–20 |
| **M3a. Structure and history** | Combine, separate, undo, history | A-07, A-10, C-02, C-03, J-03, J-04, J-05 | ~8 PRs | unchanged |
| **M3b. Conversation and sharing** | Comments, invites, closing a board, email notices | B-06, D-01, F-02, H-01, H-05, I-01, I-05, L-07 | ~10 PRs | +~$0–2 |
| **M3c. AI evidence check, paid by credits** | Space admins buy credits; boards that turn it on get AI checks | K-01, K-02, K-04 | ~8 PRs | +~$0–2; AI and payment fees passed on |
| *Before public communities (T4)* | *Not planned in detail* | *G-xx, A-09, H-04, I-02–I-04, …* | — | *~$100–200* |

---

## M0. The risky slice (Build 2, due Nov 16)

**Why first:** it tests the riskiest technical problem (architecture.md §1): keeping every reader's held-still view consistent with a shared order that keeps changing underneath it.

**Builds:**
1. The app's folder and toolchain: TypeScript, Fastify, Vite + React, Kysely; Postgres in Docker; `.env.example`.
2. Shared logic moved from the prototype into tested modules: the shared order (ties keep the previous order), `staleCount()`, the credibility meter.
3. The schema for boards, options, arguments, versions, revisions, sources, the three vote tables, and the change log, with the invariants of architecture.md §2 as database constraints.
4. The API: board snapshot; "changes after *S*"; votes and assessments carrying their revision; lazy order recalculation with the 60-second tick.
5. A minimal board screen: the prototype's markup and CSS, enough to vote, see counts change in place, see the pill, and Update. Offline queue in IndexedDB.
6. The test harness: two or three browser sessions plus ~30 scripted voters, running the November 11 *Live changes* scenarios.

**Sign-in:** none yet. A local-only "pick a test user" switch stands in, and it can't be built into a deployed version.

**Done when:** the *Live changes* and *Live changes, structure* (delete only) scenarios pass with two browsers; 30 scripted voters for 5 minutes leave the stored counts equal to a recount from the vote tables; an assessment of an edited wording is refused with "Take another look".

**Cost:** $0.

---

## M1. One group, for real (T1)

**Ships:** the core loop, deployed, for Pod 6.

**Features:** A-01, A-02, A-03, A-04, A-05, A-12, B-01, B-02, B-03, B-04, B-05, C-01, E-01, F-01, H-02, L-01, M-01, M-02, M-05, M-06. Plus, **brought forward from T2** because classmates' accounts are real data from day one: the privacy page rewrite, Download your data, and Delete account (M-07), and the analytics notice on the new app (M-08).

**Builds, beyond M0:**
- **Sign-in:** Better Auth with Google and email links (Continue page), usernames, sessions. Test it with a classmate's school account early (step 1 risk).
- **Access:** link sharing with a role; the `can()` policy and its matrix test for the roles M1 uses (Owner, and the link roles Voter and Contributor).
- **The rest of the board:** add arguments and wordings, sources (resetting credibility), Strongest case, New steelman, links for boards and versions.
- **Infrastructure:** the domain; two GCP projects in Terraform; Cloud Run with domain mapping; Cloud SQL with backups and PITR; Secret Manager; GitHub Actions with Workload Identity Federation, previews, and approved releases; the daily maintenance call; budget alerts; the uptime check.

**Done when:** three classmates on their own devices build one board together, from creating it to Strongest case. Two of them sign in with different methods. The monthly restore test has run once. Delete account leaves their wordings credited to `deleted_account`.

**Cost:** about $15–20 a month: production Cloud SQL ~$10 (*unverified*), Cloud Run ~$0–5, staging stopped when idle, domain ~$1, Resend and PostHog free tiers.

---

## M2. Ready to launch (T2)

**Ships:** a version you can open to other pods and classes.

**Features:** A-06 (edit and delete your own wording, with "edited" and the earlier wording), E-03 (the list), H-03 (every role enforced, including Editor and Viewer, the full matrix), J-01 and J-02 (report; hide and restore with a reason, recorded in the change log), L-02 (tour), L-04 (account card: email change, Google connect, sign out), M-03 (phones), M-04 (accessibility: rerun axe on every screen), M-07 (finished: retention jobs, PostHog deletion), M-08 (server events).

**Done when:** every action in the role matrix test passes for all seven personas; a report → hide → restore cycle shows in the change log with its reason; axe reports no violations on the screens checked on Nov 11; a phone user completes the core loop.

**Cost:** unchanged, about $15–20 a month.

---

## M3. Enhance (T3), in three independent parts

Each part can ship on its own, in any order. M3c is last only because it involves money.

### M3a. Structure and history

**Features:** A-07 (options: add, rename, delete), A-10 (combine and separate: stable version IDs, articulation votes travel, Q8), C-02 (report a source unavailable), C-03 (evidence-changed handling), J-03 (History panel, reading the change log), J-04 (structural rollback), J-05 (Undo bars).

**Done when:** combine, then undo, restores the earlier structure and votes, while a wording added in between stays where it was added; offline votes against a combined argument follow the rules in architecture.md §3.

### M3b. Conversation and sharing

**Features:** B-06, D-01 (comments, with links), F-02, H-01 (invite by username or email), H-05 (copy link + invite landing), I-01 (board settings), I-05 (close by date: lazy, no timer), L-07 (email notifications: the first background jobs, via Cloud Tasks).

**Cost:** Cloud Tasks inside its free tier at this scale (*unverified*); Resend may need its $20 plan if notification volume passes 3,000 emails a month or 100 a day.

### M3c. AI evidence check, paid by credits

**Features:** K-01 (the ochre visual language), K-02 (evidence check), K-04 (credits and a space's budget; moved to T3, Q9).

**Builds:** the credit ledger; Stripe Checkout for credit packs and its webhook; the evidence check as a Cloud Tasks job, saved against the version revision; the guarded fetcher for sources; the model provider's spend limit set; privacy page updated (Stripe, the model provider).

**Done when:** a space admin buys a credit pack in Stripe's test mode; an evidence check runs, costs the shown credits, and shows its verdict, basis, and limits; with no credits left, the button is disabled with the "Out of AI credits" note; AI is off on a new board by default.

**Cost:** hosting barely changes. Every model call and every Stripe fee is covered by the credits users buy; pricing the credit packs to cover both is a product decision for M3c.

---

## Before public communities (T4, not planned in detail)

Infrastructure that has to be in place first, whatever T4's features turn out to be:

- the global load balancer instead of domain mapping, with Cloud Armor rate limiting (architecture.md §6, §7);
- new-member holds and spam checks;
- a larger database and 2+ Cloud Run instances; server-sent events if polling passes ~100 requests a second;
- the privacy page reviewed by someone qualified.

Expected hosting cost: about $100–200 a month.
