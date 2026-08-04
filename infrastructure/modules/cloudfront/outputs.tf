output "distribution_id" {
  value = length(aws_cloudfront_distribution.hls_cdn) > 0 ? aws_cloudfront_distribution.hls_cdn[0].id : null
}

output "distribution_domain_name" {
  description = "CloudFront domain name (or fallback S3 regional domain if CloudFront disabled)"
  value       = length(aws_cloudfront_distribution.hls_cdn) > 0 ? aws_cloudfront_distribution.hls_cdn[0].domain_name : var.processed_bucket_domain_name
}

output "distribution_arn" {
  value = length(aws_cloudfront_distribution.hls_cdn) > 0 ? aws_cloudfront_distribution.hls_cdn[0].arn : null
}
