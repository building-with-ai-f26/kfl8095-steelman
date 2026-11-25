# Security audit

This is the Build 3 security audit of Steelman, run on November 22, 2026, in the Advanced lane. Claude Code ran the checks and the builder approved each step that touched production.

## The app

Steelman is an app with sign-in. People sign in with Google or a 6-digit code sent by email, and there are no passwords. Boards, wordings, votes, comments, and accounts are stored in Postgres. The app makes no AI calls yet and stores no files.

- **Production:** https://app.steelman-argument.com (Google Cloud project `steelman-production`), where this audit checked it. It runs the November 23 release, which includes the fixes below. Build plan M3d-12 moves production to https://steelman-argument.com when the builder runs its steps (`infra/README.md`, "Moving production to steelman-argument.com"), and app.steelman-argument.com then forwards there.
- **Staging:** https://staging.steelman-argument.com (project `steelman-staging`). It runs `main`, and a release copies its image to production unchanged.

Each check below says where it ran. The checks ran on November 22, when production still ran the November 17 release. The builder released `main` to production on November 23, and the two-account test and the fixes were then checked there.

## What was checked

| # | Check | Where | Result |
|---|---|---|---|
| 1 | Account B reads Account A's board | Local, staging, production | Refused. Details are below. |
| 2 | Secret keys in the repo and the live code | Repo, history, both sites | No keys found. |
| 3 | File storage | Google Cloud | The app stores no files. Both buckets are private. |
| 4 | Production is protected from the agent | Repo, Google Cloud | The rules are in place, with one accepted gap. |
| 5 | Spending caps and rate limits | Staging, Terraform | Limits answer 429. Budgets alert but do not stop spending. |
| 6 | Dependencies | `app/` | `npm audit` reports 0 vulnerabilities. |
| 7 | Agent security review | Code, test database | One high, one medium, and six low findings. Three are fixed. |

### 1. Access controls

The service decides who is asking from the session cookie, then checks every request against one table of roles and actions (`app/shared/src/policy.ts`). The browser never connects to the database.

- **Production, two accounts.** On November 23 the builder created an invited-only board as Account A and opened its link as Account B. The page said "You don't have access to this steelman." and the API answered `403 {"status":"refused","reason":"no_access"}`.
- **Local, two accounts.** Account A created an invited-only board. Account B asked for the board, its changes, its people, and its history, and tried to open its link and add an argument. All six requests were refused with `403 no_access`. The board did not appear in Account B's list or data download.
- **Staging and production, signed out.** Requests for the board list, the account, and the data download were refused with `401 signed_out`.
- **Every pull request.** `role-matrix.test.ts` and `roles.test.ts` run every action as each role, as a non-member, and signed out.

A new board lets in anyone who has its link, as a Contributor. That is the intended default, and the owner changes it to "Invited only" in Share.

### 2. Secret keys

The search covered `sb_secret_`, `service_role`, `sk-or-`, `sk-ant-`, `sk-proj-`, `sk_live_`, `GOCSPX-`, Resend keys, and private keys.

- The tracked files have no match.
- The git history has one match, a placeholder (`sk-or-v1-replace-with…`) in the course template's `.env.example`. It is not a key.
- The JavaScript and CSS served by both live sites have no match, and neither site serves source maps.
- Gitleaks scans the whole history on every pull request.

Secrets are in Google Secret Manager. GitHub signs in to Google Cloud without a stored key.

### 3. File storage

The app stores no user files. Google Cloud holds two buckets, one for Terraform state and one for the weekly database export. Both enforce public access prevention and have no public members.

### 4. Protecting production

- `AGENTS.md` has an "Ask me first" list that covers deleting data, production, secrets, permissions, spending, and destructive git commands.
- The agent works against local databases and staging. A release to production needs the builder's approval in GitHub's protected `production` environment.
- Production's database has daily backups kept 14 days, point-in-time recovery for 7 days, and a weekly export to a bucket in another project. A manual backup was taken before this audit (ID `1795407059434`).
- A bad release is rolled back by sending traffic to the previous Cloud Run revision. Migrations only add, so the previous version keeps working.

### 5. Spending caps and rate limits

- The app calls no paid AI API yet, so there is no AI spending cap to set. The cap is part of the milestone that adds AI.
- Every route that writes has a limit per account: 20 boards an hour, 60 writes an hour, 300 votes a minute, and 20 reports an hour.
- Sign-in emails are limited to 5 an hour per address and 30 an hour per network.
- On staging, 32 requests for a sign-in code returned five `400` answers and then `429` with a `retry-after` header. The address was invalid, so no email was sent.
- Each environment runs at most three servers on a fixed-size database. Budget alerts are set at $25 a month for production and $10 for staging. Google's budgets alert and do not stop spending.

### 6. Dependencies

`npm audit` reports 0 vulnerabilities, with and without development packages. A nightly workflow runs `npm audit --audit-level=high` and opens an issue if it fails.

### 7. Agent security review

A second Claude agent read the service, the web app, the migrations, the Terraform, and the workflows, and confirmed each finding with a test against a throwaway database. It found no way for one account to read or change another account's board.

| Severity | Finding | Status |
|---|---|---|
| High | One signed-out request with a very long value could keep a server busy for minutes. The pattern that masked emails in sign-in's log lines was slow on long text. | Fixed in [#102](https://github.com/building-with-ai-f26/kfl8095-steelman/pull/102). |
| Medium | A signed-in person could clear their username and pick a new one, and could store a name or picture of any length on their account. | Fixed in [#103](https://github.com/building-with-ai-f26/kfl8095-steelman/pull/103). |
| Low | A write to a board that does not exist, or a zero byte in a request, answered 500 with the database's error message. | Fixed in [#104](https://github.com/building-with-ai-f26/kfl8095-steelman/pull/104). |
| Low | Five more findings need the builder's decision. They cover hidden wordings' sources, board handover on account deletion, link members missing from the people list, the deletion scrub, and locking an address out of email codes. | Open in [#105](https://github.com/building-with-ai-f26/kfl8095-steelman/issues/105). |

The review also confirmed these as sound: every board route checks the policy table, an item from one board cannot be used through another board's address, reports stay anonymous, the development test-user switch is off when deployed, writes from another site are refused, sign-in codes are hashed and expire after 10 minutes and 5 tries, all SQL uses parameters, and the page never renders user text as HTML.

## What was fixed

- Sign-in's log lines are masked in one pass and cut to 300 characters, and sign-in's routes accept at most 16 KB ([#102](https://github.com/building-with-ai-f26/kfl8095-steelman/pull/102)).
- Picking a username and signing in with a code accept only the fields the app's pages send ([#103](https://github.com/building-with-ai-f26/kfl8095-steelman/pull/103)).
- Unknown boards answer 404, zero bytes answer 400, and a 500 no longer includes the database's message ([#104](https://github.com/building-with-ai-f26/kfl8095-steelman/pull/104)).
- `AGENTS.md` gained the Shipping steps, the "Ask me first" list, and a rule to check each deploy on the live site.

Each fix has new tests that failed before it. No existing test changed. After the November 23 release, production refused a 20,000-character sign-in value with `413` in 0.2 seconds, extra sign-in fields with `400`, a write to an unknown board with `404`, and a zero byte with `400`.

## Remaining issues

- **The low findings in [#105](https://github.com/building-with-ai-f26/kfl8095-steelman/issues/105) are open.**
- **Budgets alert and do not cap.** The ceilings are three servers and a fixed database size.
- **Rate-limit counts are kept per server.** With three servers a limit can be three times too generous. The sign-in email limit is exact, because it is counted in Postgres.
- **Three gaps were accepted on November 18** (`plans/reviews/deployment-trust-boundary.md`). The agent acts with the builder's own GitHub and Google logins, the protected-files check can be bypassed from inside a pull request, and repository admins can bypass the release approval. They are sized for a class project and get reviewed again before access widens.

## Checks on every pull request

| Workflow | What it runs |
|---|---|
| `check` | `npm run check`, twice: once with Postgres in Docker, and once with Docker stopped and the network cut. It covers types, lint, the rules, the database invariants, the API tests (including every role and action), the simulation, and the browser tests. |
| `container` | The container image builds. Gitleaks scans the git history for secrets. Terraform is formatted and valid. |
| `guards` | A pull request that edits an existing test, a saved screenshot, the policy table, a merged migration, a workflow, or a plan waits for the builder's approval. |

Pull requests get no preview deployment, and a merge deploys to staging instead of production. A preview would run unreviewed migrations on a shared database (`plans/architecture.md` §6). Each pull request is tested against a database it creates and throws away, and production changes only when the builder releases.

## Attack log

| # | Attack | Where | What happened |
|---|---|---|---|
| 1 | Account B reads and edits Account A's invited-only board through the API. | Local, production | All six local requests were refused with `403 no_access`. On production, Account B's read was refused the same way. |
| 2 | A request claims to be another account with the `x-steelman-test-user` header that development uses. | Staging, production | Both answered `403 test_users_off`, and `/api/test-users` answered `404`. |
| 3 | A script floods the sign-in code route with 32 requests. | Staging | The per-address limit refused the sixth request and the per-network limit refused the thirty-first, both with `429`. |
| 4 | A wording contains `<img onerror>` and `<script>`, and a source's link is `javascript:alert(document.cookie)`. | Local | Both were saved and shown as plain text. No element, link, or alert was created. |
| 5 | A request asks the static file route for `/assets/../../etc/passwd`. | Staging, production | Both answered with a redirect to the app's page or `404`. No file outside the web folder was read. |
| 6 | A request tries Better Auth's password sign-in, which Steelman does not use. | Staging, production | Both answered `404`. |
| 7 | A signed-out request starts a Google sign-in with a 40,000-character address to return to. | Test database | Before the fix, the server was busy for 4.1 seconds. After it, the request is refused with `413` at once. |
| 8 | A signed-in person sends `{"username": null}` and then a new username. | Test database | Before the fix, both answered `200` and the person was renamed. After it, both answer `400`. |
| 9 | A signed-out request writes to a board that does not exist. | Test database | Before the fix, it answered `500` with the database's message. After it, it answers `404`. |
