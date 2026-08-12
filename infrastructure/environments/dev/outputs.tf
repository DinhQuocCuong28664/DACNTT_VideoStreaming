# ═══════════════════════════════════════════════════
# Outputs
# ═══════════════════════════════════════════════════

output "raw_bucket_name" {
  value = module.s3.raw_bucket_name
}

output "processed_bucket_name" {
  value = module.s3.processed_bucket_name
}

output "ecr_repository_url" {
  value = module.ecr.repository_url
}

output "sqs_queue_url" {
  value = module.sqs.queue_url
}

output "cloudfront_domain" {
  description = "CloudFront domain for HLS video URLs"
  value       = module.cloudfront.distribution_domain_name
}

output "cloudfront_signing_key_pair_id" {
  description = "Giá trị cần đặt vào biến môi trường CLOUDFRONT_KEY_PAIR_ID của Backend"
  value       = module.cloudfront.signing_key_pair_id
}

output "cloudfront_signed_urls_enabled" {
  description = "CloudFront có đang yêu cầu Signed Cookie hay không"
  value       = module.cloudfront.signed_urls_enabled
}

output "batch_job_queue" {
  value = module.batch.job_queue_name
}

output "batch_job_definition" {
  value = module.batch.job_definition_name
}

output "lambda_function_name" {
  value = module.lambda.function_name
}

output "cloudwatch_dashboard" {
  value = module.monitoring.dashboard_name
}

output "ec2_backend_instance_profile_name" {
  description = "Attach to the EC2 instance running the backend API (see scripts/ec2-userdata.sh) so it can fetch secrets from Secrets Manager instead of hardcoding them"
  value       = module.iam.ec2_backend_instance_profile_name
}

output "mongodb_uri_secret_name" {
  value = "${var.project_name}-${var.environment}/mongodb-uri"
}

output "jwt_secret_secret_name" {
  value = "${var.project_name}-${var.environment}/jwt-secret"
}
