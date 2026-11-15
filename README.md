# Steelman

> A shared argument document for understanding the strongest case for each option.

- **Builder:** Kieran LaMee ([@Kieran-LaMee](https://github.com/Kieran-LaMee))
- **Pod:** 6 · Building with AI, Fall 2026
- **Product Page, PRD v2, and build log:** https://building-with-ai-f26.github.io/kfl8095-steelman/
- **Interactive prototype:** https://building-with-ai-f26.github.io/kfl8095-steelman/prototype/
- **Repository:** https://github.com/building-with-ai-f26/kfl8095-steelman

The repository holds two things:

- **The app** (`app/`): the real product, built milestone by milestone from `plans/build-plan.md`. A React web app, a Fastify service, and Postgres, in TypeScript; sign-in by Google or an emailed code. It runs on a laptop today; hosting on Google Cloud comes with milestone M1.
- **The Product Page and prototype** (`docs/`): static pages on GitHub Pages. The prototype is the design reference for the app: every screen is designed there first. It keeps its data in one browser.

## Run the app

You need Node 22 and Docker Desktop. In `app/`:

```sh
npm install
npx playwright install chromium   # once per machine, for the browser tests
cp .env.example .env              # then fill it in; each setting is explained there
docker compose up -d db           # the local database
npm run db:migrate                # bring it up to date
npm run db:seed                   # example boards and test accounts
npm run dev
```

Open http://localhost:5173. Sign-in codes print in the terminal instead of being emailed. To skip signing in, pick a test account under "Acting as" in the top bar. The example boards are at http://localhost:5173/b/example-0001 to `example-0007`.

`npm run check` runs everything a pull request must pass: types, lint, every test, and the browser tests. It starts its own database. More commands and how the app is laid out: [`app/README.md`](app/README.md).

## Run the Product Page and prototype

Nothing to install. Open `docs/prototype/index.html` in a browser, or serve both pages:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory docs
```

Then open http://127.0.0.1:8000/ for the page, or http://127.0.0.1:8000/prototype/ for the prototype.

## Project map

| Path | Purpose |
| --- | --- |
| `app/` | The real product: `shared/` (rules both sides follow), `server/` (the service and database), `web/` (the screens), `e2e/` (browser tests). See `app/README.md` |
| `plans/` | How it's built: `architecture.md` and its decision records in `decisions/`, `build-plan.md` (milestones and backlogs), `features.csv` (every feature, its tier and status; `feature-audit.xlsx` is generated from it) |
| `docs/index.html` | The Product Page: PRD v2 and the build log |
| `docs/prototype/` | The prototype, and its editable source in `source/` |
| `docs/design/` | Design tokens, shared by the prototype and the app |
| `docs/privacy.html` | What the Product Page and prototype collect |
| `docs/reference/steelman-prd-v0.4.md` | The original long-term PRD, kept as background |
| `tests/build-1-manual.md` | The dated test log: what was checked, how, and what wasn't |
| `scripts/` | Keeping the prototype, feature audit, and canvas texture in sync |
| `journal/` | Optional build notes from the course template |
| `AGENTS.md` | Instructions for coding agents: stack, commands, and ground rules |

GitHub Pages publishes `main` → `/docs`. Pull requests run `npm run check` and a protected-files check in GitHub Actions; a nightly run adds the soak test and mutation testing.
