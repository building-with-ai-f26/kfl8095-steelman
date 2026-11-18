# The deployment trust boundary (M2-13)

Reviewed Nov 18, 2026, from the Terraform and workflows on `main` at `270d0bf` (PR 69 merged) and from what
GitHub and Google actually hold, read live the same day. Read-only throughout: nothing in GitHub or Google
was changed. This review proposes one permission reduction (in this pull request, for the builder to apply)
and puts three decisions to the builder.

**Outcome, Nov 18:** the builder applied the reduction (PR 70; production's deploy account no longer holds
Cloud SQL Editor, confirmed live), and decided to keep all three as they are for the class trial (below,
"The builder's decisions"). Re-review before access widens beyond the class.

## In short

- **Deploying is reading the secrets, one step removed.** The deploy account can't read Secret Manager, but it
  can run any image as the service or as the migrations, and those accounts can. Whatever reaches `main`
  reaches staging's secrets and staging's database (where the class trial runs) within minutes, with no
  person in between. Production is the same once the builder approves a release, and a release ships
  everything merged since the last one. This is how the design works (architecture §6), not a flaw to fix in
  IAM; the boundary that matters is what reaches `main`.
- **Production's deploy account doesn't need Cloud SQL Editor.** Its only release (Nov 17) made no Cloud SQL
  admin call, and the role lets its holder export the whole database or change its settings. The Terraform
  change here removes it from production only. Staging keeps it: each deploy starts staging's database.
- **The workflow restrictions are as intended.** Google accepts only this repository's runs on `main`;
  staging only for a push to `main` (a merge, or an admin's direct push), a schedule, or a start by hand
  (anyone with write access: today the three admins), and production only in the protected
  `production` environment, which needs the builder's approval. Pull-request runs are refused. A new check
  (`app/test/deploy-trust.test.ts`) fails if any of this is loosened in the code.
- **Two things outside the deploy account are wider than it** (decisions for the builder, below): on GitHub,
  the line between an agent and the builder is a rule agents follow, not one GitHub enforces; and the
  protected-files check runs the pull request's own copy of itself, and its result can be posted by any
  workflow a pull request adds.

## The map

```
GitHub repository building-with-ai-f26/kfl8095-steelman (public)
  │  who can change main: 3 admins (the builder, the organization's 2 owners), by merging a pull request
  │  that passes the required checks, or by pushing directly (admins aren't held to the rules)
  │
  ├─ deploy-staging.yml ── on every push to main ─────────────┐
  └─ release.yml ── started by hand on main, job waits in     │   GitHub's signed token (OIDC)
                    the "production" environment for the      │   says: repository, ref, event,
                    builder's approval ───────────────────────┤   environment
                                                              ▼
            Google: each project's Workload Identity pool "github", one provider, whose condition
            decides which tokens it accepts (below). No service-account key exists anywhere.
                                                              │
                                                              ▼
            steelman-deploy@<project>  (per project)
              run.developer           deploy the service, update and run the jobs
              artifactregistry.writer push images (its own repository only)
              serviceAccountUser      on steelman-service and steelman-migrate only
              cloudsql.editor         staging: start the database. Production: removed by this PR
              no secret access, no IAM-changing role, no key
                      │ acts as                          │ acts as
                      ▼                                  ▼
            steelman-service                     steelman-migrate
              reads: database-url,                 reads: migrate-database-url
              better-auth-secret,                  (the owner's login),
              resend-api-key,                      service-database-password
              google-client-secret
              cloudsql.client                      cloudsql.client
                      │                                  │
                      ▼                                  ▼
            Postgres as steelman_service          Postgres as steelman_owner
            (steelman_app's rights only)          (owns every table)
```

Beside it, not reachable from the deploy account: `steelman-scheduler` (Cloud SQL Editor, to stop staging's
database and to export production's), each project's default compute account (Google's default Editor role;
nothing runs as it and no one but the owner may act as it), and Terraform's state for both environments, in
`steelman-production-terraform-state` (it holds the database passwords Terraform made; readable by
production's owner, editors, and viewers).

## What deploying can reach, though it reads no secret

The deploy account can't call Secret Manager, but it chooses what code runs as the two accounts that can:

- **As the service:** `gcloud run deploy` with any image. That code receives `DATABASE_URL`,
  `BETTER_AUTH_SECRET` (which signs every session, so it could sign in as anyone), Resend's key, and
  Google's client secret as environment variables, and it is the public site.
- **As the migrations:** `gcloud run jobs update steelman-migrate --image …` then `execute`. That code signs
  in to Postgres as the owner of every table, and holds the service login's password.

So "can deploy" means "can read every runtime secret and do anything to the database" in that project. On
staging this happens on every merge to `main`, unattended, and staging is where classmates are testing
(the builder, Nov 17), so it holds their accounts and email addresses. On production it happens when the
builder approves a release, and the image released is staging's, unchanged: approving a release is
approving every commit merged since the previous one.

Nothing in IAM can narrow this without stopping deploys from working. What keeps it safe is what reaches
`main`: the required checks, the protected-files check, and the second reader (architecture §8). The
protected-files check can be got past from inside a pull request today (decision 2), and the admins,
including any agent using the builder's login, aren't held to the checks (decisions 1 and 3).

## Cloud SQL Editor on production's deploy account

**Why it was there:** staging's database is stopped every night, and the deploy workflow starts it
(`gcloud sql instances patch --activation-policy ALWAYS`), which needs `cloudsql.instances.update`. The
module gave both environments the same roles.

**What it allows** (`gcloud iam roles describe roles/cloudsql.editor`, Nov 18): among others,
`cloudsql.instances.update` (change any setting: networks, backups, point-in-time recovery, size) and
`cloudsql.instances.export` (write the whole database to a Cloud Storage bucket, which Cloud SQL's own
service agent writes; a bucket in someone else's project can grant that agent access).

**Whether production uses it:** Cloud Audit Logs' admin activity (always recorded), last 30 days, for calls
to Cloud SQL by each deploy account:

| | Calls | The runs in that time |
|---|---|---|
| `steelman-deploy@steelman-production` | none | the Nov 17 release (run 44127725111), which succeeded |
| `steelman-deploy@steelman-staging` | 24 × `cloudsql.instances.update` | the staging deploys (starting the database) |

The release workflow never names Cloud SQL: it pushes the image, updates and runs the migration job,
deploys, and moves traffic. The service and jobs keep their Cloud SQL connection from Terraform; deploying a
new image doesn't change it.

**The change** (`infra/modules/steelman/main.tf`): Cloud SQL Editor only where `stop_database_nightly` is
set, which is staging. A read-only `terraform plan` (`-lock=false`, Nov 18) of each environment with the
change:

- production: `google_project_iam_member.deploy["roles/cloudsql.editor"] will be destroyed`; `Plan: 0 to
  add, 0 to change, 1 to destroy` (it also notes the domain mapping's status changed outside Terraform,
  which is a refresh, not an action);
- staging: `No changes.`

**Not verified:** reads of instance metadata (`cloudsql.instances.get`) aren't in the admin activity log, so
the logs can't show whether a release reads the instance. If the next release fails for want of
`cloudsql.instances.get`, it fails before traffic moves (at the job update or the deploy; migrations are
compatible with the running version by rule 7), and the fix is Cloud SQL Viewer (`roles/cloudsql.viewer`),
which can read settings but not change or export them.

**Staging keeps Cloud SQL Editor**, since it must start the database. A custom role with only
`cloudsql.instances.get` and `cloudsql.instances.update` would remove export, but `update` alone can still
change every setting, so the gain is small; not proposed.

## The restrictions, as configured and as live

All read Nov 18 with the builder's GitHub and Google logins (read-only calls).

**Google: which GitHub tokens each project accepts.** Live provider conditions, identical to the Terraform:

| | Condition |
|---|---|
| staging | `assertion.repository == 'building-with-ai-f26/kfl8095-steelman' && assertion.ref == 'refs/heads/main' && assertion.event_name in ['push', 'schedule', 'workflow_dispatch']` |
| production | `assertion.repository == 'building-with-ai-f26/kfl8095-steelman' && assertion.environment == 'production' && assertion.ref == 'refs/heads/main'` |

- Each pool has one provider, active, issuer `https://token.actions.githubusercontent.com`. Each deploy
  account lets only that pool's identities from this repository act as it (`roles/iam.workloadIdentityUser`
  on `principalSet://…/attribute.repository/building-with-ai-f26/kfl8095-steelman`).
- **Pull-request runs are refused.** A `pull_request` run's ref is `refs/pull/<n>/merge` and its event is
  `pull_request`: both conditions refuse it. A `pull_request_target` or `workflow_run` run carries
  `refs/heads/main` but its event isn't on staging's list; on production it would need a job in the
  `production` environment, which waits for the builder.
- Only `deploy-staging.yml` and `release.yml` ask GitHub for a token (`id-token: write`); the repository's
  default token is read-only, and the other workflows only read (and `guards.yml` sets statuses, `nightly.yml`
  opens issues).
- No service account in either project has a key, and neither the repository nor the environment holds a
  secret: nothing long-lived to steal.

**GitHub: the `production` environment** (`gh api repos/…/environments`):

| Setting | Live value | What it means |
|---|---|---|
| Required reviewers | the builder (Kieran-LaMee) | a release waits for the builder's approval |
| Deployment branches | protected branches only | only `main` can deploy (and the job checks `github.ref` too) |
| Prevent self-review | off | the builder can approve a release they started, which is how releases work today |
| Allow administrators to bypass | **on** | any repository admin can release without the approval (below) |

**GitHub: `main`** (`gh api repos/…/branches/main/protection`): requires `npm run check (docker)`,
`npm run check (embedded-offline)`, and `builder approval`; no approving reviews required; **admins are not
held to it** (`enforce_admins` off); no force pushes or deletions. No rulesets.

**GitHub: who has access:** 3 admins (the builder, and the organization's 2 owners, clg236 and mmcclane1,
who are admins through the organization), 58 with read. Pull requests from forks of this public repository
need approval to run for first-time contributors, get a read-only token, and are refused by Google
regardless.

**Not on the deploy path, checked in passing:** the image can't contain the Google credential the auth step
writes into the workspace (`app/Dockerfile` copies only `app/` and two folders of `docs/`); production's
weekly export goes to a bucket in the staging project, which staging's owner, editors, and viewers can read
(empty today: the first export runs Sunday).

## For the builder to decide

None of these is in this pull request's diff: each is a workflow change, a GitHub setting, or a change to how
agent sessions are signed in, which stay with the builder (M2-13's row).

### The builder's decisions (Nov 18)

All three stay as they are for the class trial, accepted knowingly:

1. **Agents keep acting as the builder on GitHub and Google.** The builder trusts their agent sessions, and
   taking the access away would make deploying harder and more error-prone for one person. To be changed
   as the project scales and needs more security.
2. **The protected-files check stays as it is.** This is a class project, not yet enterprise software; open
   to the fix, and to be reviewed again as it scales.
3. **Admins keep their bypass** of the release approval and of `main`'s rules.

**When to review again:** before access widens beyond the class trial (the security follow-up approved
Nov 17), and before the public-communities phase. The proposals below stand ready for then.

### 1. Agents act on GitHub and Google as the builder

Local agent sessions use the builder's GitHub login (a token with `repo` and `workflow`, admin on the
repository) and the builder's Google login (owner of both projects, plus the application-default
credentials Terraform uses). This review used both, read-only. With them, an agent session could, in
principle: add `builder-approved` itself, push to `main` past every check (admins aren't held to the
rules), start a release and approve it (self-review is allowed), or change production directly in Google.
AGENTS.md forbids all of it, and nothing suggests it has happened, but it's a rule agents follow, not a wall.
This path is wider than the deploy account.

Options, cheapest first:

- **Google:** sign Google out of the machine except while applying Terraform, and sign in again for each
  apply (README step 1). To sign out:

  ```bash
  gcloud auth revoke --all
  ```
  ```bash
  gcloud auth application-default revoke
  ```

- **GitHub:** give agent sessions an identity of their own, not the builder's. Two levels:
  - *A token without Workflows permission* (a fine-grained personal access token for this one repository:
    Contents, Pull requests, and Issues read and write, and nothing else). Without Workflows, a push that
    adds or changes a file in `.github/workflows/` is refused, which closes the status-forging path in
    decision 2. It still acts as the builder, so it can add `builder-approved`; whether GitHub lets an
    admin's fine-grained token push past the branch rules without Administration permission is *not
    verified*. The organization may need to approve fine-grained tokens.
  - *A separate GitHub account for agents* (a "machine user", with Write access, or a GitHub App) with
    such a token. It isn't an admin, so it can't skip the rules or bypass the release approval, and it
    isn't the release's reviewer. It can still add labels, so the guard would also check that
    `builder-approved` was added by the builder (the label event's sender). This needs an account, so it
    is the builder's to open.

### 2. The protected-files check can be got past from inside a pull request

Since a merge deploys to staging, this check is part of the deploy boundary. Two ways round it, today:

- **It runs the pull request's own copy.** `guards.yml` runs on `pull_request`, and for that event GitHub
  runs the workflow, and the script it calls, as the pull request has them. So a pull request that edits
  `.github/workflows/guards.yml` or `app/scripts/guards/` is judged by its edited version, which could
  report "No protected files changed." `app/scripts/guards/` and `infra/` aren't on the protected list.
- **Its answer can be forged.** `main` requires a status named "builder approval" from GitHub Actions
  (`app_id` 15368), and any workflow's token with `statuses: write` posts as GitHub Actions. A pull request
  from a branch of this repository could add a workflow of its own that posts "builder approval: success"
  on its head commit after the real check posts "pending"; the latest status wins. The real check would
  list the new workflow, but can't stop the override. (Pull requests from forks get a read-only token, so
  this needs push access to the repository: the builder, the admins, or an agent using the builder's
  login.)

The second is closed only by who can push workflow files: an agent token without Workflows permission
(decision 1), or an organization ruleset that requires `main`'s copy of `guards.yml` to pass ("require
workflows to pass before merging"), which the organization's owners would set. Moving the check to
`pull_request_target` closes the first. Proposed as a follow-up pull request, with tests, once the builder
agrees: run `main`'s copy, fetch the exact commit the status is posted on (not the branch, which may have
moved), compare without running anything from it, and add `app/scripts/guards/` and `infra/` to the
protected list. The workflow change:

```diff
 on:
-  pull_request:
+  # main's copy of this check judges every pull request, so a pull request can't edit the check that judges
+  # it. Nothing from the pull request is run, only compared, so this event's write token is safe here.
+  pull_request_target:
     types: [opened, synchronize, reopened, labeled, unlabeled]
@@
       - uses: actions/checkout@v7
         with:
           fetch-depth: 0
+          persist-credentials: false
+      - name: Fetch the pull request's commit, to compare, never to run
+        env:
+          SHA: ${{ github.event.pull_request.head.sha }}
+          NUMBER: ${{ github.event.pull_request.number }}
+        run: git fetch --no-tags origin "+refs/pull/$NUMBER/head" && git cat-file -e "$SHA^{commit}"
@@
-          node scripts/guards/protected-files-cli.ts "origin/$BASE"
+          node scripts/guards/protected-files-cli.ts "origin/$BASE" "$SHA"
```

with `protected-files-cli.ts` taking the commit to compare (today it compares `HEAD`). If the branch has
moved on, the fetched ref still contains `$SHA`, and a newer push starts its own run. One step needs the
builder by hand: the pull request that makes this switch gets no "builder approval" status at all (`main`'s
copy has no `pull_request_target` trigger yet, and the pull request's copy no longer has `pull_request`), so
it merges only with the builder posting the status or bypassing the rule once.

### 3. Administrators can skip the release approval and the checks

The organization's two owners are repository admins. With "Allow administrators to bypass" on, any admin
can release to production without the builder's approval; with `enforce_admins` off, any admin can push to
`main` without the checks, which deploys to staging. If that isn't intended: in the repository's Settings,
Environments, `production`, untick "Allow administrators to bypass configured protection rules"; and in
Settings, Branches, the rule for `main`, tick "Do not allow bypassing the above settings". The second also
holds the builder to the checks (a stuck pull request then needs the label, not a direct push).

**Optional, not proposed:** Google's guidance also suggests matching the repository by its numeric ID
(`assertion.repository_id == '1447667140'`) rather than its name, so a deleted and re-created repository of
the same name couldn't qualify, and naming which workflow may deploy (`assertion.job_workflow_ref`). Only
the organization's owners could re-create the repository, and a workflow change already needs the
builder, so the gain is small for the class trial. Likewise staging's condition admits `schedule`, which no
workflow that asks for a token uses (`nightly.yml` doesn't ask); dropping it would be a free reduction, of
little value, since a scheduled run uses only `main`'s files anyway.

## After merging (the builder)

Apply production's change (README step 5, production), reading the plan first. It should say 1 to destroy,
the deploy account's Cloud SQL Editor, and nothing else:

```bash
terraform -chdir=infra/production plan -out=plan.tfplan
```
```bash
terraform -chdir=infra/production apply plan.tfplan
```

Then confirm only the scheduler holds Cloud SQL Editor in production:

```bash
gcloud projects get-iam-policy steelman-production --flatten=bindings --filter=bindings.role:roles/cloudsql.editor --format='value(bindings.members)'
```

Staging needs no apply (its plan shows no changes). Staging's deploy and migrations ran successfully on
the current configuration on Nov 18 (run 44368472988, PR 69's merge: migrations, smoke test, traffic), and
this pull request's own merge will deploy again with it.

**Done Nov 18.** The builder's plan showed `0 to add, 0 to change, 1 to destroy`, that grant only; the
apply removed it, and the check above lists only `steelman-scheduler`. PR 70's merge then deployed to
staging (run 44396368827): migrations, smoke test, and traffic all passed. A release without the role is
still to come.

## Not verified live

- That Google refuses an actual pull-request run: shown by the conditions and the event and ref GitHub
  documents for each event, not by trying one (that would take a workflow change).
- That a release works without Cloud SQL Editor: needs the apply and then a release, both the builder's
  (above, with the fallback if it doesn't).
- Organization-level settings (organization rulesets, Actions policies, who may approve fine-grained
  tokens): not read; the repository's own settings were.
- Reads of Cloud SQL settings by the deploy accounts: not in the always-on audit logs (only changes are).
- Who may act in the two Google projects: read from each project's own policy (one owner each). Neither
  project has a parent organization or folder (`gcloud projects describe`), so no grant is inherited from
  above; billing-account roles weren't read.
