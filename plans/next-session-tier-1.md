# Next session: Tier 1 workflows

Paste the prompt below into a new Claude Code session in this repository.

---

We're continuing the Steelman prototype (`docs/prototype/source/steelman-refined.html`, a buildless browser-local wireframe). Read `AGENTS.md`, `docs/prototype/README.md`, `plans/permissions.md`, and `plans/ai-integrations.md` first. P1–P5 (roles, Preview as, How it runs, editors and review, moderation and history, closing and decisions) and AI A0/A2 (ochre robot marks, simulated evidence checks with credits) are built and merged.

Build the four Tier 1 workflows below, **one component at a time**: build it, verify it in the browser, show me, and wait for my OK before starting the next. They can all go on one branch and one PR.

House rules:
- Keep explanatory text to a minimum. If something needs a sentence to be understood, rework the UI instead.
- Ochre (`--sm-ai`) and the robot icon mean AI and nothing else. Colors come from `docs/design/tokens.css`.
- Match the existing panel style (Share, Settings, the create sheet's How it runs): 11 px tracked-caps group headings, rows split by hairlines, quiet controls on the right.
- Everything stays simulated: no accounts, backend, or real email. Say "simulated" only where a tester could otherwise be misled.
- Respect roles (`NEEDS`, `can()`, Preview as). Add any new actions to `NEEDS`.
- After each component: run `python3 scripts/sync-prototype.py` and `git diff --check`; check desktop and 375 px (no horizontal overflow) and the console; update `docs/prototype/README.md` and add a dated entry to `tests/build-1-manual.md`. If you change seed boards, bump the saved `docsVersion`.

## 1. Profile and points
A profile page from the avatar in the top bar (and from any username).
- **Account:** username, email, a password field with Change (simulated), Sign out (switches Preview as to Signed out).
- **Credits:** your personal credits plus those of spaces you admin, with recent usage (AI checks and drafts already spend `state.spent`).
- **Contributions:** your arguments, wordings, and sources across boards, each linking to its card.
- **Points** (simple, like karma; no money): earned for strengthening the debate whichever side it's on: your wording leads its row, your argument reaches a side's top three, a source you added is assessed as supporting, an editor accepts your submission. Show the total and a short breakdown on the profile only, not on cards. Seed plausible numbers for the example users.

## 2. Create and edit a space
"+ New space" in the sidebar, and a space Settings view for its admins.
- Name, about, canvas (the six existing canvases), private space or public community.
- Members and roles (admin, moderator, member), invites, and join requests for private spaces.
- Community rules (a short list shown on the space card) and the moderator list.
- **AI admin (finishes plan A1):** which AI features boards in the space may use, the credit budget and balance, usage. `SPACE_AI` becomes editable state instead of fixed sample values.
- New spaces appear in the sidebar and in the New steelman space picker, and set defaults for How it runs.

## 3. Notifications
A bell in the top bar with an unread count and an inbox panel. Events: your held item was accepted or declined (with the reason), a reply to your comment, items waiting for you to review or moderate, a board closing within a day, a decision recorded on a board you took part in, a join request or invite. Each links to its place on the board. Mark as read, mark all read. Seed a few for the example user.

## 4. Invite landing and onboarding
What a tester sees when they open a shared link for the first time: a landing state for the board (who invited you, the question, your role), sign up or sign in (simulated), then a short, skippable first-visit tour of the three votes (importance, articulation, evidence) on the real board, using the board's own cards rather than prose. Revisit the tour from the profile.

Start with component 1. Propose a brief plan first, as `AGENTS.md` asks.
