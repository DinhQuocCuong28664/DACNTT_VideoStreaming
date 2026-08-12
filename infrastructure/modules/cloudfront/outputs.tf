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

output "signing_key_pair_id" {
  description = "ID của CloudFront Public Key, Backend cần giá trị này để đặt vào cookie CloudFront-Key-Pair-Id"
  value       = length(aws_cloudfront_public_key.signing) > 0 ? aws_cloudfront_public_key.signing[0].id : null
}

output "signing_key_group_id" {
  description = "ID của Trusted Key Group đang được gắn vào cache behavior"
  value       = length(aws_cloudfront_key_group.signing) > 0 ? aws_cloudfront_key_group.signing[0].id : null
}

output "signed_urls_enabled" {
  description = "Cho biết CloudFront có đang yêu cầu Signed Cookie hay không"
  value       = var.enable_signed_urls
}
