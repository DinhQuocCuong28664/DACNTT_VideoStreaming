output "table_names" {
  description = "Table names by role"
  value = {
    rate_limits    = aws_dynamodb_table.simple["rate_limits"].name
    view_marks     = aws_dynamodb_table.simple["view_marks"].name
    watch_progress = aws_dynamodb_table.watch_progress.name
    heartbeats     = aws_dynamodb_table.heartbeats.name
    notifications  = aws_dynamodb_table.notifications.name
  }
}

output "table_arns" {
  description = "Table ARNs (with index ARNs) for IAM policies"
  value = concat(
    [for t in aws_dynamodb_table.simple : t.arn],
    [
      aws_dynamodb_table.watch_progress.arn,
      "${aws_dynamodb_table.watch_progress.arn}/index/*",
      aws_dynamodb_table.heartbeats.arn,
      aws_dynamodb_table.notifications.arn,
    ],
  )
}
