output "distribution_id" {
  value = aws_cloudfront_distribution.hls_cdn.id
}

output "distribution_domain_name" {
  description = "CloudFront domain name (use this for HLS URLs)"
  value       = aws_cloudfront_distribution.hls_cdn.domain_name
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.hls_cdn.arn
}
