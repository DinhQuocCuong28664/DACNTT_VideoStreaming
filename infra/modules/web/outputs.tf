output "url" {
  value = "https://${var.host}"
}

output "bucket_name" {
  value = aws_s3_bucket.web.id
}

output "distribution_id" {
  description = "Invalidated after each deploy (account A)"
  value       = aws_cloudfront_distribution.web.id
}

output "distribution_domain" {
  value = aws_cloudfront_distribution.web.domain_name
}
