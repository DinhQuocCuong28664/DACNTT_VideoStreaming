output "raw_bucket_name" {
  description = "Name of the raw video S3 bucket"
  value       = aws_s3_bucket.raw.id
}

output "raw_bucket_arn" {
  description = "ARN of the raw video S3 bucket"
  value       = aws_s3_bucket.raw.arn
}

output "processed_bucket_name" {
  description = "Name of the processed HLS S3 bucket"
  value       = aws_s3_bucket.processed.id
}

output "processed_bucket_arn" {
  description = "ARN of the processed HLS S3 bucket"
  value       = aws_s3_bucket.processed.arn
}

output "processed_bucket_domain_name" {
  description = "Regional domain name of the processed bucket (for CloudFront origin)"
  value       = aws_s3_bucket.processed.bucket_regional_domain_name
}
