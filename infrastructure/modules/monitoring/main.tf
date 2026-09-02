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

# Alarm: DLQ has messages (job SUBMISSION failures — see note)
#
# Mô tả cũ của alarm này ghi "video transcoding failures detected", và điều đó
# sai về mặt cấu trúc chứ không chỉ sai chữ nghĩa. Message SQS được Lambda tiêu
# thụ; Lambda chỉ nộp job lên Batch rồi trả về ngay, nên message được coi là xử
# lý thành công và bị xoá ngay tại thời điểm NỘP. Một job transcode thất bại
# sau đó, dù thất bại thế nào, cũng không thể đẩy gì vào DLQ nữa.
#
# Thứ DLQ thực sự bắt được chỉ là lỗi ở tầng nộp job: Lambda ném lỗi khi gọi
# SubmitJob, hoặc message S3 dị dạng không parse được.
#
# Lỗi transcode do alarm batch_jobs_failed bên dưới đảm nhiệm. Việc thiếu alarm
# đó chính là lý do cấu trúc khiến sự cố ResourceInitializationError âm thầm
# trôi qua hàng giờ: alarm duy nhất nghe như sẽ kêu lại là alarm không bao giờ
# có thể kêu.
resource "aws_cloudwatch_metric_alarm" "dlq_not_empty" {
  alarm_name          = "${var.project_name}-dlq-not-empty"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "ALERT: Dead Letter Queue has messages - job submission failed (Lambda could not submit to Batch, or a malformed S3 event). This does NOT cover transcoding failures; see the batch-jobs-failed alarm for those."
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

# ── Cảnh báo job transcode thất bại ────────────────
#
# AWS Batch không phát metric nào lên CloudWatch cho số job thất bại, nên không
# thể dựng aws_cloudwatch_metric_alarm cho việc này. Batch phát sự kiện đổi
# trạng thái job sang EventBridge, và đó là đường duy nhất để bắt được.
#
# Đây là mảnh còn thiếu khiến hệ thống trước đó hoàn toàn mù trước lỗi
# transcode: DLQ về cấu trúc không thể nhận lỗi transcode (xem ghi chú ở alarm
# dlq_not_empty), mà cũng chẳng có cảnh báo nào khác. Toàn bộ job có thể thất
# bại liên tục hàng giờ mà không một tín hiệu nào phát ra.
resource "aws_cloudwatch_event_rule" "batch_job_failed" {
  count       = var.batch_job_queue_arn != "" ? 1 : 0
  name        = "${var.project_name}-batch-job-failed"
  description = "Bắt sự kiện job AWS Batch chuyển sang trạng thái FAILED trên hàng đợi transcode"

  event_pattern = jsonencode({
    source        = ["aws.batch"]
    "detail-type" = ["Batch Job State Change"]
    detail = {
      status   = ["FAILED"]
      jobQueue = [var.batch_job_queue_arn]
    }
  })

  tags = merge(var.tags, { Name = "${var.project_name}-batch-job-failed" })
}

resource "aws_cloudwatch_event_target" "batch_job_failed_sns" {
  count     = var.batch_job_queue_arn != "" ? 1 : 0
  rule      = aws_cloudwatch_event_rule.batch_job_failed[0].name
  target_id = "send-to-sns"
  arn       = var.dlq_alert_topic_arn

  # Rút gọn sự kiện thành thông báo đọc được, thay vì đẩy nguyên khối JSON.
  # `statusReason` là trường quan trọng nhất: bài học từ sự cố
  # ResourceInitializationError là chỉ biết job FAILED thì chưa đủ — phải thấy
  # được LÝ DO ngay trong cảnh báo, nếu không mỗi lần lại phải tự đi tra.
  input_transformer {
    input_paths = {
      jobName      = "$.detail.jobName"
      jobId        = "$.detail.jobId"
      statusReason = "$.detail.statusReason"
    }

    input_template = "\"Job transcode that bai: <jobName> (id <jobId>). Ly do: <statusReason>\""
  }
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
