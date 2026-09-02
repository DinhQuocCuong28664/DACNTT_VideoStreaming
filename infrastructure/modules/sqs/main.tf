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
  name = "${var.project_name}-transcode-queue"
  # 300s: phai >= 6 lan timeout cua Lambda job submitter (30s) theo khuyen nghi
  # cua AWS cho event source mapping. Ghi chu cu o day noi Heartbeat Pattern se
  # gia han gia tri nay — dieu do chi dung voi che do `worker` cua transcoder,
  # von khong duoc dung khi trien khai. Tren duong that, message do Lambda tieu
  # thu va bien mat ngay khi job duoc nop, nen khong co gi gia han no ca.
  visibility_timeout_seconds = 300
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
