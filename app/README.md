# The Steelman app

The real product, built milestone by milestone (`../plans/build-plan.md`). The design is in `../plans/architecture.md`.

## Commands

Run these in `app/`. You need Node 22.

| Command | What it does |
|---|---|
| `npm install` | Installs everything, including the Postgres the tests use when Docker isn't running |
| `npx playwright install chromium` | Once per machine: downloads the browser the browser tests drive (npm can't install it) |
| `npm run check` | Everything a pull request must pass: types, lint, every test, and the browser tests. After the two installs above, needs no network, no accounts, and no Docker |
| `npm run test:browser` | Only the browser tests (`e2e/`) |
| `npm run test:soak` | The nightly soak run: 30 voters for 5 minutes against a running service, then a recount (`server/test/soak/`). `SOAK_VOTERS`, `SOAK_SECONDS`, `SOAK_SEED` change it |
| `npm run test:mutation` | The nightly mutation run (Stryker): small deliberate breaks in `shared/src/` and the write path, each run against the tests. Prints the score and every break no test noticed; the full report is in `reports/mutation/`. `npx tsx scripts/mutation/survivors-cli.ts` summarizes it. It starts one Postgres for the whole run (`scripts/mutation/run.ts`). About 10 minutes |
| `npm run dev` | Runs the service (port 3000) and the web app (http://localhost:5173) |
| `docker compose up -d db` | Starts the local development database. Tests don't use it; they start their own |
| `npm run db:migrate`, then `npm run db:seed` | Brings the development database up to date, then adds the demo board at http://localhost:5173/b/demo-board-1 |

## The three parts

The split is by what a part is allowed to touch (architecture §4). Lint rules enforce it, and `test/boundaries.test.ts` proves the rules are on.

| Part | Holds | May touch |
|---|---|---|
| `shared/` | The rules both sides follow | Nothing: pure functions only |
| `server/` | The service: routes, the write path, SQL | The database and outside services |
| `web/` | The screens | The API only |

## Time and IDs are handed in

Nothing reads the system's clock or makes random numbers except `server/src/system.ts` (and `web/src/system.ts`, for the IDs the browser gives what it writes). The service is handed a `Clock` and an `IdSource` when it starts (`server/src/app.ts`). Tests hand in a clock they can move and IDs that repeat from a seed (`@steelman/shared/testing`), so a test of "an hour later" takes milliseconds.

## The test database

The server's tests run against a real Postgres 17, started once per run by `server/test/support/`: in Docker when Docker is running, otherwise from the `embedded-postgres` package that `npm install` already put in `node_modules`. Each test file calls `useTestDatabase()` and gets its own empty database.

Set `TEST_DATABASE=docker` or `TEST_DATABASE=embedded` to choose one yourself.

## The browser tests

`e2e/` drives the board screen in Chromium with Playwright. Each test gets its own copy of a migrated database with the demo board in it, and the real service on its own port, serving both the API and the built web app (`e2e/support/board.ts`). The service's clock is fake, so a test moves it to bring the next shared order due; the page's clock is Playwright's, so a test moves it to bring the next poll due. A second person acts in a second browser, or through the API.

Saved screenshots are in `e2e/screenshots/`, one set per system (fonts render differently on each). A run never replaces one. To add the set for a new system on purpose: `npx playwright test --update-snapshots=missing`. In CI a missing one is written and kept with the run's results, to review and commit.

## Signing in

`server/src/sign-in.ts` signs people in through Better Auth, with a 6-digit code sent by email or with Google, and a username they pick once. Under `npm run dev` the code is printed in the terminal, not sent; set `BETTER_AUTH_SECRET` in `.env` to keep sessions across restarts (see `.env.example`). Google sign-in is on when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set; locally, use the staging OAuth client. A board asks a signed-out person to sign in first (`web/src/signIn/`: Sign in, Check your email, Choose a username, as designed in the prototype). The test-user switch in the header still lets a tab act as a test account instead, in development and tests only. A deployed service runs without sign-in until it can send email (M1-14), so until then its sign-in screens can't sign anyone in.

Google is reached through standard OpenID Connect: the service reads Google's discovery document for its addresses and keys. The tests point the same code at a stand-in that runs inside them (`server/test/support/fake-google.ts`), so no test calls Google. A Google account and an email-code account with the same verified email are one account; Steelman keeps who the person is at Google, but not their Google name, picture, or tokens.

Better Auth reads the system clock itself, so the sign-in tests (`server/test/support/sign-in.ts`) move Vitest's fake system time along with the test clock. It also turns off its own origin check when `NODE_ENV` is `test`; `sign-in.ts` turns it back on, so the tests run what's deployed.

## Who can open a board

Each board is open only to the people on it, or also to anyone with its link (`server/src/access.ts`). A person's role is their row in `board_member`: Owner, Contributor, or Voter. Failing that, on a board open to anyone with the link, someone signed in with a confirmed email gets the link's role, and the first time they open the board they're recorded as a member who came by the link. People who came by the link follow it: a new link role becomes theirs, and turning the link off removes them. The policy table in `shared/src/policy.ts` says the least role for each action, and `can()` is asked before every read and write. The owner changes access from the pill under the question (`web/src/board/Sharing.tsx`).

The demo board is open to anyone with the link, as Contributor; `maya.chen` owns it, and the other test accounts are invited Contributors. A demo board made before migration 0008 is open only to its owner after `npm run db:migrate`: act as `maya.chen` and choose "Anyone with the link" under the question, or empty the database and run `npm run db:seed` again.

## The board screen

`web/` reuses the prototype's look as it is: `import "virtual:prototype.css"` (`web/vite.config.ts`) is the stylesheet of `../docs/prototype/source/steelman-refined.html`, with `../docs/design/tokens.css` put in. The few additions are in `web/src/app.css`. What's on screen is decided by the shared rules (`openView`, `receive`, `pressUpdate`, `pillCount`, `enqueue`); `web/src/board/session.ts` only runs them at the right moments: on opening, every 3 s, after each write, and on Update.

## The guards

Two checks keep the tests honest (architecture §8, "Tests an agent can't quietly weaken"):

- **Protected files** (`scripts/guards/protected-files.ts`, run on every pull request by `.github/workflows/guards.yml`). It fails when a pull request edits, moves, deletes, or skips an existing test, replaces a saved screenshot, or changes the policy table, a merged migration, a CI workflow, or a plan. Marking a backlog item done and keeping `plans/features.csv` current don't count. The builder reads the list and adds the `builder-approved` label to let it pass; agents never add it. To see the list locally: `node scripts/guards/protected-files-cli.ts origin/main`.
- **Every feature points at its tests** (`scripts/guards/feature-tests.ts`, run by `test/feature-tests.test.ts` in `npm run check`). Every feature of a milestone that has started, as the build plan's overview lists them, needs at least one test whose name carries its ID.

The soak run (`npm run test:soak`), a dependency audit, and the mutation run (`npm run test:mutation`) run every night (`.github/workflows/nightly.yml`); a failure opens an issue, and so does a break the tests missed. A `// Stryker disable` comment, or a change to what `stryker.config.json` mutates, is a protected change, like skipping a test.
