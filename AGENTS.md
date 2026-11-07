# AGENTS.md — Coding Agent Operating Manual

> Give this file to your coding agent and check that it is using these instructions. Keep the stack, commands, and ground rules current.

## 1. Project Overview
- **What this repo builds:** Steelman, a shared argument document for understanding the strongest case for each option. Build 1 is a static Product Page plus a supplied browser-local card prototype.
- **Primary user & core workflow:** Pod 6 classmates are the initial reachable testers. Read the two cases, compare wording, inspect evidence, and suggest a better version. The class PRD is in `docs/index.html`; the original long-term vision is preserved in `docs/reference/steelman-prd-v0.4.md`.
- **Tech stack:** Buildless HTML, CSS, and JavaScript. GitHub Pages serves `main:/docs`. No backend, API keys, package installation, or live AI calls.
- **Visual identity:** Design tokens live in `docs/design/tokens.css`; the specimen is `docs/design/index.html` and the identity brief is `docs/design/README.md`. After changing tokens or the prototype source, run `python3 scripts/sync-prototype.py`. The canvas contour tile comes from `python3 scripts/make-contours.py`.

## 2. Commands
- **Install dependencies:** None. A modern browser is sufficient; the supplied prototype loads fonts and icons from public CDNs.
- **Run locally:** `python3 -m http.server 8000 --bind 127.0.0.1 --directory docs`, then open `http://127.0.0.1:8000/` or `/prototype/`. Alternatively, open `docs/prototype/index.html` directly.
- **Verify:** `git diff --check`, then follow `tests/build-1-manual.md`. Use browser checks for actual behavior; do not claim user research from agent testing.
- **Run model evals:** Not applicable to Build 1; no model runs in the prototype.

## 3. Non-Negotiable Engineering Rules
1. **Plan before coding:** Before touching multiple files, propose a brief plan and wait for approval.
2. **Small batches:** Make small, focused changes that can be reviewed and explained by a human in a single Pull Request.
3. **Explainability:** Avoid unnecessary abstractions or dependencies. Help the human builder understand the main components, what changed, why it matters, what could break, and how it was checked.
4. **Verify changes:** Run relevant checks. For a reproducible logic bug, use a failing test to demonstrate the fix when practical. Record manual checks and known limitations; follow the selected Build 4 evaluation track.
5. **Zero secrets in code:** Never hardcode API keys, tokens, or credentials. Always read from environment variables (`.env`) and update `.env.example` when new variables are needed.
6. **Stop when looping:** If a fix fails twice in a row, stop, summarize what failed, and ask the human before trying a third approach.
