# Plan.md — Optional Risk, Architecture & Budget Draft (Build 2)

Use this as a scratchpad if helpful. Publish PRD v2 and the Build 2 log on `docs/index.html`; this file is not a separate hand-in.

**Due:** Monday, Nov 16, 2026 at 12:00 PM (Noon)  
**Builder:** Kieran LaMee

---

## 1. What is the riskiest part?
*What is the single most likely reason this product fails to work for a real user (e.g., model hallucination on messy PDFs, latency, auth, bad data, third-party API limits)? How does your smallest local version test that risk first?*

- **#1 Technical / Product Risk:** Keeping every reader's held-still view consistent with a shared order that keeps changing underneath it. Each reader keeps the order they loaded while others vote, add, edit (which resets credibility), and delete. The server must tell each reader how far behind they are ("3 changes"), apply exactly those changes on Update, and handle actions queued offline against a view that's gone stale (a vote on a deleted wording, an assessment of wording that's since been edited). If this goes wrong, it fails silently: counts that disagree between people, or a vote landing on the wrong wording.
- **How Build 2 tests it right now:** Milestone M0 (`plans/build-plan.md`) builds only this slice, locally: one board, every write taking the board's next change number and stamping the rows it touched, every write naming the wording revision it was made against, and polling for "changes after N". It passes when a seeded random simulation of many readers (voting, editing, deleting, going offline and coming back) always ends with correct counts and every reader seeing the same board; the November 11 *Live changes* scenarios in `tests/build-1-manual.md` pass as browser tests with two sessions; and 30 scripted voters running for 5 minutes leave the stored counts equal to a fresh recount.

## 2. The Smallest Working Version (Architecture)
*Use AI to understand the main components, data flow, and risks, then explain them in your own words.*

- **Stack (Frontend / Backend / DB):** TypeScript end to end. React + Vite in the browser; a Fastify API in one service; one Postgres 17 database (current-state tables plus a per-board change log), queried through Kysely. Later: Better Auth for sign-in, GCP (Cloud Run + Cloud SQL) for hosting. The full design is in `plans/architecture.md`, with one diagram, and the choices in `plans/decisions/`.
- **Local run command:** `docker compose up -d db`, then `npm run dev` in `app/`
- **Local URL (Build 2):** `http://localhost:5173`
- **Models used (via OpenRouter or provider):** None in Build 2. The first model call is the AI evidence check (milestone M3c), paid by users through credits.

## 3. Time & Money Budget
*Estimate what it will cost to build and what it costs each time a user runs a job.*

| Item | Estimate | Notes |
| :--- | :--- | :--- |
| **Build budget (coding agent / OpenRouter)** | `$` (fill in: the Claude plan) | Claude writes the code; no OpenRouter spend |
| **Unit cost per user action (inference/API)** | `$0 / run` | No inference in the MVP. From M3c, each AI check is paid by the user's credits |
| **Hosting cost (monthly)** | `$0 / mo` in Build 2 (local); about `$15–20 / mo` from M1 | Cloud SQL ~$9–10 (not yet confirmed from Google's pricing page), Cloud Run ~$0–5, staging's stopped database ~$2, domain ~$1; about $100–200 a month before public communities |
| **Your engineering time budget** | Sized by scope, not hours | Claude builds it; agents work the backlog unattended, gated by automated tests (7 PRs for M0); the builder's time goes to approvals and the checks only a person can make |

## 4. Security & Recovery Checklist
- [x] `.env` and API keys are excluded via `.gitignore` (`.env` and `.env.*` ignored; `.env.example` kept with names only)
- [ ] Spending limits or alerts are configured where the provider supports them (at M1: GCP budget alerts at 50/90/100%, Cloud Run maximum instances; at M3c: the model provider's spend limit)
- [ ] Least-privilege permissions on any external data/APIs (at M1: one service account per environment that reads only its own secrets; GitHub deploys through Workload Identity Federation, with no stored keys)
- [x] Git save point for undoing a broken local change; add a cloud rollback path in Build 5 (planned: route traffic back to the previous Cloud Run revision; database point-in-time recovery)
