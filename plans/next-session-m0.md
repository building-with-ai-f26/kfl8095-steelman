# Next session: build M0, starting with M0-1

Paste the prompt below into a new Claude Code session in this repository.

---

Act as the engineer building Steelman's first working code. Your job is to work the **M0 backlog** in `plans/build-plan.md`, in order, starting with the first item that isn't marked done (M0-1 if none is). M0 is the Build 2 hand-in, due **Monday, Nov 16, 2026**. I'm not available to watch: work on your own, and stop only where the rules below say to.

## Read first

- `AGENTS.md`: the ground rules. Rules 1, 4, 9, 10, and 11 govern how you work here.
- `plans/build-plan.md`: the M0 backlog table. Each row is one pull request, with what to build and its acceptance tests.
- `plans/architecture.md`: §2 (data model and invariants), §3 (live updates), §4 ("How the code is organized"), and §8 (testing and unattended work). The decision records are in `plans/decisions/`.
- `tests/build-1-manual.md`, the November 11 entries *Live changes* and *Live changes, structure*: the scenarios the browser tests must reproduce.

If those plan files aren't on `main`, the pull request from branch `architecture` hasn't merged yet. Base your first branch on `architecture` and say so in your pull request.

## How to work each item

1. Take the first backlog item that isn't done. Build only that item.
2. Write its acceptance tests first, run them, and see them fail. Name each test with the feature IDs it covers.
3. Build until `npm run check` passes in `app/`. Run it often.
4. Open one pull request for the item, using the repository's template, including what you couldn't check. Mark the item done in `plans/build-plan.md` in the same pull request.
5. **Don't merge it.** Through M0 I merge. Start the next item on a branch that builds on the one you just finished, and say in each pull request which one it sits on.

Keep going down the backlog until it's finished or you reach a stop.

## What M0-1 has to deliver

Everything after it depends on this item, so get it exactly right:

- `app/` as one npm workspace with three parts, `shared/`, `server/`, and `web/`, in strict TypeScript on Node 22. Fastify in `server/`, React with Vite in `web/`; for now only a placeholder page and a health route.
- `npm run check` in `app/` runs types, lint, and every test.
- A test database that starts itself: a real Postgres 17, through Docker when Docker is running and through the `embedded-postgres` package when it isn't. Each test file gets its own empty database.
- The clock and the ID generator as inputs the server is given, never read from the system: a real version of each, and a test version (a clock the tests can move; seeded IDs).
- `app/.env.example` with names only, a `docker compose` file holding only the local database, and `npm run dev`.
- A GitHub Actions workflow that runs `npm run check` on every pull request.

It's done when, on a clean clone, `npm install` then `npm run check` passes with Docker stopped and, after the install, with no network; the same command is green in GitHub Actions; and a test that moves the test clock forward an hour finishes in milliseconds.

## Stop and ask me

Leave a clear note on the pull request, then move to another item if one isn't blocked. Stop when:

- a fix has failed twice in a row;
- an item can't be built without departing from `plans/architecture.md` or a decision record;
- you'd need a run-time package the architecture doesn't name;
- you'd need to edit, skip, or delete an existing test to make something pass;
- anything would cost money, need an account, or leave this repository.

## House rules

- No cloud resources, no accounts, no real email, no secrets in files. M0 runs entirely on a laptop.
- The prototype in `docs/` stays as it is. Reuse its markup, CSS classes, and `docs/design/tokens.css` for the board screen (M0-6); don't redesign.
- No sign-in in M0. A local-only "pick a test user" switch stands in, and it must refuse to run in production mode.
- Small pull requests I can read in one sitting. If an item is growing past that, split it and say why.
- Report honestly: if a check fails or something wasn't verified, say so in the pull request.

Start with step 1.
