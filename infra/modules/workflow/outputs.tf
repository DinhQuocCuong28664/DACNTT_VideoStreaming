output "state_machine_arn" {
  value = aws_sfn_state_machine.transcode.arn
}

output "function_names" {
  value = { for k, f in aws_lambda_function.fn : k => f.function_name }
}

output "mongodb_secret_arn" {
  value = aws_secretsmanager_secret.mongodb_uri.arn
}

output "function_arns" {
  value = { for k, f in aws_lambda_function.fn : k => f.arn }
}
