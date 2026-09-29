# ═══════════════════════════════════════════════════
# Staging — frontend (S3 website + CloudFront ở account A) và DNS trên Cloudflare
#
# Giống environments/dev/frontend.tf, trừ hai điểm: tên miền là
# staging.zelostech.site / cdn-staging.zelostech.site, và mọi bản ghi DNS (kể
# cả bản ghi xác thực chứng chỉ ACM) do Terraform tạo qua provider Cloudflare
# thay vì thêm tay.
# ═══════════════════════════════════════════════════

resource "aws_s3_bucket" "frontend" {
  bucket        = "${local.prefix}-frontend"
  force_destroy = true
  tags          = merge(local.common_tags, { Name = "${local.prefix}-frontend" })
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  index_document {
    suffix = "index.html"
  }
  error_document {
    key = "index.html"
  }
}

# Ảnh đại diện tải thẳng từ trình duyệt bằng presigned POST (xem
# backend/src/services/s3Service.js).
resource "aws_s3_bucket_cors_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["POST"]
    allowed_origins = [local.frontend_url]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

# Website endpoint của S3 chỉ phục vụ được object công khai, như ở production.
# trivy:ignore:AWS-0086 trivy:ignore:AWS-0087 trivy:ignore:AWS-0091 trivy:ignore:AWS-0093
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadGetObject"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# ── Chứng chỉ ACM (us-east-1, account A) cho frontend và CDN video ──
resource "aws_acm_certificate" "staging" {
  provider                  = aws.account_a_us_east_1
  domain_name               = local.frontend_domain
  subject_alternative_names = [local.cdn_domain]
  validation_method         = "DNS"
  tags                      = merge(local.common_tags, { Name = "${local.frontend_domain}-cert" })

  lifecycle {
    create_before_destroy = true
  }
}

resource "cloudflare_dns_record" "acm_validation" {
  for_each = {
    for o in aws_acm_certificate.staging.domain_validation_options : o.domain_name => o
  }

  zone_id = var.cloudflare_zone_id
  name    = trimsuffix(each.value.resource_record_name, ".")
  type    = each.value.resource_record_type
  content = trimsuffix(each.value.resource_record_value, ".")
  ttl     = 1
  proxied = false
  comment = "ACM validation (staging, Terraform)"
}

resource "aws_acm_certificate_validation" "staging" {
  provider                = aws.account_a_us_east_1
  certificate_arn         = aws_acm_certificate.staging.arn
  validation_record_fqdns = [for r in cloudflare_dns_record.acm_validation : r.name]
}

# ── Header bảo mật (xem ghi chú đầy đủ ở environments/dev/frontend.tf) ──
locals {
  frontend_permissions_policy = join(", ", [
    "accelerometer=()",
    "bluetooth=()",
    "camera=()",
    "display-capture=()",
    "geolocation=()",
    "gyroscope=()",
    "hid=()",
    "magnetometer=()",
    "microphone=()",
    "midi=()",
    "payment=()",
    "serial=()",
    "usb=()",
  ])

  frontend_csp = join("; ", [
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com/gsi/client https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://${local.cdn_domain} https://s3.ap-southeast-1.amazonaws.com https://*.s3.ap-southeast-1.amazonaws.com https://*.googleusercontent.com",
    "media-src 'self' blob: https://${local.cdn_domain}",
    "connect-src 'self' https://${local.api_domain} https://${local.cdn_domain} https://s3.ap-southeast-1.amazonaws.com https://*.s3.ap-southeast-1.amazonaws.com https://accounts.google.com/gsi/ https://cloudflareinsights.com",
    "worker-src 'self' blob:",
    "frame-src https://accounts.google.com/gsi/",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ])
}

resource "aws_cloudfront_response_headers_policy" "frontend_security" {
  provider = aws.account_a
  name     = "${local.prefix}-frontend-security-headers"
  comment  = "nosniff, DENY, HSTS, Permissions-Policy; CSP report-only"

  security_headers_config {
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      preload                    = false
      override                   = true
    }
  }

  custom_headers_config {
    items {
      header   = "Content-Security-Policy-Report-Only"
      value    = local.frontend_csp
      override = true
    }
    items {
      header   = "Permissions-Policy"
      value    = local.frontend_permissions_policy
      override = true
    }
  }
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "frontend" {
  provider            = aws.account_a
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.prefix}-frontend-cdn"
  default_root_object = "index.html"
  price_class         = "PriceClass_200"
  aliases             = [local.frontend_domain]

  origin {
    domain_name = aws_s3_bucket_website_configuration.frontend.website_endpoint
    origin_id   = "S3-frontend-website"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only" # website endpoint của S3 chỉ có HTTP
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "S3-frontend-website"
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.frontend_security.id
  }

  # SPA: route phía client (vd. /watch/123) không có object trên S3.
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.staging.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-frontend-cdn" })
}

# ── DNS: giống cách production đang cấu hình ──
# Frontend proxied qua Cloudflare. CDN video DNS-only: Signed Cookie phải tới
# thẳng CloudFront, như cdn.zelostech.site.
resource "cloudflare_dns_record" "frontend" {
  zone_id = var.cloudflare_zone_id
  name    = local.frontend_domain
  type    = "CNAME"
  content = aws_cloudfront_distribution.frontend.domain_name
  ttl     = 1
  proxied = true
  comment = "Staging frontend (Terraform)"
}

resource "cloudflare_dns_record" "cdn" {
  zone_id = var.cloudflare_zone_id
  name    = local.cdn_domain
  type    = "CNAME"
  content = module.cloudfront.distribution_domain_name
  ttl     = 1
  proxied = false
  comment = "Staging video CDN (Terraform)"
}
