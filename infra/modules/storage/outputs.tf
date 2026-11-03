output "bucket_names" {
  description = "Bucket names by role: raw, processed, work, keys"
  value       = { for k, b in aws_s3_bucket.this : k => b.bucket }
}

output "bucket_arns" {
  description = "Bucket ARNs by role: raw, processed, work, keys"
  value       = { for k, b in aws_s3_bucket.this : k => b.arn }
}

output "processed_bucket_regional_domain_name" {
  value = aws_s3_bucket.this["processed"].bucket_regional_domain_name
}
