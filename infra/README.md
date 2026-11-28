# infra/: Steelman on Google Cloud

Terraform for the two environments (plans/architecture.md §5 and §6; M1-14b):

| | Staging | Production |
|---|---|---|
| Folder | `staging/` | `production/` |
| GCP project | `steelman-staging` | `steelman-production` |
| Address | https://staging.steelman-argument.com | https://steelman-argument.com (until the builder makes the move below, production is still served at https://app.steelman-argument.com) |
| Budget alerts at | $10 a month | $25 a month |
| Database | stopped every night, started by each deploy | always on; a weekly export to a bucket in `steelman-staging`, kept 8 weeks |

Both use `modules/steelman/`, which reads top to bottom: the APIs, the database, the secrets, the service
accounts and GitHub's way in, the Cloud Run service and its three jobs, the schedules, and the monitoring.

**What applying it costs:** about $15–20 a month in all (plans/build-plan.md, M1): the production database
about $9–10, Cloud Run $0–5, staging's database about $2 while stopped. Budget alerts don't stop spending.
The ceilings are Cloud Run's 3 instances and the database disk, which grows on its own up to 20 GB and stops there.

**What it doesn't do:** put Steelman's own image in. The service and its jobs start on Google's sample
container; the deploy workflow (M1-14c) builds the image from `app/Dockerfile`, runs the migration job, and
deploys. Until then the address shows Google's sample page.

## Secrets

| Secret | Who makes it |
|---|---|
| `database-url`, `migrate-database-url`, `service-database-password`, `better-auth-secret` | Terraform, at random. Their values are in Terraform's state, in the private, versioned bucket below |
| `resend-api-key`, `google-client-secret` | The builder (step 6). Terraform gives them a placeholder only, so their values never pass through Terraform or a file |

The service reads only its own secrets; the migration job only the database owner's login and the service
login's password; the deploy account none.

## The database's logins

- `steelman_owner` owns the tables. Only the migration job signs in as it.
- `steelman_service` is the service's own login, made by the migration job
  (`app/server/src/db/service-login.ts`): it has `steelman_app`'s rights and nothing more, so the database
  itself enforces the invariants (no content row removed, the change log only grows). It may switch to
  `steelman_account_deletion`, which only account deletion does.

## Applying it (the builder, once per environment)

**Before you start:** the Google login you apply with must be a verified owner of `steelman-argument.com` in
Search Console (done Nov 14), or creating the address fails, and an administrator of the billing account,
for the budget. To check the first, `steelman-argument.com` should be in:

```bash
gcloud domains list-user-verified
```

From the repository's root. Staging first; then the same for production, with `production` and
`steelman-production` in place of `staging` and `steelman-staging`.

1. Sign in, if you haven't (each opens the browser):

   ```bash
   gcloud auth login
   ```
   ```bash
   gcloud auth application-default login
   ```

2. Once, for both: the bucket for Terraform's state, private and versioned:

   ```bash
   gcloud storage buckets create gs://steelman-production-terraform-state --project=steelman-production --location=us-central1 --uniform-bucket-level-access --public-access-prevention
   ```
   ```bash
   gcloud storage buckets update gs://steelman-production-terraform-state --versioning
   ```

3. Switch on the three APIs Terraform needs before it can switch on the rest:

   ```bash
   gcloud services enable serviceusage.googleapis.com cloudresourcemanager.googleapis.com billingbudgets.googleapis.com --project=steelman-staging
   ```

4. Your settings, in a file that's never committed. Find the billing account's ID with
   `gcloud billing accounts list`, then put it and the email for alerts in place of the two `PASTE` values:

   ```bash
   printf 'billing_account = "PASTE-BILLING-ACCOUNT-ID"\nalert_email     = "PASTE-EMAIL"\nposthog_key     = ""\n' > infra/staging/terraform.tfvars
   ```

5. Plan, read what it will create, then apply. This starts the monthly cost. The database takes about ten
   minutes to create. If the apply stops with "Permission denied on secret", the permissions it just granted
   hadn't reached Cloud Run yet: run the apply again (plan, then apply).

   ```bash
   terraform -chdir=infra/staging init
   ```
   ```bash
   terraform -chdir=infra/staging plan -out=plan.tfplan
   ```
   ```bash
   terraform -chdir=infra/staging apply plan.tfplan
   ```

6. Add the two secrets Terraform doesn't make. For each, copy the value first (it stays on the clipboard, not in
   your shell's history), then run the command, which hands it to Secret Manager without the newline a paste
   would add. Resend's API key (Resend's dashboard, a sending key for `send.steelman-argument.com`):

   ```bash
   pbpaste | tr -d '\r\n' | gcloud secrets versions add resend-api-key --project=steelman-staging --data-file=-
   ```

   This environment's Google OAuth client secret (Google Cloud console, APIs & Services, Credentials, the
   client whose ID is in plans/build-plan.md):

   ```bash
   pbpaste | tr -d '\r\n' | gcloud secrets versions add google-client-secret --project=steelman-staging --data-file=-
   ```

7. The address. Print the DNS records Google asks for:

   ```bash
   terraform -chdir=infra/staging output dns_records
   ```

   In Cloudflare, add each for `steelman-argument.com` (for staging, a `CNAME` named `staging` pointing to
   `ghs.googlehosted.com.`), with the proxy **off** (DNS only, the grey cloud), so Google can issue the
   certificate. It can take up to an hour or so to be issued.

   Production is at the bare address, `steelman-argument.com`, and a bare address can't have a `CNAME`. For
   it, Google gives `A` and `AAAA` records instead. Add each of them with the name `@`, also DNS only.

8. For M1-14c's workflows, note these two values (not secret):

   ```bash
   terraform -chdir=infra/staging output workload_identity_provider
   ```
   ```bash
   terraform -chdir=infra/staging output deploy_service_account
   ```

## Changing it later

Edit the module or a folder's `main.tf` in a pull request; after it merges, the builder runs step 5's plan
and apply again. Staging's database is stopped every night, and Terraform can't read a stopped database's
logins, so start it first:

```bash
gcloud sql instances patch steelman-staging --project=steelman-staging --activation-policy=ALWAYS
```

 Terraform leaves alone what other things change: the image (each deploy), and staging's
database being stopped or started.

## Taking something down

The `steelman-operator` job (M3d-36, `app/server/src/jobs/operator.ts`) suspends an account or makes a public
space private. It runs as the service, on the service's image, and nothing schedules it: the builder runs it
by hand. Each command prints one sentence and changes nothing when it runs twice. A username or space ID
that matches nothing prints a sentence and fails the run.

- `suspend <username>` signs the person out everywhere and stops them signing back in. Their sessions end,
  and a code or Google sign-in shows "This account is suspended." The code is still emailed when they ask
  for one, so asking reveals nothing. What they wrote stays, and Editors hide it with the tools they
  already have.
- `unsuspend <username>` lets them sign in again.
- `make-private <space ID>` makes a public space private. Its members stay, and its change log credits the
  change to the `steelman` stand-in.

Why a job and not SQL by hand: finding F8 of `plans/reviews/public-spaces-security-review.md` says deleting
someone's sessions alone lets them sign straight back in. Suspension has to be a mark on the account that
sign-in checks, so it goes through the job. Running SQL by hand against staging or production is on the Ask
me first list anyway.

The job starts on the placeholder image, as the daily job does, and gets Steelman's image from the next
deploy (staging) or release (production). Check which image it has before the first run:

```bash
gcloud run jobs describe steelman-operator --project steelman-staging --region us-central1 --format='value(template.template.containers[0].image)'
```

Staging's database is stopped every night, so start it first:

```bash
gcloud sql instances patch steelman-staging --project=steelman-staging --activation-policy=ALWAYS
```

Then, on staging:

```bash
gcloud run jobs execute steelman-operator --project steelman-staging --region us-central1 --args=suspend,lin_zhao --wait
```
```bash
gcloud run jobs execute steelman-operator --project steelman-staging --region us-central1 --args=unsuspend,lin_zhao --wait
```
```bash
gcloud run jobs execute steelman-operator --project steelman-staging --region us-central1 --args=make-private,SPACE_ID --wait
```

The sentence the job printed is in its log:

```bash
gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="steelman-operator"' --project steelman-staging --limit 5 --format='value(textPayload)'
```

On production, only the builder runs it, with `--project steelman-production` in place of
`--project steelman-staging`, for example:

```bash
gcloud run jobs execute steelman-operator --project steelman-production --region us-central1 --args=suspend,lin_zhao --wait
```

## Moving production to steelman-argument.com

Build plan M3d-12 moves production from `app.steelman-argument.com` to the bare address,
`steelman-argument.com` (plans/architecture.md Q13). Merging its pull request applies nothing, because CI
only checks the Terraform's format and validity. The builder runs these steps, in this order, whenever it is
convenient. This is the simple path: the bare address may be down for minutes to about an hour while Google
issues its certificate, which is acceptable while the builder is probably the only person who has used
production.

1. Check that the Google account you use for Terraform has verified `steelman-argument.com`, since Cloud Run
   maps only a domain you have verified:

   ```bash
   gcloud domains list-user-verified
   ```

   The list should include `steelman-argument.com`. If it doesn't, verify it first, which opens Google Search
   Console:

   ```bash
   gcloud domains verify steelman-argument.com
   ```

2. In the Google Cloud console for `steelman-production`, open APIs & Services, then Credentials, then the
   production OAuth client (its ID is in `production/main.tf`). Under Authorized redirect URIs, add this one
   and save. Keep `https://app.steelman-argument.com/api/auth/callback/google` for now, because step 10
   removes it once the move is checked.

   ```text
   https://steelman-argument.com/api/auth/callback/google
   ```

3. Prepare Terraform for production:

   ```bash
   terraform -chdir=infra/production init
   ```

4. Make the plan and read it before applying it:

   ```bash
   terraform -chdir=infra/production plan -out=plan.tfplan
   ```

   The expected plan below is read from the code, not from a run. It should say
   `Plan: 2 to add, 2 to change, 2 to destroy.`, with these changes and no others:

   - `module.steelman.google_cloud_run_domain_mapping.app` must be replaced, because its `name` changes from
     `app.steelman-argument.com` to `steelman-argument.com`.
   - `module.steelman.google_monitoring_uptime_check_config.health` must be replaced, because the `host` in
     its `monitored_resource` changes to `steelman-argument.com`. That this forces a replacement, rather than
     an update in place, comes from memory of the Google provider and wasn't checked.
   - `module.steelman.google_cloud_run_v2_service.app` is updated in place, because the `APP_ORIGIN`
     variable in its template changes to `https://steelman-argument.com`. Cloud Run then makes a new revision
     on the image already running, since Terraform leaves the image alone. Traffic was last set with
     `--to-latest`, so the new revision should take the traffic, but that is inferred and wasn't checked.
   - `module.steelman.google_monitoring_alert_policy.down` is updated in place, because its filter names the
     new uptime check.
   - Under Changes to Outputs, `dns_records` is known after apply.

   If the plan shows anything else, such as another variable on the service, don't apply it. Stop and bring
   the plan to a pull request or an issue.

5. Apply the plan:

   ```bash
   terraform -chdir=infra/production apply plan.tfplan
   ```

   The apply may stop with a 409 on the service. On November 23, `terraform apply` failed that way, because
   Terraform sends the revision name the last deploy gave the service and Cloud Run refuses a name that
   already exists (tests/build-1-manual.md, "PostHog on the live app"). If it stops this way, the old address
   may already be unmapped while the new one isn't mapped yet, so production is down at both addresses until
   you finish. The agent proposes this way through, the same as on November 23, and it hasn't been run.
   First, set the variable with gcloud:

   ```bash
   gcloud run services update steelman --project steelman-production --region us-central1 --update-env-vars APP_ORIGIN=https://steelman-argument.com
   ```

   Then make the plan again. It should now leave the service alone and only add what the first apply didn't
   finish, such as the domain mapping:

   ```bash
   terraform -chdir=infra/production plan -out=plan.tfplan
   ```

   ```bash
   terraform -chdir=infra/production apply plan.tfplan
   ```

   The apply may also stop at the uptime check. Terraform deletes the old check before it makes the new one,
   and the alert policy still names the old check until the apply updates it. Cloud Monitoring may refuse to
   delete a check that an alert policy uses, which comes from memory and wasn't checked. If the apply stops
   because the old uptime check is still in use by the alert policy, stop and bring the output to an issue.
   Don't change the module during the run. A lasting fix, such as `create_before_destroy` on the uptime check,
   is outside this step and goes in its own pull request.

6. Print the DNS records Google asks for:

   ```bash
   terraform -chdir=infra/production output dns_records
   ```

   In Cloudflare, for `steelman-argument.com`, add each `A` and `AAAA` record with the name `@` and the proxy
   **off** (DNS only, the grey cloud), so Google can issue the certificate. If Cloudflare already has an `A`,
   `AAAA`, or `CNAME` record named `@`, check what it serves before you replace it.

7. Check the certificate. Run this until its conditions say `CertificateProvisioned` and `Ready` are `True`,
   which can take minutes to about an hour:

   ```bash
   gcloud beta run domain-mappings describe --domain steelman-argument.com --region us-central1 --project steelman-production
   ```

8. Forward the old address and `www` to the bare address, keeping each link's path and query, so `/b/`,
   `/v/`, and `/c/` links keep working (plans/architecture.md Q13). In Cloudflare's DNS, set the existing
   `app` record to Proxied (the orange cloud). Add a `www` record set to Proxied too: a common choice is an
   `AAAA` record named `www` with the content `100::`, which only lets Cloudflare answer for the name. That
   choice comes from memory of Cloudflare's guidance and wasn't checked. Then, under Rules, Redirect Rules,
   create a Single Redirect for each name:

   - For `app`, match a custom filter expression of `(http.host eq "app.steelman-argument.com")`.
   - For `www`, match a custom filter expression of `(http.host eq "www.steelman-argument.com")`.
   - For both, choose the type Dynamic with the expression below, the status code 301, and Preserve query
     string turned on.

   ```text
   concat("https://steelman-argument.com", http.request.uri.path)
   ```

9. Check the move. Each of the first two should answer `301` with `location: https://steelman-argument.com/b/test`:

   ```bash
   curl -sI https://app.steelman-argument.com/b/test
   ```

   ```bash
   curl -sI https://www.steelman-argument.com/b/test
   ```

   This one should answer `{"status":"ok",` and the time:

   ```bash
   curl -s https://steelman-argument.com/api/health
   ```

   From `app/`, run the smoke test. It checks the page, the app's script, a board's address, health, the
   config read, and that sign-in is on. It also checks that a signed-out write sent to the new address is
   refused only because nobody is signed in. It doesn't check `APP_ORIGIN`, so it passes even when the
   service still has the old address:

   ```bash
   npx tsx server/src/smoke-cli.ts https://steelman-argument.com
   ```

   Check that the service's settings now include `APP_ORIGIN=https://steelman-argument.com`:

   ```bash
   gcloud run services describe steelman --project steelman-production --region us-central1 --format 'value(spec.template.spec.containers[0].env)'
   ```

   Then open https://steelman-argument.com, sign in with Google, and make one write, such as a vote on a
   board. This step must pass, because it is the only check that sign-in and writes work at the new address.

10. Once those checks pass, go back to the production OAuth client from step 2 and remove the old redirect
    URI, then save:

    ```text
    https://app.steelman-argument.com/api/auth/callback/google
    ```

After the run, add a dated entry to `tests/build-1-manual.md` with the plan's output and each check's result.
The link to the app on the Product Page, in `docs/index.html`, changes in a follow-up after the move.
