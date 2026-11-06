# CloudFront for the processed bucket (docs/ARCHITECTURE.md §5.5). The distribution is created
# with the `aws.cdn` provider and the certificate with `aws.us_east_1`; the bucket only trusts
# this distribution through the OAC read statement this module returns. While a distribution is
# being replaced (docs/ops/cdn-to-b.md), transition_reader_arns lets the old one read as well.
#
#   videos/*  signed: a custom policy with a wildcard path per video (query parameters), so the
#             cache key ignores query strings and every viewer shares cached segments
#   images/*  public: avatars and banners screened before upload
#
# The certificate is issued here and validated on Cloudflare, or an existing one is given.
# attach_host = false builds the distribution without its host, so the host can be moved over
# from the old distribution at cutover (docs/ops/cutover.md).

terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.cdn, aws.us_east_1]
    }
    cloudflare = {
      source = "cloudflare/cloudflare"
    }
  }
}

locals {
  issue_certificate = var.certificate_arn == null
}

resource "aws_cloudfront_origin_access_control" "processed" {
  provider                          = aws.cdn
  name                              = "${var.name}-processed"
  description                       = "Read access of ${var.name} CloudFront to the processed bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_public_key" "signing" {
  provider    = aws.cdn
  name        = "${var.name}-signing"
  comment     = "Verifies playback policies signed by the ${var.name} API"
  encoded_key = var.signing_public_key_pem
}

resource "aws_cloudfront_key_group" "signing" {
  provider = aws.cdn
  name     = "${var.name}-signing"
  items    = [aws_cloudfront_public_key.signing.id]
}

# Segments and playlists never change once published (a new upload is a new version path).
resource "aws_cloudfront_cache_policy" "media" {
  provider    = aws.cdn
  name        = "${var.name}-media"
  comment     = "No query strings, cookies or headers in the key: signatures differ per viewer"
  default_ttl = 86400
  max_ttl     = 31536000
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

# hls.js fetches with XHR from the web origins; no cookies, so no credentials.
resource "aws_cloudfront_response_headers_policy" "cors" {
  provider = aws.cdn
  name     = "${var.name}-cors"
  comment  = "CORS for the web player"

  cors_config {
    access_control_allow_credentials = false
    access_control_allow_headers {
      items = ["Range", "Origin", "Accept"]
    }
    access_control_allow_methods {
      items = ["GET", "HEAD", "OPTIONS"]
    }
    access_control_allow_origins {
      items = var.web_origins
    }
    access_control_expose_headers {
      items = ["Content-Length", "Content-Range"]
    }
    access_control_max_age_sec = 3600
    origin_override            = true
  }

  security_headers_config {
    content_type_options {
      override = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      override                   = true
    }
  }
}

# ── Certificate (us-east-1), validated on Cloudflare ──

resource "aws_acm_certificate" "cdn" {
  count             = local.issue_certificate ? 1 : 0
  provider          = aws.us_east_1
  domain_name       = var.host
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "cloudflare_dns_record" "validation" {
  for_each = local.issue_certificate ? { for o in aws_acm_certificate.cdn[0].domain_validation_options : o.domain_name => o } : {}
  zone_id  = var.cloudflare_zone_id
  name     = trimsuffix(each.value.resource_record_name, ".")
  type     = each.value.resource_record_type
  content  = trimsuffix(each.value.resource_record_value, ".")
  ttl      = 1
  proxied  = false
  comment  = "ACM validation of ${var.host} (Terraform, v2)"
}

resource "aws_acm_certificate_validation" "cdn" {
  count                   = local.issue_certificate ? 1 : 0
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.cdn[0].arn
  validation_record_fqdns = [for r in cloudflare_dns_record.validation : r.name]
}

# ── Distribution ──────────────────────────────────────────────────────

#trivy:ignore:AVD-AWS-0010 -- access logs would need a log bucket; CloudFront metrics are enough for this project
#trivy:ignore:AVD-AWS-0011 -- WAF costs a monthly fee; playback is already gated by signed policies
resource "aws_cloudfront_distribution" "this" {
  provider        = aws.cdn
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  comment         = "${var.name} media"
  price_class     = var.price_class
  aliases         = var.attach_host ? [var.host] : []

  origin {
    domain_name              = var.processed_bucket_regional_domain_name
    origin_id                = "processed"
    origin_access_control_id = aws_cloudfront_origin_access_control.processed.id
  }

  # Everything not matched below needs a valid signature.
  default_cache_behavior {
    target_origin_id           = "processed"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = aws_cloudfront_cache_policy.media.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.cors.id
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true
    trusted_key_groups         = [aws_cloudfront_key_group.signing.id]
  }

  ordered_cache_behavior {
    path_pattern               = "images/*"
    target_origin_id           = "processed"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = aws_cloudfront_cache_policy.media.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.cors.id
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = local.issue_certificate ? aws_acm_certificate_validation.cdn[0].certificate_arn : var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# DNS only (not proxied): CloudFront terminates TLS with its own certificate.
resource "cloudflare_dns_record" "host" {
  count   = var.attach_host ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = var.host
  type    = "CNAME"
  content = aws_cloudfront_distribution.this.domain_name
  ttl     = 300
  proxied = false
  comment = "CloudFront of ${var.name} (Terraform, v2)"
}

# Statement merged into the processed bucket policy (account B).
data "aws_iam_policy_document" "bucket_read" {
  statement {
    sid       = "CloudFrontReadsProcessed"
    actions   = ["s3:GetObject"]
    resources = ["${var.processed_bucket_arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = concat([aws_cloudfront_distribution.this.arn], var.transition_reader_arns)
    }
  }
}

moved {
  from = aws_acm_certificate.cdn
  to   = aws_acm_certificate.cdn[0]
}

moved {
  from = aws_acm_certificate_validation.cdn
  to   = aws_acm_certificate_validation.cdn[0]
}

moved {
  from = cloudflare_dns_record.host
  to   = cloudflare_dns_record.host[0]
}
