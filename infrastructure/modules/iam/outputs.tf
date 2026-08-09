output "batch_service_role_arn" {
  value = aws_iam_role.batch_service.arn
}

output "ecs_task_execution_role_arn" {
  value = aws_iam_role.ecs_task_execution.arn
}

output "transcoder_task_role_arn" {
  value = aws_iam_role.transcoder_task.arn
}

output "lambda_job_submitter_role_arn" {
  value = aws_iam_role.lambda_job_submitter.arn
}

output "ec2_backend_instance_profile_name" {
  description = "Attach this instance profile to the EC2 instance running the backend API so it can read secrets from Secrets Manager (see scripts/ec2-userdata.sh)"
  value       = aws_iam_instance_profile.ec2_backend.name
}
