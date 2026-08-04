# ═══════════════════════════════════════════════════
# Module: SNS — Notification Topics
# ═══════════════════════════════════════════════════

resource "aws_sns_topic" "transcode_complete" {
  name = "${var.project_name}-transcode-complete"
  tags = merge(var.tags, { Name = "${var.project_name}-transcode-complete" })
}

resource "aws_sns_topic" "dlq_alert" {
  name = "${var.project_name}-dlq-alert"
  tags = merge(var.tags, { Name = "${var.project_name}-dlq-alert" })
}

# Email subscription for admin alerts
resource "aws_sns_topic_subscription" "admin_email" {
  count     = var.admin_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.dlq_alert.arn
  protocol  = "email"
  endpoint  = var.admin_email
}
