# One Steelman environment in one GCP project (plans/architecture.md §5 and §6;
# M1-14b). staging/ and production/ each use this module with their own
# settings. What it holds, in reading order:
#
#   apis           the Google services the rest needs, switched on
#   database       Cloud SQL for Postgres 17: backups 14 days, restore to any
#                  moment of the last 7, a weekly export kept 8 weeks
#   secrets        Secret Manager: the database's logins and the sign-in secret,
#                  which Terraform makes; Resend's key and Google's client
#                  secret, which the builder adds (see infra/README.md)
#   identities     a service account for each job to be done, each with only
#                  what that job needs, and GitHub's way in without a key
#   the service    Cloud Run: the service at the domain, the migration job,
#                  the daily job
#   schedules      Cloud Scheduler: the daily job, the weekly export, and on
#                  staging the nightly stop
#   monitoring     an uptime check and the budget, alerting by email
#
# The service and jobs start on Google's sample container; the deploy workflow
# (M1-14c) puts Steelman's own image in, so Terraform leaves the image alone.

locals {
  name         = "steelman"
  origin       = "https://${var.domain}"
  placeholder  = "us-docker.pkg.dev/cloudrun/container/hello"
  service_user = "steelman_service"
  owner_user   = "steelman_owner"
  database     = "steelman"
  socket       = "/cloudsql/${google_sql_database_instance.main.connection_name}"
}

data "google_project" "this" {
  project_id = var.project_id
}

# ── APIs ──

resource "google_project_service" "apis" {
  for_each = toset([
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "sts.googleapis.com",
  ])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# ── Database ──

resource "google_sql_database_instance" "main" {
  project             = var.project_id
  name                = "${local.name}-${var.environment}"
  region              = var.region
  database_version    = "POSTGRES_17"
  deletion_protection = true

  settings {
    # The smallest shared-core size, in the edition that offers it (architecture §5: about $9–10 a month).
    edition           = "ENTERPRISE"
    tier              = "db-f1-micro"
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = 10
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      start_time                     = "08:00" # UTC: 2 or 3 in the morning in the US Midwest
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7 # the most this edition allows (architecture §6)
      backup_retention_settings {
        retained_backups = 14
        retention_unit   = "COUNT"
      }
    }

    # Reached only through Cloud Run's own connection to Cloud SQL, which signs in with IAM: no address is open.
    ip_configuration {
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }

    maintenance_window {
      day  = 7 # Sunday
      hour = 9 # UTC
    }
  }

  lifecycle {
    # On staging, the nightly stop and the deploy workflow's start change this; Terraform leaves it to them.
    ignore_changes = [settings[0].activation_policy]
  }

  depends_on = [google_project_service.apis]
}

resource "google_sql_database" "steelman" {
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  name     = local.database
}

# The database's owner: the migration job signs in as it. The service has its own login, with only
# steelman_app's rights, which the migration job creates (app/server/src/db/service-login.ts).
resource "random_password" "owner" {
  length  = 32
  special = false
}

resource "random_password" "service" {
  length  = 32
  special = false
}

resource "google_sql_user" "owner" {
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  name     = local.owner_user
  password = random_password.owner.result
  # It owns every table, so Postgres would refuse to drop it; if Terraform ever removes it, it leaves it be.
  deletion_policy = "ABANDON"
}

# ── Secrets ──
#
# Terraform makes the first four, so their values are in Terraform's state, which is kept in a private bucket
# with versioning (infra/README.md). The builder adds the last two: Terraform gives them a placeholder only.

resource "random_password" "auth" {
  length  = 48
  special = false
}

locals {
  made_secrets = {
    "database-url"              = "postgres://${local.service_user}:${random_password.service.result}@localhost/${local.database}?host=${local.socket}"
    "migrate-database-url"      = "postgres://${local.owner_user}:${random_password.owner.result}@localhost/${local.database}?host=${local.socket}"
    "service-database-password" = random_password.service.result
    "better-auth-secret"        = random_password.auth.result
  }
  builder_secrets = ["resend-api-key", "google-client-secret"]
}

resource "google_secret_manager_secret" "made" {
  for_each  = local.made_secrets
  project   = var.project_id
  secret_id = each.key
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "made" {
  for_each    = local.made_secrets
  secret      = google_secret_manager_secret.made[each.key].id
  secret_data = each.value
}

resource "google_secret_manager_secret" "builder" {
  for_each  = toset(local.builder_secrets)
  project   = var.project_id
  secret_id = each.value
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

# A placeholder, so the service can be created before the builder adds the real value as a newer version.
resource "google_secret_manager_secret_version" "builder_placeholder" {
  for_each    = toset(local.builder_secrets)
  secret      = google_secret_manager_secret.builder[each.value].id
  secret_data = "not-set-yet"
  lifecycle {
    ignore_changes = [secret_data, enabled]
  }
}

# ── Identities ──

resource "google_service_account" "service" {
  project      = var.project_id
  account_id   = "steelman-service"
  display_name = "Steelman service (the app and its daily job)"
  depends_on   = [google_project_service.apis]
}

resource "google_service_account" "migrate" {
  project      = var.project_id
  account_id   = "steelman-migrate"
  display_name = "Steelman migrations (signs in to the database as its owner)"
  depends_on   = [google_project_service.apis]
}

resource "google_service_account" "scheduler" {
  project      = var.project_id
  account_id   = "steelman-scheduler"
  display_name = "Steelman schedules (starts the daily job, the export, and the nightly stop)"
  depends_on   = [google_project_service.apis]
}

resource "google_service_account" "deploy" {
  project      = var.project_id
  account_id   = "steelman-deploy"
  display_name = "Steelman deploys from GitHub (can deploy, can't read secrets)"
  depends_on   = [google_project_service.apis]
}

# Both the service and the migrations reach the database through Cloud Run's connection to Cloud SQL.
resource "google_project_iam_member" "sql_client" {
  for_each = { service = google_service_account.service.email, migrate = google_service_account.migrate.email }
  project  = var.project_id
  role     = "roles/cloudsql.client"
  member   = "serviceAccount:${each.value}"
}

# Each reads only its own secrets.
locals {
  secret_readers = {
    "service/database-url"              = ["service", google_secret_manager_secret.made["database-url"].id]
    "service/better-auth-secret"        = ["service", google_secret_manager_secret.made["better-auth-secret"].id]
    "service/resend-api-key"            = ["service", google_secret_manager_secret.builder["resend-api-key"].id]
    "service/google-client-secret"      = ["service", google_secret_manager_secret.builder["google-client-secret"].id]
    "migrate/migrate-database-url"      = ["migrate", google_secret_manager_secret.made["migrate-database-url"].id]
    "migrate/service-database-password" = ["migrate", google_secret_manager_secret.made["service-database-password"].id]
  }
  accounts = { service = google_service_account.service.email, migrate = google_service_account.migrate.email }
}

resource "google_secret_manager_secret_iam_member" "readers" {
  for_each  = local.secret_readers
  secret_id = each.value[1]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.accounts[each.value[0]]}"
}

# GitHub's way in, with no key stored anywhere (architecture §6): GitHub proves which repository, branch, and
# environment a run belongs to, and only this repository's runs may act as the deploy account. Staging takes
# runs from main; production only runs in GitHub's protected "production" environment, which the builder approves.
resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub Actions"
  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.repository"  = "assertion.repository"
    "attribute.ref"         = "assertion.ref"
    "attribute.environment" = "assertion.environment"
  }
  # Staging: only runs on main that a merge, a schedule, or the builder started; never a pull request's run.
  attribute_condition = var.environment == "production" ? "assertion.repository == '${var.github_repository}' && assertion.environment == 'production'" : "assertion.repository == '${var.github_repository}' && assertion.ref == 'refs/heads/main' && assertion.event_name in ['push', 'schedule', 'workflow_dispatch']"
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "deploy_from_github" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# What deploying takes: push the image, deploy the service and jobs and run the migration job, act as the
# accounts they run as, and (staging) start the database. Not reading secrets.
resource "google_project_iam_member" "deploy" {
  for_each = toset(["roles/run.developer", "roles/cloudsql.editor"])
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_artifact_registry_repository_iam_member" "deploy_push" {
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_service_account_iam_member" "deploy_acts_as" {
  for_each           = { service = google_service_account.service.name, migrate = google_service_account.migrate.name }
  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deploy.email}"
}

# ── The service ──

resource "google_artifact_registry_repository" "images" {
  project       = var.project_id
  location      = var.region
  repository_id = local.name
  format        = "DOCKER"
  description   = "Steelman's container images"
  # Keep the ten newest images (enough to roll back to any recent release); delete older ones.
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }
  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "2592000s" # 30 days
    }
  }
  depends_on = [google_project_service.apis]
}

locals {
  plain_env = merge(
    {
      APP_ORIGIN       = local.origin
      EMAIL_FROM       = var.email_from
      GOOGLE_CLIENT_ID = var.google_client_id
    },
    var.posthog_key == "" ? {} : { POSTHOG_KEY = var.posthog_key },
  )
  service_secrets = {
    DATABASE_URL         = google_secret_manager_secret.made["database-url"].secret_id
    BETTER_AUTH_SECRET   = google_secret_manager_secret.made["better-auth-secret"].secret_id
    RESEND_API_KEY       = google_secret_manager_secret.builder["resend-api-key"].secret_id
    GOOGLE_CLIENT_SECRET = google_secret_manager_secret.builder["google-client-secret"].secret_id
  }
}

resource "google_cloud_run_v2_service" "app" {
  project             = var.project_id
  name                = local.name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = var.environment == "production"

  template {
    service_account = google_service_account.service.email
    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instances
    }
    containers {
      image = local.placeholder
      ports {
        container_port = 8080
      }
      resources {
        limits = { cpu = "1", memory = "512Mi" }
      }
      dynamic "env" {
        for_each = local.plain_env
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.service_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }
  }

  lifecycle {
    # The deploy workflow (M1-14c) puts each release's image in.
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }

  depends_on = [google_secret_manager_secret_iam_member.readers, google_project_iam_member.sql_client, google_secret_manager_secret_version.made, google_secret_manager_secret_version.builder_placeholder]
}

# Anyone may reach the site: who may do what is the service's own sign-in and roles (architecture §7).
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# The address (architecture §6: domain mapping, a preview feature, acceptable for the class trial). Google gives
# the DNS records to add in Cloudflare: see the dns_records output.
resource "google_cloud_run_domain_mapping" "app" {
  project  = var.project_id
  location = var.region
  name     = var.domain
  metadata {
    namespace = var.project_id
  }
  spec {
    route_name = google_cloud_run_v2_service.app.name
  }
}

# The migration job: signs in as the database's owner, applies what's new, and creates the service's login.
resource "google_cloud_run_v2_job" "migrate" {
  project             = var.project_id
  name                = "${local.name}-migrate"
  location            = var.region
  deletion_protection = false

  template {
    task_count = 1
    template {
      service_account = google_service_account.migrate.email
      max_retries     = 0
      timeout         = "600s"
      containers {
        image   = local.placeholder
        command = ["node", "server/dist/migrate-cli.mjs"]
        env {
          name  = "SERVICE_DATABASE_USER"
          value = local.service_user
        }
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.made["migrate-database-url"].secret_id
              version = "latest"
            }
          }
        }
        env {
          name = "SERVICE_DATABASE_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.made["service-database-password"].secret_id
              version = "latest"
            }
          }
        }
        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.main.connection_name]
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }

  depends_on = [google_secret_manager_secret_iam_member.readers, google_project_iam_member.sql_client, google_secret_manager_secret_version.made]
}

# The daily job: the retention table's clean-up (app/server/src/jobs/daily.ts), as the service.
resource "google_cloud_run_v2_job" "daily" {
  project             = var.project_id
  name                = "${local.name}-daily"
  location            = var.region
  deletion_protection = false

  template {
    task_count = 1
    template {
      service_account = google_service_account.service.email
      max_retries     = 1
      timeout         = "600s"
      containers {
        image   = local.placeholder
        command = ["node", "server/dist/daily-cli.mjs"]
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.made["database-url"].secret_id
              version = "latest"
            }
          }
        }
        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.main.connection_name]
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }

  depends_on = [google_secret_manager_secret_iam_member.readers, google_project_iam_member.sql_client, google_secret_manager_secret_version.made]
}

# ── Schedules ──

resource "google_cloud_run_v2_job_iam_member" "scheduler_runs_daily" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.daily.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

# Not on staging: its database is stopped every night, and its data can be wiped anyway.
resource "google_cloud_scheduler_job" "daily" {
  count     = var.stop_database_nightly ? 0 : 1
  project   = var.project_id
  region    = var.region
  name      = "${local.name}-daily"
  schedule  = "30 8 * * *" # every day, 08:30 UTC
  time_zone = "Etc/UTC"
  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${google_cloud_run_v2_job.daily.name}:run"
    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }
  }
  depends_on = [google_cloud_run_v2_job_iam_member.scheduler_runs_daily]
}

# Stopping the database (staging) and exporting it (production) both go through Cloud SQL's own API.
resource "google_project_iam_member" "scheduler_sql" {
  count   = var.stop_database_nightly || var.export_bucket_project != "" ? 1 : 0
  project = var.project_id
  role    = "roles/cloudsql.editor"
  member  = "serviceAccount:${google_service_account.scheduler.email}"
}

# Staging: stopped every night, so it bills only for storage (about $2 a month); the deploy workflow starts it.
resource "google_cloud_scheduler_job" "stop_database" {
  count     = var.stop_database_nightly ? 1 : 0
  project   = var.project_id
  region    = var.region
  name      = "${local.name}-stop-database"
  schedule  = "0 9 * * *" # every night, 09:00 UTC
  time_zone = "Etc/UTC"
  http_target {
    http_method = "PATCH"
    uri         = "https://sqladmin.googleapis.com/v1/projects/${var.project_id}/instances/${google_sql_database_instance.main.name}"
    headers     = { "Content-Type" = "application/json" }
    body        = base64encode(jsonencode({ settings = { activationPolicy = "NEVER" } }))
    oauth_token {
      service_account_email = google_service_account.scheduler.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }
  depends_on = [google_project_iam_member.scheduler_sql]
}

# Production: a weekly plain SQL export to a bucket in another project, so it outlives this one. Each week's
# export replaces the last, and versioning keeps the 7 before it: 8 weeks in all (architecture §6).
resource "google_storage_bucket" "exports" {
  count                       = var.export_bucket_project != "" ? 1 : 0
  project                     = var.export_bucket_project
  name                        = "${var.project_id}-database-exports"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  versioning {
    enabled = true
  }
  lifecycle_rule {
    condition {
      num_newer_versions = 8
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }
}

# Object Admin, as Cloud SQL's export docs give it: replacing last week's export needs the right to delete it.
resource "google_storage_bucket_iam_member" "exports_writer" {
  count  = var.export_bucket_project != "" ? 1 : 0
  bucket = google_storage_bucket.exports[0].name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_sql_database_instance.main.service_account_email_address}"
}

resource "google_cloud_scheduler_job" "export" {
  count     = var.export_bucket_project != "" ? 1 : 0
  project   = var.project_id
  region    = var.region
  name      = "${local.name}-weekly-export"
  schedule  = "0 10 * * 0" # Sundays, 10:00 UTC
  time_zone = "Etc/UTC"
  http_target {
    http_method = "POST"
    uri         = "https://sqladmin.googleapis.com/v1/projects/${var.project_id}/instances/${google_sql_database_instance.main.name}/export"
    headers     = { "Content-Type" = "application/json" }
    body = base64encode(jsonencode({
      exportContext = {
        fileType  = "SQL"
        uri       = "gs://${google_storage_bucket.exports[0].name}/${local.database}.sql.gz"
        databases = [local.database]
      }
    }))
    oauth_token {
      service_account_email = google_service_account.scheduler.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }
  depends_on = [google_project_iam_member.scheduler_sql, google_storage_bucket_iam_member.exports_writer]
}

# ── Monitoring ──

resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "Steelman alerts (${var.environment})"
  type         = "email"
  labels       = { email_address = var.alert_email }
  depends_on   = [google_project_service.apis]
}

# /api/health, not /healthz: Cloud Run reserves some paths ending in z (architecture §6).
resource "google_monitoring_uptime_check_config" "health" {
  project      = var.project_id
  display_name = "Steelman ${var.environment} is up"
  timeout      = "10s"
  period       = "300s"
  http_check {
    path         = "/api/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }
  monitored_resource {
    type   = "uptime_url"
    labels = { project_id = var.project_id, host = var.domain }
  }
  depends_on = [google_project_service.apis]
}

resource "google_monitoring_alert_policy" "down" {
  project      = var.project_id
  display_name = "Steelman ${var.environment} is down"
  combiner     = "OR"
  conditions {
    display_name = "The health check fails"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.health.uptime_check_id}\" AND resource.type=\"uptime_url\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "600s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }
    }
  }
  notification_channels = [google_monitoring_notification_channel.email.id]
}

# Alerts at 50, 90, and 100% of the monthly budget. Google is explicit that this doesn't stop spending;
# max_instances and the database's fixed size are the ceilings (architecture §6).
resource "google_billing_budget" "monthly" {
  billing_account = var.billing_account
  display_name    = "Steelman ${var.environment}"
  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }
  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.monthly_budget_usd)
    }
  }
  dynamic "threshold_rules" {
    for_each = [0.5, 0.9, 1.0]
    content {
      threshold_percent = threshold_rules.value
    }
  }
  all_updates_rule {
    monitoring_notification_channels = [google_monitoring_notification_channel.email.id]
    disable_default_iam_recipients   = false
  }
  depends_on = [google_project_service.apis]
}
