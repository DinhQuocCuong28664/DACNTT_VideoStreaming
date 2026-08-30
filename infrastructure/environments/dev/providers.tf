# ═══════════════════════════════════════════════════
# DACNTT Video Streaming — Dev Environment Root
# ═══════════════════════════════════════════════════

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "DACNTT"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# CloudFront requires ACM certificates to live in us-east-1,
# regardless of which region the distribution itself targets.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "DACNTT"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Account B (provider mặc định ở trên) đang bị AWS chặn tạo CloudFront
# Distribution (AccessDenied, chờ duyệt ticket). Account A là 1 AWS account
# khác, hoạt động bình thường, chỉ dùng để "mượn" chỗ tạo CloudFront —
# S3/Batch/Lambda/MongoDB vẫn ở account B như cũ. Profile "dacntt-a" là IAM
# user tạo riêng cho việc này (xem ~/.aws/credentials).
provider "aws" {
  alias   = "account_a"
  region  = var.aws_region
  profile = "dacntt-a"

  default_tags {
    tags = {
      Project     = "DACNTT"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Chung ly do voi "account_a" o tren, nhung cho chung chi ACM cua frontend
# CloudFront — chung chi nay BAT BUOC nam o us-east-1 (gioi han cua CloudFront)
# NHUNG van phai la us-east-1 cua account A, vi mot distribution khong the
# tham chieu chung chi ACM tu account khac.
provider "aws" {
  alias   = "account_a_us_east_1"
  region  = "us-east-1"
  profile = "dacntt-a"

  default_tags {
    tags = {
      Project     = "DACNTT"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}
