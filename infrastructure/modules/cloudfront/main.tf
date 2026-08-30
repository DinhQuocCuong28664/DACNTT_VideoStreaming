# ═══════════════════════════════════════════════════
# Module: CloudFront — CDN with OAC (S3 Private)
# ═══════════════════════════════════════════════════
#
# Toàn bộ tài nguyên CloudFront nằm trên `aws.account_a` — một AWS account
# KHÁC với account đang giữ S3/Batch/Lambda (account mặc định), vì account
# mặc định đang bị chặn tạo CloudFront Distribution (AccessDenied, chờ AWS
# Support duyệt ticket). Riêng bucket policy vẫn phải chạy bằng provider mặc
# định vì chỉ chủ bucket (account B) mới có quyền PutBucketPolicy cho bucket
# của chính mình — bucket policy dùng Service Principal + điều kiện
# AWS:SourceArn nên không quan tâm distribution thuộc account nào.
terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.account_a]
    }
  }
}

# ── Origin Access Control (S3 completely private) ──
resource "aws_cloudfront_origin_access_control" "s3_oac" {
  provider                          = aws.account_a
  name                              = "${var.project_name}-s3-oac"
  description                       = "OAC for HLS Processed Bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── Trusted Key Group cho Signed Cookies ──────────
#
# CloudFront dùng khóa công khai trong Key Group để xác thực chữ ký của Signed
# Cookie. Nhờ đó, ngay cả khi một người dùng lấy được đường dẫn `.m3u8` hoặc
# `.ts`, họ vẫn không thể tải nội dung nếu không có bộ cookie hợp lệ do Backend
# cấp sau khi đã kiểm tra quyền truy cập video.
#
# Đây là lớp bảo vệ mà Origin Access Control (OAC) không thể đảm nhiệm: OAC chỉ
# ngăn truy cập trực tiếp vào S3, không kiểm soát được ai có quyền xem nội dung
# thông qua CloudFront.
resource "aws_cloudfront_public_key" "signing" {
  provider    = aws.account_a
  count       = var.enable_signed_urls ? 1 : 0
  name        = "${var.project_name}-signing-key"
  comment     = "Public key dùng để xác thực CloudFront Signed Cookie"
  encoded_key = var.signing_public_key_pem
}

resource "aws_cloudfront_key_group" "signing" {
  provider = aws.account_a
  count    = var.enable_signed_urls ? 1 : 0
  name     = "${var.project_name}-signing-key-group"
  items    = [aws_cloudfront_public_key.signing[0].id]

  lifecycle {
    precondition {
      condition     = !var.enable_signed_urls || length(trimspace(var.signing_public_key_pem)) > 0
      error_message = "Khi bật enable_signed_urls, biến signing_public_key_pem không được để trống."
    }
  }
}

# ── Cache Policy for HLS content ──────────────────
resource "aws_cloudfront_cache_policy" "hls" {
  provider    = aws.account_a
  name        = "${var.project_name}-hls-cache-policy"
  comment     = "Cache policy for HLS segments and manifests"
  default_ttl = 86400  # 24 hours (segments never change after transcode)
  max_ttl     = 604800 # 7 days
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# ── CloudFront Distribution ──────────────────────
resource "aws_cloudfront_distribution" "hls_cdn" {
  provider        = aws.account_a
  count           = var.enable_cloudfront ? 1 : 0
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.project_name} HLS Video CDN"
  price_class     = var.price_class

  origin {
    domain_name              = var.processed_bucket_domain_name
    origin_id                = "S3-processed-bucket"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  aliases = var.aliases

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-processed-bucket"
    cache_policy_id        = aws_cloudfront_cache_policy.hls.id
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    # Khi bật, CloudFront từ chối (HTTP 403) mọi yêu cầu không kèm Signed Cookie
    # hợp lệ. Danh sách rỗng đồng nghĩa với việc phân phối công khai như cũ.
    trusted_key_groups = var.enable_signed_urls ? [aws_cloudfront_key_group.signing[0].id] : []

    # CORS headers for HLS.js
    response_headers_policy_id = aws_cloudfront_response_headers_policy.cors.id
  }

  # Khi bật Signed Cookie, mã 403 mang ý nghĩa "không có quyền truy cập" và cần
  # được giữ nguyên để trình phát cũng như người kiểm thử phân biệt được với lỗi
  # "không tìm thấy tệp". Vì vậy chỉ ánh xạ 403 sang 404 khi chưa bật cơ chế ký.
  dynamic "custom_error_response" {
    for_each = var.enable_signed_urls ? [] : [1]
    content {
      error_code         = 403
      response_code      = 404
      response_page_path = "/404.html"
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Dùng chứng chỉ ACM khi có tên miền tùy chỉnh, ngược lại dùng chứng chỉ mặc
  # định của CloudFront. Signed Cookie yêu cầu CDN và ứng dụng cùng parent domain
  # nên môi trường production bắt buộc phải cấu hình `aliases`.
  viewer_certificate {
    cloudfront_default_certificate = length(var.aliases) == 0
    acm_certificate_arn            = length(var.aliases) > 0 ? var.acm_certificate_arn : null
    ssl_support_method             = length(var.aliases) > 0 ? "sni-only" : null
    minimum_protocol_version       = length(var.aliases) > 0 ? "TLSv1.2_2021" : null
  }

  lifecycle {
    precondition {
      condition     = length(var.aliases) == 0 || length(trimspace(var.acm_certificate_arn)) > 0
      error_message = "Khi khai báo aliases, biến acm_certificate_arn (chứng chỉ tại us-east-1) là bắt buộc."
    }
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-hls-cdn"
  })
}

# ── CORS Response Headers Policy ──────────────────
resource "aws_cloudfront_response_headers_policy" "cors" {
  provider = aws.account_a
  name     = "${var.project_name}-cors-hls"
  comment  = "CORS headers for HLS.js video player"

  cors_config {
    # Khi bật Signed Cookie, trình duyệt chỉ gửi kèm cookie tới CDN nếu phản hồi
    # khai báo `Access-Control-Allow-Credentials: true`. Theo chuẩn CORS, chế độ
    # này không cho phép dùng ký tự đại diện `*` cho Origin, nên danh sách
    # `cors_allowed_origins` bắt buộc phải liệt kê tường minh từng tên miền.
    access_control_allow_credentials = var.enable_signed_urls

    access_control_allow_headers {
      items = var.enable_signed_urls ? ["Origin", "Range", "Accept", "Content-Type"] : ["*"]
    }

    access_control_allow_methods {
      items = ["GET", "HEAD", "OPTIONS"]
    }

    access_control_allow_origins {
      items = var.cors_allowed_origins
    }

    access_control_max_age_sec = 3600
    origin_override            = true
  }
}

# ── S3 Bucket Policy: Only CloudFront OAC can read when CloudFront enabled ──
# Cố ý KHÔNG dùng provider = aws.account_a: bucket này thuộc account B (mặc
# định), chỉ chủ bucket mới PutBucketPolicy được cho chính nó dù distribution
# nằm ở account A khác.
resource "aws_s3_bucket_policy" "processed_cf_only" {
  count  = var.enable_cloudfront ? 1 : 0
  bucket = var.processed_bucket_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontOAC"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${var.processed_bucket_arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.hls_cdn[0].arn
          }
        }
      }
    ]
  })
}
