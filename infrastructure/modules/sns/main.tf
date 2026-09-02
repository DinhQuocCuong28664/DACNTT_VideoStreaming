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

# Cho phép EventBridge đăng thông báo lên topic cảnh báo.
#
# CloudWatch Alarm trong cùng tài khoản đăng được lên SNS mà không cần chính
# sách tường minh, nhưng EventBridge thì KHÔNG — thiếu quyền này, rule cảnh báo
# job Batch thất bại sẽ khớp sự kiện rồi âm thầm không gửi được gì, đúng kiểu
# hỏng khó phát hiện nhất vì mọi thứ trông như đã cấu hình xong.
#
# Khai báo chính sách sẽ THAY THẾ hoàn toàn chính sách mặc định, nên câu lệnh
# cho phép chủ tài khoản phải được giữ lại tường minh ở đây; bỏ nó đi là cắt
# luôn đường đăng thông báo của các alarm đang chạy.
data "aws_caller_identity" "current" {}

resource "aws_sns_topic_policy" "dlq_alert" {
  arn = aws_sns_topic.dlq_alert.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowAccountOwnerFullAccess"
        Effect    = "Allow"
        Principal = { AWS = data.aws_caller_identity.current.account_id }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.dlq_alert.arn
      },
      {
        Sid       = "AllowEventBridgePublish"
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.dlq_alert.arn
      },
      {
        Sid       = "AllowCloudWatchAlarmsPublish"
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.dlq_alert.arn
      }
    ]
  })
}

# Email subscription for admin alerts
resource "aws_sns_topic_subscription" "admin_email" {
  count     = var.admin_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.dlq_alert.arn
  protocol  = "email"
  endpoint  = var.admin_email
}
