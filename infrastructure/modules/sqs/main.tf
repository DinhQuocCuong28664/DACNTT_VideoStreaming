# ═══════════════════════════════════════════════════
# Module: SQS — Message Queue (Transcode Queue + DLQ)
# ═══════════════════════════════════════════════════

# ── Dead Letter Queue ──────────────────────────────
resource "aws_sqs_queue" "dlq" {
  name                      = "${var.project_name}-transcode-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = merge(var.tags, {
    Name = "${var.project_name}-transcode-dlq"
    Role = "Dead Letter Queue"
  })
}

# ── Main Transcode Queue ──────────────────────────
resource "aws_sqs_queue" "transcode" {
  name                       = "${var.project_name}-transcode-queue"
  visibility_timeout_seconds = 300   # 5 minutes (Heartbeat Pattern extends this)
  message_retention_seconds  = 86400 # 24 hours
  receive_wait_time_seconds  = 20    # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3 # After 3 failures → DLQ
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-transcode-queue"
    Role = "Video Transcoding Queue"
  })
}

# ── Queue Policy: Allow S3 to send event notifications ──
resource "aws_sqs_queue_policy" "allow_s3_events" {
  queue_url = aws_sqs_queue.transcode.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowS3EventNotification"
        Effect    = "Allow"
        Principal = { Service = "s3.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.transcode.arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = var.raw_bucket_arn
          }
        }
      }
    ]
  })
}
