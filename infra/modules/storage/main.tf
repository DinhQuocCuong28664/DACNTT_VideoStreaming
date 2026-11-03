# Buckets of one environment:
#   raw        uploads from browsers (presigned POST or multipart), read by the pipeline
#   processed  HLS output, served only through CloudFront (bucket policy added by the CDN module)
#   work       temporary files of running workflows (chunk results, abort markers)
#   keys       AES-128 keys, readable only by the transcoder and API roles
# All are private, encrypted, and refuse plain HTTP.

data "aws_caller_identity" "current" {}

locals {
  suffix = data.aws_caller_identity.current.account_id
  buckets = {
    raw       = "${var.name}-raw-${local.suffix}"
    processed = "${var.name}-processed-${local.suffix}"
    work      = "${var.name}-work-${local.suffix}"
    keys      = "${var.name}-keys-${local.suffix}"
  }
}

resource "aws_s3_bucket" "this" {
  for_each      = local.buckets
  bucket        = each.value
  force_destroy = var.force_destroy
  tags          = { Name = each.value, Role = each.key }
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each                = aws_s3_bucket.this
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# SSE-S3 rather than a customer-managed KMS key: CloudFront reads every segment through OAC,
# and a KMS key would add a key policy for CloudFront and a KMS request per segment miss. Access
# to the keys bucket is limited by IAM to the transcoder and API roles.
#trivy:ignore:AWS-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Every bucket refuses plain HTTP. The processed bucket also receives the CloudFront read
# statement from the CDN module through var.processed_policy_documents, merged here so the
# bucket has exactly one policy.
data "aws_iam_policy_document" "tls_only" {
  for_each = aws_s3_bucket.this

  source_policy_documents = each.key == "processed" ? var.processed_policy_documents : []

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [each.value.arn, "${each.value.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "tls_only" {
  for_each   = data.aws_iam_policy_document.tls_only
  bucket     = aws_s3_bucket.this[each.key].id
  policy     = each.value.json
  depends_on = [aws_s3_bucket_public_access_block.this]
}

# Browsers upload straight to the raw bucket; multipart needs the ETag of each part.
resource "aws_s3_bucket_cors_configuration" "raw" {
  bucket = aws_s3_bucket.this["raw"].id
  cors_rule {
    allowed_methods = ["POST", "PUT"]
    allowed_origins = var.upload_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# Originals are kept (as YouTube keeps them) for re-encoding, but rarely read after
# processing, so they move to Standard-IA after a month. Sources of deleted videos and
# abandoned drafts are removed by the API and the reconciler, not by age.
resource "aws_s3_bucket_lifecycle_configuration" "raw" {
  bucket = aws_s3_bucket.this["raw"].id
  rule {
    id     = "abort-stale-multipart"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
  rule {
    id     = "originals-to-infrequent-access"
    status = "Enabled"
    filter {
      prefix = "raw/"
    }
    transition {
      days          = var.raw_infrequent_access_days
      storage_class = "STANDARD_IA"
    }
  }
  # Image uploads are copied to the processed bucket within minutes; leftovers are abandoned.
  rule {
    id     = "expire-image-uploads"
    status = "Enabled"
    filter {
      prefix = "images/"
    }
    expiration {
      days = 1
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "work" {
  bucket = aws_s3_bucket.this["work"].id
  rule {
    id     = "expire-work-files"
    status = "Enabled"
    filter {}
    expiration {
      days = var.work_retention_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
