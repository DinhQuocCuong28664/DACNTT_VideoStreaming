output "queue_arn" {
  value = aws_sqs_queue.ingest.arn
}

output "queue_url" {
  value = aws_sqs_queue.ingest.id
}

output "dlq_arn" {
  value = aws_sqs_queue.dlq.arn
}
