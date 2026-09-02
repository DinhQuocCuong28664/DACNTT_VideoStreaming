# ═══════════════════════════════════════════════════
# Frontend Static Website Hosting — S3 (zelostech.site)
# Bucket name MUST match the apex domain exactly (Hostinger
# ALIAS/ANAME record points at the S3 website endpoint).
# This bucket was created manually outside Terraform;
# imported here so `terraform apply` manages the whole stack.
# ═══════════════════════════════════════════════════

resource "aws_s3_bucket" "frontend" {
  bucket        = "zelostech.site"
  force_destroy = false

  tags = merge(local.common_tags, {
    Name = "zelostech.site"
    Role = "Frontend Static Website"
  })
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  # SPA routing: unknown paths (e.g. /watch/123) fall back to index.html
  # so React Router can handle them client-side.
  error_document {
    key = "index.html"
  }
}

# CORS cho việc tải ảnh đại diện thẳng từ trình duyệt (Pre-signed PUT URL) —
# bucket này vốn chỉ phục vụ GET (host static site), giờ tái dùng thêm cho
# avatar nên cần mở PUT. Không mở "*" cho allowed_origins, giữ đúng danh sách
# origin đã dùng cho 2 bucket video (raw/processed) để nhất quán.
resource "aws_s3_bucket_cors_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
      }
    ]
  })

  # Bucket must have a public-access-block that allows public policies
  # before this policy can be attached.
  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

output "frontend_bucket_website_endpoint" {
  value = aws_s3_bucket_website_configuration.frontend.website_endpoint
}

# ═══════════════════════════════════════════════════
# HTTPS for zelostech.site
# S3 Static Website Hosting is HTTP-only by design (AWS
# limitation, not fixable via bucket config) — CloudFront in
# front of it is the only way to serve this domain over HTTPS.
# ═══════════════════════════════════════════════════

# ── ACM Certificate (must be in us-east-1 for CloudFront) ──
# provider = account_a_us_east_1 (khong phai us_east_1 cua account B) vi
# distribution ben duoi chay tren account A — CloudFront khong the tham
# chieu chung chi ACM tu mot account khac.
resource "aws_acm_certificate" "frontend" {
  provider    = aws.account_a_us_east_1
  domain_name = "zelostech.site"
  # cdn.zelostech.site: alias cho CloudFront video CDN (module.cloudfront) —
  # Signed Cookie cần CDN và app dùng chung parent domain, dùng chung luôn
  # chứng chỉ này thay vì xin riêng.
  subject_alternative_names = ["www.zelostech.site", "cdn.zelostech.site"]
  validation_method         = "DNS"

  tags = merge(local.common_tags, {
    Name = "zelostech.site-cert"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# Apply with -target=aws_acm_certificate.frontend first, read this output,
# add EACH CNAME on Cloudflare (DNS management moved there — Hostinger now
# only holds the registrar/nameservers), THEN run a normal apply —
# aws_acm_certificate_validation below blocks until AWS sees all of them.
# 2 entries now (apex + www), not 1 — dung list thay vi tolist(...)[0].
output "acm_validation_record" {
  description = "Add EACH of these as a CNAME record on Cloudflare DNS to validate the ACM certificate"
  value = [
    for o in aws_acm_certificate.frontend.domain_validation_options : {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  ]
}

resource "aws_acm_certificate_validation" "frontend" {
  provider        = aws.account_a_us_east_1
  certificate_arn = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [
    for o in aws_acm_certificate.frontend.domain_validation_options : o.resource_record_name
  ]
}

# ── CloudFront Distribution (S3 website endpoint as origin) ──
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "frontend" {
  provider            = aws.account_a
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name}-${var.environment}-frontend-cdn"
  default_root_object = "index.html"
  # Giữ cùng price class với distribution video — xem ghi chú đầy đủ ở
  # module.cloudfront trong main.tf. Distribution này từng chịu đúng vấn đề đó
  # (đo được PoP TLV55, Tel Aviv, khi truy cập từ Việt Nam). Ảnh hưởng ở đây là
  # tới thời gian tải trang chứ không phải TTFF, nhưng nguyên nhân là một, nên
  # để hai distribution lệch nhau chỉ tạo ra một khác biệt không ai giải thích
  # được về sau.
  price_class = "PriceClass_All"
  aliases     = ["zelostech.site", "www.zelostech.site"]

  origin {
    domain_name = aws_s3_bucket_website_configuration.frontend.website_endpoint
    origin_id   = "S3-frontend-website"

    # S3 *website* endpoints only ever serve HTTP — CloudFront fetches
    # over HTTP here and re-terminates TLS for the viewer below.
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-frontend-website"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  # SPA fallback: React Router client-side routes (e.g. /watch/123)
  # 404/403 at the S3 origin, so serve index.html and let the app route.
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
    acm_certificate_arn      = aws_acm_certificate_validation.frontend.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-frontend-cdn"
  })
}

output "frontend_cloudfront_domain" {
  description = "Point the Cloudflare CNAME/A record for zelostech.site here instead of the S3 website endpoint"
  value       = aws_cloudfront_distribution.frontend.domain_name
}
