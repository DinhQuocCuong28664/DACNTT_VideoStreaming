output "bus_name" {
  value = aws_cloudwatch_event_bus.this.name
}

output "bus_arn" {
  value = aws_cloudwatch_event_bus.this.arn
}

output "alerts_topic_arn" {
  value = aws_sns_topic.alerts.arn
}
