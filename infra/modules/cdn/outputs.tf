output "base_url" {
  value = "https://${var.host}"
}

output "key_pair_id" {
  description = "Key-Pair-Id the API puts into signed policies"
  value       = aws_cloudfront_public_key.signing.id
}

output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}

output "distribution_domain_name" {
  value = aws_cloudfront_distribution.this.domain_name
}

output "bucket_policy_json" {
  value = data.aws_iam_policy_document.bucket_read.json
}
