output "dlq_alert_topic_arn" {
  value = aws_sns_topic.dlq_alert.arn
}
