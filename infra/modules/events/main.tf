# Custom EventBridge bus for pipeline events (progress, published) and the SNS topic that
# carries operator alerts (workflow failures, DLQ messages).

resource "aws_cloudwatch_event_bus" "this" {
  name = var.name
}

# Alerts carry resource names and failure reasons, never user data. CloudWatch alarms cannot
# publish to a topic encrypted with the AWS-managed SNS key, and a customer key would cost a
# monthly fee per environment, so the topic stays unencrypted.
#trivy:ignore:AWS-0095
resource "aws_sns_topic" "alerts" {
  name = "${var.name}-alerts"
}

data "aws_caller_identity" "current" {}

# Only alarms and rules of this account may publish (no confused deputy).
data "aws_iam_policy_document" "alerts" {
  statement {
    sid       = "AllowCloudWatchAndEventBridge"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com", "events.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts.json
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}
