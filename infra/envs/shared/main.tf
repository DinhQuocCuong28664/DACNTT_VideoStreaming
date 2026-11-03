# Resources shared by every v2 environment: the VPC and the transcoder image registry.

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }

  backend "s3" {
    bucket         = "dacntt-terraform-state"
    key            = "zelos/shared/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "dacntt-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = "ap-southeast-1"
  default_tags {
    tags = {
      Project     = "DACNTT"
      Stack       = "v2"
      Environment = "shared"
      ManagedBy   = "Terraform"
    }
  }
}

module "network" {
  source = "../../modules/network"
  name   = "zelos"
}

module "ecr" {
  source = "../../modules/ecr"
  name   = "zelos-transcoder"
}

# Build artifacts too large for direct upload (the ffprobe Lambda layer). Versioned so a layer
# version can always be traced to the object it was built from.
data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "artifacts" {
  bucket = "zelos-artifacts-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

# SSE-S3 is enough for build outputs that contain no user data.
#trivy:ignore:AWS-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    id     = "drop-old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

data "aws_iam_policy_document" "artifacts_tls_only" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.artifacts.arn, "${aws_s3_bucket.artifacts.arn}/*"]
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

resource "aws_s3_bucket_policy" "artifacts" {
  bucket     = aws_s3_bucket.artifacts.id
  policy     = data.aws_iam_policy_document.artifacts_tls_only.json
  depends_on = [aws_s3_bucket_public_access_block.artifacts]
}

output "artifacts_bucket" {
  value = aws_s3_bucket.artifacts.bucket
}

output "vpc_id" {
  value = module.network.vpc_id
}

output "public_subnet_ids" {
  value = module.network.public_subnet_ids
}

output "transcoder_repository_url" {
  value = module.ecr.repository_url
}
