# Next session: system architecture

Paste the prompt below into a new Claude Code session in this repository.

---

Act as the senior technical lead for Steelman. Your job this session is to design the system architecture for the real product: one that meets the needs the prototype has worked out, scales from a class trial to public communities, and stays easy to change as we learn. I'll deploy on **GCP or AWS**; help me choose. This is a design session: write documents, not application code.

## Read first

- `AGENTS.md` (ground rules: plan before touching multiple files, small reviewable changes, explain what you build, zero secrets in code).
- `plans/features.csv` (or `plans/feature-audit.xlsx`): all 88 features with MVP tier, development complexity, design readiness, and the infrastructure each one needs ("Real-version needs"). **MVP = T1 Core + T2 Launch.** The Summary sheet counts infrastructure needs across the MVP.
- `docs/prototype/README.md`: what every feature does. The prototype (`docs/prototype/source/steelman-refined.html`) is the design spec; its in-memory document model (`doc.options`, `doc.ideas`, `doc.cards`, `doc.sources`, `doc.comments`, `doc.log`) is a starting point for the data model, not a schema to copy.
- `tests/build-1-manual.md`, the November 11 entries: the decisions behind each design.
- `plans/permissions.md`, `plans/ai-integrations.md`, `docs/privacy.html`, and `docs/reference/steelman-prd-v0.4.md` §4–7 (vote and identity rules, the collaborative trials).

## Decisions already made (don't reopen without asking)

- **The core loop:** a group builds a steelman together. Arguments (ideas) sit in options; each has versions (wordings). Three separate judgments: importance (±1 per person per argument), articulation (±1 per person per version), and credibility (yes/no evidence assessments per version). Strongest case is each side's top three.
- **Shared order, held still:** the order a reader sees is fixed when the board loads. Others' votes update counts in place; new arguments and wordings join the end; deleted, combined, and separated items stay marked until the reader chooses **Update** (or reloads). Drafts follow their argument. There is an offline state that queues your own actions. How often the shared order recalculates is open.
- **Identity:** sign in with Google or a one-time email link. No passwords. Both confirm the email, so there are no unconfirmed accounts; a link-shared board requires a confirmed email. First sign-in picks a unique username.
- **Edits:** like Reddit. Versions can be edited any time and say "edited", with the previous wording kept. Any edit, and any change to a version's sources, resets that version's credibility assessments (not importance or articulation votes).
- **Stable IDs:** a version keeps its ID when combined or separated. Every board, version, and comment has a link.
- **Privacy:** common US practice for analytics (notice with opt-out; Global Privacy Control and Do Not Track honored). Users can download their data. Deleting an account removes email, votes, assessments, and comments; arguments, wordings, and sources stay, credited to `deleted_account`.
- **Moderation:** reports and hide/restore with reasons and an audit trail are launch-critical (T2).
- **AI:** clearly labelled, never casts counted votes, never reorders. The first real model call is the evidence check (T3), metered with credits per space.
- **Analytics:** PostHog (US cloud) stays.

## What I need from you

Work through these **one at a time**: draft, show me, and wait for my OK before the next. Keep a running list of open questions and ask me only the ones that change the design.

1. **Requirements and constraints.** Turn the MVP rows into a short list of functional and non-functional requirements: expected scale (start: a class of ~30; later: public communities of thousands), latency for live updates, availability, cost ceiling for a student project, privacy, and the team (one builder with an AI coding agent). Name the riskiest technical problem and how the architecture tests it first.
2. **Data model.** Entities, relationships, and the invariants that matter: one vote per person per target, stable version IDs across combine/separate, the edit and reset rules, soft deletes and anonymization, the audit log. Say what lives in a relational database, what is derived (scores, order, strongest case, points), and how structural changes stay reversible (event log vs. snapshots).
3. **Live updates and ordering.** How clients receive changes, how the "N changes · Update" model works on the server, how votes aggregate into the shared order, offline queuing and conflict handling, and the recalculation cadence. Compare realistic options (managed realtime database, websockets/server-sent events on our own service, polling to start) and recommend one.
4. **System components.** Frontend (and how we move from the buildless prototype to a real app), API, auth provider, database, realtime, background jobs (scheduled closes, notifications, AI checks), email, file/link handling for sources, analytics, AI calls. Prefer managed services and boring, well-documented technology. Draw one diagram.
5. **Cloud choice: GCP vs AWS.** Compare the specific services each would use for the components above, cost at class-trial and community scale, free tiers and credits, operational effort for one person, and lock-in. Keep the design portable (containers, Postgres, standard OAuth/OIDC, infrastructure as code) so switching later is possible. Recommend one.
6. **Environments and delivery.** Local development, preview/staging, and production; CI/CD from GitHub; database migrations; secrets management (`.env.example` locally, a secret manager in the cloud); backups and rollback; logging, monitoring, and spend alerts.
7. **Security and privacy.** Authorization model (server-side checks for every role in `plans/permissions.md`), data export and deletion jobs, rate limiting and abuse protection for public boards, and what the privacy page will need to say once accounts exist.
8. **Phased build plan.** Milestones that each ship something usable, mapped to feature IDs: first the T1 core loop for one private group, then T2 launch requirements, then T3. Rough effort and running cost per phase.

## Deliverables

- `plans/architecture.md`: the architecture, written so the builder can explain it in their own words (the course asks for this), with one diagram (Mermaid is fine).
- `plans/decisions/NNN-title.md`: one short decision record per major choice (cloud, database, realtime, auth, frontend framework), each with the options considered, the choice, why, and what would make us revisit it.
- `plans/build-plan.md`: the phased plan.
- Update `plans/features.csv` for M-01 (and any row whose complexity or needs change), then run `python3 scripts/build-feature-audit.py`.
- Once I approve the stack, propose the edits to `AGENTS.md` (tech stack, commands, install) and `Plan.md` (Build 2: riskiest part, architecture, time and money budget, security checklist). Don't make them before I approve.

## House rules

- Recommend; don't survey. For each choice, give two or three real options, the tradeoffs that matter here, and your pick.
- Prefer fewer moving parts. Every component must earn its place against "a single Postgres database and one service".
- Cite current pricing and limits from the providers' own pages, and say when you couldn't verify a number.
- No application code, accounts, or cloud resources this session. Never put keys or credentials in files.
- One branch and one PR for the documents; follow the PR template, including the feature-audit checkbox.

Start with step 1.
