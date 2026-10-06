# ═══════════════════════════════════════════════════
# Module: S3 — Object Storage (Raw + Processed Buckets)
# ═══════════════════════════════════════════════════

# ── Raw Bucket (Video gốc upload) ──────────────────
resource "aws_s3_bucket" "raw" {
  bucket        = "${var.project_name}-raw-bucket"
  force_destroy = var.force_destroy

  tags = merge(var.tags, {
    Name = "${var.project_name}-raw-bucket"
    Role = "Raw Video Storage"
  })
}

resource "aws_s3_bucket_versioning" "raw" {
  bucket = aws_s3_bucket.raw.id
  versioning_configuration {
    status = "Disabled"
  }
}

resource "aws_s3_bucket_public_access_block" "raw" {
  bucket = aws_s3_bucket.raw.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CORS cho Pre-signed URL upload từ Frontend
resource "aws_s3_bucket_cors_configuration" "raw" {
  bucket = aws_s3_bucket.raw.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag", "Content-Length"]
    max_age_seconds = 3000
  }
}

# Lifecycle: Chuyển raw video sang Glacier sau 30 ngày (FinOps)
resource "aws_s3_bucket_lifecycle_configuration" "raw" {
  bucket = aws_s3_bucket.raw.id

  rule {
    id     = "archive-raw-videos"
    status = "Enabled"

    filter {
      prefix = "videos/"
    }

    transition {
      days          = 30
      storage_class = "GLACIER"
    }

    expiration {
      days = 365 # Xóa sau 1 năm
    }
  }

  # Lượt tải multipart bị bỏ dở (đóng tab, mất mạng, trình duyệt sập) để lại các
  # phần đã lên S3 mà không hiện trong danh sách object và không có gì tự dọn,
  # nhưng vẫn bị tính phí lưu trữ. Backend huỷ lượt tải khi người dùng bấm Huỷ và
  # khi bộ đối soát gặp bản nháp quá hạn; luật này là lớp chốt cuối cho các
  # trường hợp không ai kịp gọi. 2 ngày là dư cho mọi lượt tải thật: URL của từng
  # phần chỉ sống vài phút và một lượt tải 20 GB chậm cũng xong trong ngày.
  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {
      prefix = "videos/"
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 2
    }
  }
}

# S3 Event Notification → SQS Queue (trigger transcoding)
resource "aws_s3_bucket_notification" "raw_to_sqs" {
  bucket = aws_s3_bucket.raw.id

  queue {
    queue_arn     = var.sqs_queue_arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "videos/"
  }

  depends_on = [var.sqs_queue_policy_dependency]
}

# ── Processed Bucket (HLS output) ──────────────────
resource "aws_s3_bucket" "processed" {
  bucket        = "${var.project_name}-processed-bucket"
  force_destroy = var.force_destroy

  tags = merge(var.tags, {
    Name = "${var.project_name}-processed-bucket"
    Role = "HLS Processed Output"
  })
}

resource "aws_s3_bucket_versioning" "processed" {
  bucket = aws_s3_bucket.processed.id
  versioning_configuration {
    status = "Disabled"
  }
}

resource "aws_s3_bucket_public_access_block" "processed" {
  bucket = aws_s3_bucket.processed.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = false # CloudFront OAC needs bucket policy
}

# CORS cho HLS.js Player
resource "aws_s3_bucket_cors_configuration" "processed" {
  bucket = aws_s3_bucket.processed.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["Content-Length", "Content-Type"]
    max_age_seconds = 3000
  }
}
