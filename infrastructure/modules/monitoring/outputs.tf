output "backend_log_group_name" {
  value = aws_cloudwatch_log_group.backend.name
}

output "transcoder_log_group_name" {
  value = aws_cloudwatch_log_group.transcoder.name
}

output "dashboard_name" {
  value = aws_cloudwatch_dashboard.main.dashboard_name
}
