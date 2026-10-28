output "job_queue_arns" {
  description = "Queue ARNs by name: main, bulk"
  value       = { for k, q in aws_batch_job_queue.this : k => q.arn }
}

output "job_definition_arns" {
  description = "Job definition ARNs (with revision) by role"
  value       = { for k, d in aws_batch_job_definition.role : k => d.arn }
}

output "job_definition_names" {
  description = "Job definition names by role"
  value       = { for k, d in aws_batch_job_definition.role : k => d.name }
}

output "job_role_arn" {
  value = aws_iam_role.job.arn
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.jobs.name
}
