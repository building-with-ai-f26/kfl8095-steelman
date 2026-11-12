# The Steelman app

The real product, built milestone by milestone (`../plans/build-plan.md`). The design is in `../plans/architecture.md`.

## Commands

Run these in `app/`. You need Node 22.

| Command | What it does |
|---|---|
| `npm install` | Installs everything, including the Postgres the tests use when Docker isn't running |
| `npm run check` | Everything a pull request must pass: types, lint, and every test. Needs no network, no accounts, and no Docker |
| `npm run dev` | Runs the service (port 3000) and the web app (http://localhost:5173) |
| `docker compose up -d db` | Starts the local development database. Tests don't use it; they start their own |

## The three parts

The split is by what a part is allowed to touch (architecture §4). Lint rules enforce it, and `test/boundaries.test.ts` proves the rules are on.

| Part | Holds | May touch |
|---|---|---|
| `shared/` | The rules both sides follow | Nothing: pure functions only |
| `server/` | The service: routes, the write path, SQL | The database and outside services |
| `web/` | The screens | The API only |

## Time and IDs are handed in

Nothing reads the system's clock or makes random numbers except `server/src/system.ts`. The service is handed a `Clock` and an `IdSource` when it starts (`server/src/app.ts`). Tests hand in a clock they can move and IDs that repeat from a seed (`@steelman/shared/testing`), so a test of "an hour later" takes milliseconds.

## The test database

The server's tests run against a real Postgres 17, started once per run by `server/test/support/`: in Docker when Docker is running, otherwise from the `embedded-postgres` package that `npm install` already put in `node_modules`. Each test file calls `useTestDatabase()` and gets its own empty database.

Set `TEST_DATABASE=docker` or `TEST_DATABASE=embedded` to choose one yourself.
