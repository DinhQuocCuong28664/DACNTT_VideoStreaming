# ═══════════════════════════════════════════════════
# Module: CloudFront — CDN with OAC (S3 Private)
# ═══════════════════════════════════════════════════

# ── Origin Access Control (S3 completely private) ──
resource "aws_cloudfront_origin_access_control" "s3_oac" {
  name                              = "${var.project_name}-s3-oac"
  description                       = "OAC for HLS Processed Bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── Cache Policy for HLS content ──────────────────
resource "aws_cloudfront_cache_policy" "hls" {
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
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.project_name} HLS Video CDN"
  price_class     = var.price_class

  origin {
    domain_name              = var.processed_bucket_domain_name
    origin_id                = "S3-processed-bucket"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-processed-bucket"
    cache_policy_id        = aws_cloudfront_cache_policy.hls.id
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    # CORS headers for HLS.js
    response_headers_policy_id = aws_cloudfront_response_headers_policy.cors.id
  }

  # Custom error responses
  custom_error_response {
    error_code         = 403
    response_code      = 404
    response_page_path = "/404.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-hls-cdn"
  })
}

# ── CORS Response Headers Policy ──────────────────
resource "aws_cloudfront_response_headers_policy" "cors" {
  name    = "${var.project_name}-cors-hls"
  comment = "CORS headers for HLS.js video player"

  cors_config {
    access_control_allow_credentials = false

    access_control_allow_headers {
      items = ["*"]
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

# ── S3 Bucket Policy: Only CloudFront OAC can read ──
resource "aws_s3_bucket_policy" "processed_cf_only" {
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
            "AWS:SourceArn" = aws_cloudfront_distribution.hls_cdn.arn
          }
        }
      }
    ]
  })
}
