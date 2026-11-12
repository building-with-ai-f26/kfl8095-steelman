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

## The board screen

`web/` reuses the prototype's look as it is: `import "virtual:prototype.css"` (`web/vite.config.ts`) is the stylesheet of `../docs/prototype/source/steelman-refined.html`, with `../docs/design/tokens.css` put in. The few additions are in `web/src/app.css`. What's on screen is decided by the shared rules (`openView`, `receive`, `pressUpdate`, `pillCount`, `enqueue`); `web/src/board/session.ts` only runs them at the right moments: on opening, every 3 s, after each write, and on Update.
