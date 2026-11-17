variable "project_id" {
  description = "The GCP project: steelman-staging or steelman-production."
  type        = string
}

variable "environment" {
  description = "\"staging\" or \"production\"."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "The environment is staging or production."
  }
}

variable "region" {
  description = "Where everything runs (Q15: us-central1, which supports Cloud Run's domain mapping)."
  type        = string
  default     = "us-central1"
}

variable "domain" {
  description = "The app's address, e.g. staging.steelman-argument.com."
  type        = string
}

variable "google_client_id" {
  description = "This environment's Google OAuth client ID (plans/build-plan.md, M1). Not secret."
  type        = string
}

variable "email_from" {
  description = "Who sign-in emails come from, on the domain Resend has verified."
  type        = string
  default     = "Steelman <sign-in@send.steelman-argument.com>"
}

variable "posthog_key" {
  description = "PostHog's public project key, for analytics in the browser. Empty: no analytics."
  type        = string
  default     = ""
}

variable "github_repository" {
  description = "The repository whose workflows may deploy, as owner/name."
  type        = string
  default     = "building-with-ai-f26/kfl8095-steelman"
}

variable "billing_account" {
  description = "The billing account's ID, for the budget alert. Kept in terraform.tfvars, which is never committed."
  type        = string
}

variable "alert_email" {
  description = "Where the uptime and budget alerts go. Kept in terraform.tfvars, which is never committed."
  type        = string
}

variable "monthly_budget_usd" {
  description = "The monthly budget the alerts are measured against (architecture §6: alerts at 50, 90, and 100%). Alerts don't stop spending."
  type        = number
}

variable "max_instances" {
  description = "The most copies of the service Cloud Run may run at once: the ceiling on compute, however much traffic arrives."
  type        = number
  default     = 3
}

variable "stop_database_nightly" {
  description = "Stop the database every night (staging: it bills for storage only while stopped; the deploy workflow starts it)."
  type        = bool
  default     = false
}

variable "export_bucket_project" {
  description = "If set, a weekly SQL export of the database goes to a bucket in this other project, kept 8 weeks (architecture §6). Empty: no export."
  type        = string
  default     = ""
}
