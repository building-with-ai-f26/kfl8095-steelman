# Steelman's staging environment: GCP project steelman-staging, at https://staging.steelman-argument.com.
# Everything is in ../modules/steelman; infra/README.md says how to apply it.

terraform {
  required_version = ">= 1.9"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 8.11" }
    random = { source = "hashicorp/random", version = "~> 3.9" }
  }
  # Terraform's record of what exists, in the private, versioned bucket the builder made once (infra/README.md).
  backend "gcs" {
    bucket = "steelman-production-terraform-state"
    prefix = "staging"
  }
}

provider "google" {
  project = "steelman-staging"
  region  = "us-central1"
  # The budget API needs a project to bill its own calls to, when the builder applies with their own login.
  user_project_override = true
  billing_project       = "steelman-staging"
}

# Kept in terraform.tfvars, which is never committed (see terraform.tfvars.example).
variable "billing_account" {
  type = string
}

variable "alert_email" {
  type = string
}

variable "posthog_key" {
  type    = string
  default = ""
}

module "steelman" {
  source = "../modules/steelman"

  project_id            = "steelman-staging"
  environment           = "staging"
  domain                = "staging.steelman-argument.com"
  google_client_id      = "1072423828337-8lva9oad7kqnae9gbsahds99d2m9qr5h.apps.googleusercontent.com"
  monthly_budget_usd    = 10
  stop_database_nightly = true # stopped every night; the deploy workflow starts it

  billing_account = var.billing_account
  alert_email     = var.alert_email
  posthog_key     = var.posthog_key
}

output "dns_records" {
  value = module.steelman.dns_records
}

output "workload_identity_provider" {
  value = module.steelman.workload_identity_provider
}

output "deploy_service_account" {
  value = module.steelman.deploy_service_account
}

output "image_repository" {
  value = module.steelman.image_repository
}
