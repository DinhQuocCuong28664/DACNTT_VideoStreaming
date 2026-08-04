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
