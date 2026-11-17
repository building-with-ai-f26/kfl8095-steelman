output "dns_records" {
  description = "Add these in Cloudflare for the domain, with the proxy off (DNS only, the grey cloud), so Google can issue the certificate."
  value       = google_cloud_run_domain_mapping.app.status[0].resource_records
}

output "workload_identity_provider" {
  description = "For the deploy workflow (M1-14c): which identity provider GitHub signs in through."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deploy_service_account" {
  description = "For the deploy workflow (M1-14c): the account it acts as."
  value       = google_service_account.deploy.email
}

output "image_repository" {
  description = "Where the deploy workflow pushes images."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "database_instance" {
  description = "The Cloud SQL instance's connection name."
  value       = google_sql_database_instance.main.connection_name
}
