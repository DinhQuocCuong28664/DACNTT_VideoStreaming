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
