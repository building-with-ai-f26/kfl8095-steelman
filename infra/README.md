# infra/: Steelman on Google Cloud

Terraform for the two environments (plans/architecture.md §5 and §6; M1-14b):

| | Staging | Production |
|---|---|---|
| Folder | `staging/` | `production/` |
| GCP project | `steelman-staging` | `steelman-production` |
| Address | https://staging.steelman-argument.com | https://app.steelman-argument.com |
| Budget alerts at | $10 a month | $25 a month |
| Database | stopped every night, started by each deploy | always on; a weekly export to a bucket in `steelman-staging`, kept 8 weeks |

Both use `modules/steelman/`, which reads top to bottom: the APIs, the database, the secrets, the service
accounts and GitHub's way in, the Cloud Run service and its two jobs, the schedules, and the monitoring.

**What applying it costs:** about $15–20 a month in all (plans/build-plan.md, M1): the production database
about $9–10, Cloud Run $0–5, staging's database about $2 while stopped. Budget alerts don't stop spending;
the ceilings are Cloud Run's 3 instances and the database's fixed size.

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
