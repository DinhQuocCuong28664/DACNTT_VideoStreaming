output "function_name" {
  description = "Name of the backend Lambda function"
  value       = aws_lambda_function.backend_api.function_name
}

output "function_arn" {
  description = "ARN of the backend Lambda function"
  value       = aws_lambda_function.backend_api.arn
}

output "function_url" {
  description = "Direct HTTPS endpoint provided by AWS Lambda Function URL"
  value       = aws_lambda_function_url.backend_api.function_url
}

output "function_url_domain" {
  description = "Domain of the Lambda Function URL (stripped https and slashes for Cloudflare CNAME)"
  value       = replace(replace(aws_lambda_function_url.backend_api.function_url, "https://", ""), "/", "")
}
