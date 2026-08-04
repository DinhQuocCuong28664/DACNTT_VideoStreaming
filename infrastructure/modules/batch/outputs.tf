output "compute_environment_arn" { value = aws_batch_compute_environment.fargate.arn }
output "job_queue_arn" { value = aws_batch_job_queue.transcode.arn }
output "job_queue_name" { value = aws_batch_job_queue.transcode.name }
output "job_definition_arn" { value = aws_batch_job_definition.transcoder.arn }
output "job_definition_name" { value = aws_batch_job_definition.transcoder.name }
