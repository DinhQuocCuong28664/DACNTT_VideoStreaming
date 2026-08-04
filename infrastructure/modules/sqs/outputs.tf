output "queue_url" {
  description = "URL of the transcode SQS queue"
  value       = aws_sqs_queue.transcode.url
}

output "queue_arn" {
  description = "ARN of the transcode SQS queue"
  value       = aws_sqs_queue.transcode.arn
}

output "queue_name" {
  description = "Name of the transcode SQS queue"
  value       = aws_sqs_queue.transcode.name
}

output "dlq_arn" {
  description = "ARN of the Dead Letter Queue"
  value       = aws_sqs_queue.dlq.arn
}

output "dlq_url" {
  description = "URL of the Dead Letter Queue"
  value       = aws_sqs_queue.dlq.url
}

output "queue_policy_id" {
  description = "ID of the SQS queue policy (for dependency ordering)"
  value       = aws_sqs_queue_policy.allow_s3_events.id
}
