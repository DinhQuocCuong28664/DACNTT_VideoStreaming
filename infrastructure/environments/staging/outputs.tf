output "frontend_url" {
  value = local.frontend_url
}

output "api_url" {
  value = "https://${local.api_domain}/"
}

output "cdn_domain" {
  value = local.cdn_domain
}

output "frontend_bucket" {
  value = aws_s3_bucket.frontend.bucket
}

output "frontend_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "batch_job_definition" {
  value = module.batch.job_definition_name
}

output "backend_function_name" {
  value = module.lambda_backend.function_name
}

output "backend_function_url" {
  description = "Origin of the staging Worker (wrangler.toml [env.staging] TARGET_HOST is its host)"
  value       = module.lambda_backend.function_url
}

output "github_staging_deploy_role_arn" {
  description = "Đặt vào biến repository AWS_STAGING_DEPLOY_ROLE_ARN"
  value       = var.github_oidc_enabled ? aws_iam_role.github_staging_deploy[0].arn : null
}

output "github_staging_cloudfront_role_arn" {
  description = "Đặt vào biến repository AWS_STAGING_CLOUDFRONT_ROLE_ARN"
  value       = var.github_oidc_enabled ? aws_iam_role.github_staging_cloudfront[0].arn : null
}
