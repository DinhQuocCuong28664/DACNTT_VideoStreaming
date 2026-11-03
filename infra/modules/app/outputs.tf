output "api_function_url" {
  description = "Origin of the Cloudflare Worker route"
  value       = aws_lambda_function_url.api.function_url
}

output "api_function_name" {
  value = aws_lambda_function.api.function_name
}

output "api_secret_arn" {
  value = aws_secretsmanager_secret.api.arn
}

output "background_function_names" {
  value = { for k, f in aws_lambda_function.background : k => f.function_name }
}
