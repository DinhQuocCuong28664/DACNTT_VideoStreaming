output "compute_environment_arn" { value = aws_batch_compute_environment.fargate.arn }
output "ondemand_compute_environment_arn" { value = try(aws_batch_compute_environment.fargate_ondemand[0].arn, null) }
output "job_queue_arn" { value = aws_batch_job_queue.transcode.arn }
output "job_queue_name" { value = aws_batch_job_queue.transcode.name }
output "bulk_job_queue_arn" { value = aws_batch_job_queue.bulk.arn }
output "bulk_job_queue_name" { value = aws_batch_job_queue.bulk.name }
output "job_definition_arn" { value = aws_batch_job_definition.transcoder.arn }
output "job_definition_name" { value = aws_batch_job_definition.transcoder.name }
