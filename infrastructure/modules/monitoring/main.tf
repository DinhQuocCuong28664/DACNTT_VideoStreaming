# ═══════════════════════════════════════════════════
# Module: Monitoring — CloudWatch Alarms + Dashboard
# ═══════════════════════════════════════════════════

# ── Log Groups ─────────────────────────────────────
resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.project_name}/backend"
  retention_in_days = var.log_retention_days

  tags = merge(var.tags, { Name = "${var.project_name}-backend-logs" })
}

resource "aws_cloudwatch_log_group" "transcoder" {
  name              = "/ecs/${var.project_name}/transcoder"
  retention_in_days = var.log_retention_days

  tags = merge(var.tags, { Name = "${var.project_name}-transcoder-logs" })
}

# ── Alarms ─────────────────────────────────────────

# Alarm: DLQ has messages (transcoding failures)
resource "aws_cloudwatch_metric_alarm" "dlq_not_empty" {
  alarm_name          = "${var.project_name}-dlq-not-empty"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "ALERT: Dead Letter Queue has messages — video transcoding failures detected!"
  alarm_actions       = [var.dlq_alert_topic_arn]

  dimensions = {
    QueueName = var.dlq_queue_name
  }

  tags = merge(var.tags, { Name = "${var.project_name}-dlq-alarm" })
}

# Alarm: SQS Queue depth too high (backlog building up)
resource "aws_cloudwatch_metric_alarm" "queue_depth_high" {
  alarm_name          = "${var.project_name}-queue-depth-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 50
  alarm_description   = "WARNING: Transcode queue depth > 50 — possible bottleneck"
  alarm_actions       = [var.dlq_alert_topic_arn]

  dimensions = {
    QueueName = var.transcode_queue_name
  }

  tags = merge(var.tags, { Name = "${var.project_name}-queue-depth-alarm" })
}

# ── Dashboard ──────────────────────────────────────
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-overview"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "SQS Queue Depth"
          region = var.region
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.transcode_queue_name],
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.dlq_queue_name]
          ]
          period = 300
          stat   = "Sum"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "SQS Messages Processed"
          region = var.region
          metrics = [
            ["AWS/SQS", "NumberOfMessagesReceived", "QueueName", var.transcode_queue_name],
            ["AWS/SQS", "NumberOfMessagesDeleted", "QueueName", var.transcode_queue_name]
          ]
          period = 300
          stat   = "Sum"
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 6
        width  = 24
        height = 6
        properties = {
          title  = "Transcoder Logs (Recent)"
          region = var.region
          query  = "SOURCE '/ecs/${var.project_name}/transcoder' | fields @timestamp, @message | sort @timestamp desc | limit 50"
        }
      }
    ]
  })
}
