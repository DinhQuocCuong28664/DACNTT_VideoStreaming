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
