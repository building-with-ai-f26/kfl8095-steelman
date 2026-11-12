# Steelman

> A shared argument document for understanding the strongest case for each option.

- **Builder:** Kieran LaMee ([@Kieran-LaMee](https://github.com/Kieran-LaMee))
- **Pod:** 6 · Building with AI, Fall 2026
- **Product Page, living PRD v1, and build log:** https://building-with-ai-f26.github.io/kfl8095-steelman/
- **Interactive prototype:** https://building-with-ai-f26.github.io/kfl8095-steelman/prototype/
- **Repository:** https://github.com/building-with-ai-f26/kfl8095-steelman

## Run locally

No package installation, API keys, or backend are needed. Open `docs/prototype/index.html` directly in a modern browser. An internet connection loads the supplied prototype's fonts and icons.

To serve both the Product Page and prototype:

```sh
git clone https://github.com/building-with-ai-f26/kfl8095-steelman.git
cd kfl8095-steelman
python3 -m http.server 8000 --bind 127.0.0.1 --directory docs
```

Open http://127.0.0.1:8000/ for the page, or http://127.0.0.1:8000/prototype/ for the demo. Stop the server with Ctrl+C.

## Try the core workflow

1. Read the two cases for “Should our library open on Sundays?”
2. Open the stack beside the first argument and compare its three wordings.
3. Prefer a wording, then expand its card with the chevron and inspect its source finding and limitation. Other versions remain alongside it.
4. Assess whether the evidence supports the wording; change or withdraw the assessment.
5. Suggest a qualified version, preview it, and add it to the same idea.
6. Return to the diagram. Importance voting leaves the order stable; “Preview update” applies a simulated shared-order change.

The claims, sources, and aggregate votes are illustrative. The export saves votes and suggestions locally in this browser when browser storage is available. They survive refresh but are not shared with other visitors or devices. There are no real users, live AI calls, shared backend, server storage, or implemented revision history.

## Project map

| Path | Purpose |
| --- | --- |
| `docs/index.html` | Canonical class PRD v1, Product Page, and Build 1 log |
| `docs/styles.css` | Product Page layout and responsive styling |
| `docs/prototype/` | Current runnable prototype and editable source fragment; the original is preserved in Git history |
| `scripts/sync-prototype.py` | Copies source changes into the standalone prototype export |
| `docs/assets/` | Actual browser screenshots for the Product Page |
| `docs/reference/steelman-prd-v0.4.md` | Original detailed PRD, unchanged; background vision rather than class scope |
| `app/` | The real product, from Build 2: its commands and layout are in `app/README.md` |
| `tests/build-1-manual.md` | Browser checks, results, and limits |
| `journal/build-01-intent.md` | Build notes and remaining submission tasks |
| `AGENTS.md` | Project context, run commands, and engineering rules |

GitHub Pages publishes `main` → `/docs`. There is no build command; `.nojekyll` keeps delivery static. The remaining course-template planning and journal files are optional aids for later builds.

## Build 1 handoff

Submit the Product Page URL in Icerynk's Link field and the repository URL in its note, by **Monday, November 9, 2026 at noon New York time**. The page contains the required PRD and log; no separate Intent or journal submission is needed.

Meaningful builds were committed and pushed on November 5 and November 6. Continue the two-day cadence each week.

Still requires builder participation: create a PostHog account (instrumentation is Build 2), complete the Week 1 memo and Terminus Episodes 1–2, submit the two URLs in Icerynk, and prepare the November 10 two-minute demo. Do not backdate commits or treat agent browser checks as user research.
