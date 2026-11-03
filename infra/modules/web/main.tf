# Hosting of the web app (the Vite build of web/). The files sit in a private bucket in
# account B; CloudFront in account A (account B may not create distributions) reads them
# through OAC, like the media CDN.
#
#   assets/*  hashed file names: cached for a year
#   embed/*   the iframe player: may be framed by any site
#   default   index.html and top-level files: short cache; a CloudFront Function sends
#             app routes (paths without a file extension) to /index.html
#
# Every page except embed/* refuses framing. The certificate is issued here and validated on
# Cloudflare, or an existing one is given (production reuses the certificate of the old stack).
# attach_hosts = false builds the distribution without its hosts, so they can be moved over
# from the old distribution at cutover (docs/ops/cutover.md).

terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.account_a, aws.us_east_1]
    }
    cloudflare = {
      source = "cloudflare/cloudflare"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  bucket = "${var.name}-web-${data.aws_caller_identity.current.account_id}"
  hosts  = concat([var.host], var.redirect_hosts)
  # A given certificate skips issuing and validating a new one.
  issue_certificate = var.certificate_arn == null
}

# ── Bucket (account B) ──────────────────────────────────────────────

#trivy:ignore:AVD-AWS-0089 -- access logging would need another bucket; CloudFront metrics are enough
resource "aws_s3_bucket" "web" {
  bucket        = local.bucket
  force_destroy = var.force_destroy
  tags          = { Name = local.bucket, Role = "web" }
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

#trivy:ignore:AVD-AWS-0132 -- SSE-S3 is enough for public web files; a KMS key adds cost for no gain
resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Versions let a bad deploy be rolled back; old versions expire after a month.
resource "aws_s3_bucket_versioning" "web" {
  bucket = aws_s3_bucket.web.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
  depends_on = [aws_s3_bucket_versioning.web]
}

data "aws_iam_policy_document" "web" {
  statement {
    sid       = "CloudFrontReadsWeb"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
  statement {
    sid       = "TlsOnly"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.web.arn, "${aws_s3_bucket.web.arn}/*"]
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

resource "aws_s3_bucket_policy" "web" {
  bucket     = aws_s3_bucket.web.id
  policy     = data.aws_iam_policy_document.web.json
  depends_on = [aws_s3_bucket_public_access_block.web]
}

# ── CloudFront (account A) ──────────────────────────────────────────

resource "aws_cloudfront_origin_access_control" "web" {
  provider                          = aws.account_a
  name                              = "${var.name}-web"
  description                       = "Read access of ${var.name} CloudFront to the web bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "spa" {
  provider = aws.account_a
  name     = "${var.name}-web-spa"
  runtime  = "cloudfront-js-2.0"
  comment  = "Serves index.html for app routes"
  publish  = true
  code     = file("${path.module}/spa-rewrite.js")
}

# Short cache for index.html and other unhashed files, so a deploy shows within a minute.
resource "aws_cloudfront_cache_policy" "short" {
  provider    = aws.account_a
  name        = "${var.name}-web-short"
  comment     = "index.html and top-level files"
  default_ttl = 60
  max_ttl     = 300
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

data "aws_cloudfront_cache_policy" "optimized" {
  provider = aws.account_a
  name     = "Managed-CachingOptimized"
}

resource "aws_cloudfront_response_headers_policy" "app" {
  provider = aws.account_a
  name     = "${var.name}-web-app"
  comment  = "Security headers; no framing"

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
      override                   = true
    }
    content_security_policy {
      content_security_policy = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
      override                = true
    }
  }
}

resource "aws_cloudfront_response_headers_policy" "embed" {
  provider = aws.account_a
  name     = "${var.name}-web-embed"
  comment  = "Security headers; any site may frame the embed player"

  security_headers_config {
    content_type_options {
      override = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      override                   = true
    }
    content_security_policy {
      content_security_policy = "frame-ancestors *; object-src 'none'; base-uri 'self'"
      override                = true
    }
  }
}

resource "aws_acm_certificate" "web" {
  count                     = local.issue_certificate ? 1 : 0
  provider                  = aws.us_east_1
  domain_name               = var.host
  subject_alternative_names = var.redirect_hosts
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "cloudflare_dns_record" "validation" {
  for_each = local.issue_certificate ? { for o in aws_acm_certificate.web[0].domain_validation_options : o.domain_name => o } : {}
  zone_id  = var.cloudflare_zone_id
  name     = trimsuffix(each.value.resource_record_name, ".")
  type     = each.value.resource_record_type
  content  = trimsuffix(each.value.resource_record_value, ".")
  ttl      = 1
  proxied  = false
  comment  = "ACM validation of ${var.host} (Terraform, v2)"
}

resource "aws_acm_certificate_validation" "web" {
  count                   = local.issue_certificate ? 1 : 0
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.web[0].arn
  validation_record_fqdns = [for r in cloudflare_dns_record.validation : r.name]
}

#trivy:ignore:AVD-AWS-0010 -- access logs would need a log bucket in account A; CloudFront metrics are enough for this project
#trivy:ignore:AVD-AWS-0011 -- WAF costs a monthly fee; the site serves static files and the API has its own limits
resource "aws_cloudfront_distribution" "web" {
  provider            = aws.account_a
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  comment             = "${var.name} web"
  price_class         = var.price_class
  aliases             = var.attach_hosts ? local.hosts : []
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "web"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  default_cache_behavior {
    target_origin_id           = "web"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = aws_cloudfront_cache_policy.short.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.app.id
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn
    }
  }

  ordered_cache_behavior {
    path_pattern               = "assets/*"
    target_origin_id           = "web"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.app.id
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true
  }

  ordered_cache_behavior {
    path_pattern               = "embed/*"
    target_origin_id           = "web"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = aws_cloudfront_cache_policy.short.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.embed.id
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = local.issue_certificate ? aws_acm_certificate_validation.web[0].certificate_arn : var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# DNS only (not proxied): CloudFront terminates TLS with its own certificate.
resource "cloudflare_dns_record" "host" {
  count   = var.attach_hosts ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = var.host
  type    = "CNAME"
  content = aws_cloudfront_distribution.web.domain_name
  ttl     = 300
  proxied = false
  comment = "Web app of ${var.name} (Terraform, v2)"
}

resource "cloudflare_dns_record" "redirect" {
  for_each = var.attach_hosts ? toset(var.redirect_hosts) : toset([])
  zone_id  = var.cloudflare_zone_id
  name     = each.key
  type     = "CNAME"
  content  = aws_cloudfront_distribution.web.domain_name
  ttl      = 300
  proxied  = false
  comment  = "Redirects to ${var.host} (Terraform, v2)"
}

moved {
  from = aws_acm_certificate.web
  to   = aws_acm_certificate.web[0]
}

moved {
  from = aws_acm_certificate_validation.web
  to   = aws_acm_certificate_validation.web[0]
}

moved {
  from = cloudflare_dns_record.host
  to   = cloudflare_dns_record.host[0]
}
