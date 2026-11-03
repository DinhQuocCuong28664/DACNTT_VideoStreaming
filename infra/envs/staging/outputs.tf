output "bucket_names" {
  value = module.storage.bucket_names
}

output "ingest_queue_url" {
  value = module.ingest.queue_url
}

output "event_bus_name" {
  value = module.events.bus_name
}

output "table_names" {
  value = module.kv.table_names
}

output "job_queue_arns" {
  value = module.batch.job_queue_arns
}

output "job_definition_names" {
  value = module.batch.job_definition_names
}

output "state_machine_arn" {
  value = module.workflow.state_machine_arn
}

output "mongodb_secret_arn" {
  value = module.workflow.mongodb_secret_arn
}

output "api_function_url" {
  value = module.app.api_function_url
}

output "api_secret_arn" {
  value = module.app.api_secret_arn
}

output "cdn_base_url" {
  value = module.cdn.base_url
}

output "cdn_key_pair_id" {
  value = module.cdn.key_pair_id
}

output "web_url" {
  value = module.web.url
}

output "web_bucket" {
  value = module.web.bucket_name
}

output "web_distribution_id" {
  value = module.web.distribution_id
}
