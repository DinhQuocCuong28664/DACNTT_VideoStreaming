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

# ═══════════════════════════════════════════════════
# Canary kiểm tra sức khoẻ API từ bên ngoài
# ═══════════════════════════════════════════════════
#
# Trước đây toàn bộ hệ thống chỉ có hai alarm, cả hai trên metric của SQS.
# Không có gì theo dõi backend — đúng thành phần mà mọi thứ khác phụ thuộc vào.
#
# Khoảng trống đó đã được chứng minh bằng một sự cố thật: khi máy chủ chuyển
# sang Elastic IP, bản ghi DNS còn trỏ vào địa chỉ đã bị thu hồi và toàn bộ API
# trả 522 trong nhiều phút. Instance vẫn chạy, mọi kiểm tra ở tầng hạ tầng đều
# xanh, và không một cảnh báo nào phát ra; sự cố chỉ được phát hiện vì tình cờ
# có người gọi thử.
#
# Bài học là kiểm tra phải đi qua đúng đường của người dùng. StatusCheckFailed
# của EC2 (khai báo bên dưới) chỉ nói instance còn sống, không nói API còn phục
# vụ được hay không.
#
# Chọn tự dựng bằng Lambda thay vì Route 53 health check là quyết định về chi
# phí: Route 53 tính khoảng 1,75 USD/tháng cho endpoint ngoài AWS có HTTPS,
# trong khi cách này nằm gọn trong hạn mức miễn phí (1 triệu lần gọi Lambda,
# 10 custom metric, 10 alarm). Đánh đổi là chỉ kiểm tra từ một region thay vì
# nhiều vị trí toàn cầu, nên có thể báo nhầm khi mạng ở region đó trục trặc.

data "archive_file" "health_check" {
  count       = var.health_check_url != "" ? 1 : 0
  type        = "zip"
  source_dir  = "${path.module}/src"
  output_path = "${path.module}/dist/health-check.zip"
}

resource "aws_iam_role" "health_check" {
  count = var.health_check_url != "" ? 1 : 0
  name  = "${var.project_name}-health-check-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = merge(var.tags, { Name = "${var.project_name}-health-check-role" })
}

resource "aws_iam_role_policy" "health_check" {
  count = var.health_check_url != "" ? 1 : 0
  name  = "${var.project_name}-health-check-policy"
  role  = aws_iam_role.health_check[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # PutMetricData không hỗ trợ giới hạn theo tài nguyên; thu hẹp bằng
        # điều kiện trên namespace để vai trò này không ghi được vào namespace
        # khác.
        Effect   = "Allow"
        Action   = "cloudwatch:PutMetricData"
        Resource = "*"
        Condition = {
          StringEquals = { "cloudwatch:namespace" = var.health_metric_namespace }
        }
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_lambda_function" "health_check" {
  count            = var.health_check_url != "" ? 1 : 0
  function_name    = "${var.project_name}-health-check"
  description      = "Gọi API qua tên miền công khai theo lịch và phát metric ApiHealthy"
  role             = aws_iam_role.health_check[0].arn
  handler          = "health-check.handler"
  runtime          = "nodejs22.x"
  timeout          = 60
  memory_size      = 128
  filename         = data.archive_file.health_check[0].output_path
  source_code_hash = data.archive_file.health_check[0].output_base64sha256

  environment {
    variables = {
      HEALTH_CHECK_URL = var.health_check_url
      METRIC_NAMESPACE = var.health_metric_namespace
    }
  }

  tags = merge(var.tags, { Name = "${var.project_name}-health-check" })
}

resource "aws_cloudwatch_event_rule" "health_check_schedule" {
  count               = var.health_check_url != "" ? 1 : 0
  name                = "${var.project_name}-health-check-schedule"
  description         = "Chạy canary kiểm tra API mỗi 5 phút"
  schedule_expression = "rate(5 minutes)"

  tags = merge(var.tags, { Name = "${var.project_name}-health-check-schedule" })
}

resource "aws_cloudwatch_event_target" "health_check" {
  count     = var.health_check_url != "" ? 1 : 0
  rule      = aws_cloudwatch_event_rule.health_check_schedule[0].name
  target_id = "health-check-lambda"
  arn       = aws_lambda_function.health_check[0].arn
}

resource "aws_lambda_permission" "health_check_events" {
  count         = var.health_check_url != "" ? 1 : 0
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.health_check[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.health_check_schedule[0].arn
}

# Alarm bám vào metric do canary phát ra.
#
# Chu kỳ 900s trong khi canary chạy 5 phút/lần là có chủ đích: mỗi chu kỳ nhận
# khoảng ba điểm dữ liệu, nên một lần chạy trễ hay trượt không tạo ra chu kỳ
# trống. Cấu hình đầu tiên đặt chu kỳ 300s bằng đúng nhịp canary, tức mỗi chu kỳ
# chỉ có duy nhất một điểm và không có biên dự phòng nào — nó báo động giả ngay
# lần đầu triển khai, khi mới chỉ có một điểm dữ liệu tồn tại. Chính comment
# trong mã canary nói rằng báo động giả là kiểu hỏng tệ nhất, nên để lại cấu
# hình đó thì mâu thuẫn.
#
# statistic = "Minimum" nghĩa là chỉ cần MỘT lần kiểm tra trong cửa sổ thất bại
# (sau ba lần thử lại nội bộ của nó) là báo động — lọc nhiễu nằm ở tầng thử lại
# bên trong canary, không phải ở đây.
#
# treat_missing_data = "breaching" là điểm quan trọng: nếu chính canary hỏng và
# ngừng phát metric, im lặng phải được hiểu là có vấn đề chứ không phải là ổn.
# Một bộ giám sát hỏng mà không ai biết thì tệ hơn là không có giám sát.
resource "aws_cloudwatch_metric_alarm" "api_unhealthy" {
  count               = var.health_check_url != "" ? 1 : 0
  alarm_name          = "${var.project_name}-api-unhealthy"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApiHealthy"
  namespace           = var.health_metric_namespace
  period              = 900
  statistic           = "Minimum"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_description   = "ALERT: API khong phan hoi qua ten mien cong khai (${var.health_check_url}). Kiem tra nginx, pm2, va ban ghi DNS."
  alarm_actions       = [var.dlq_alert_topic_arn]
  ok_actions          = [var.dlq_alert_topic_arn]

  tags = merge(var.tags, { Name = "${var.project_name}-api-unhealthy" })
}

# Kiểm tra ở tầng hạ tầng, bổ sung chứ không thay thế canary bên trên: nó bắt
# được máy chủ chết hoặc phần cứng hỏng, nhưng hoàn toàn không thấy được trường
# hợp instance khoẻ mà dịch vụ không phục vụ được.
resource "aws_cloudwatch_metric_alarm" "backend_status_check" {
  count               = var.backend_instance_id != "" ? 1 : 0
  alarm_name          = "${var.project_name}-backend-status-check-failed"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "ALERT: EC2 backend truot status check (loi instance hoac ha tang ben duoi)"
  alarm_actions       = [var.dlq_alert_topic_arn]
  ok_actions          = [var.dlq_alert_topic_arn]

  dimensions = {
    InstanceId = var.backend_instance_id
  }

  tags = merge(var.tags, { Name = "${var.project_name}-backend-status-check" })
}
