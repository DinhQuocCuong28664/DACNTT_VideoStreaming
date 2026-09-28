# ═══════════════════════════════════════════════════
# DACNTT Video Streaming — Staging Environment Root
#
# Bản sao thu gọn của production (environments/dev) để thử một nhánh trước khi
# merge. Cấu hình gốc riêng với state riêng, dùng lại các module chung — cách
# HashiCorp khuyến nghị cho các môi trường cần tách biệt (CLI workspace dùng
# chung backend nên không phải cơ chế cô lập phù hợp).
#
# Chi phí: phần luôn tồn tại (S3, SQS, Lambda, Batch, CloudFront, VPC, IAM,
# secret) gần như không tốn gì khi không chạy, trừ 2 secret riêng
# (~$0,80/tháng). Máy chủ backend, Elastic IP và bản ghi DNS api-staging chỉ
# tồn tại khi backend_enabled = true — xem scripts/staging-up.sh và
# scripts/staging-down.sh.
#
# Yêu cầu trước khi apply:
# - environments/dev đã apply (staging dùng lại repo ECR, hai secret dùng chung
#   và OIDC provider của GitHub do dev tạo);
# - biến môi trường CLOUDFLARE_API_TOKEN (staging-up.sh tự đọc từ secret
#   dacntt-dev/cloudflare-api-token): Terraform quản lý các bản ghi DNS và
#   bản ghi xác thực chứng chỉ ACM của staging trên Cloudflare;
# - profile AWS CLI "dacntt-a" cho account A (CloudFront), giống dev.
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
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "s3" {
    bucket         = "dacntt-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "dacntt-terraform-locks"
    encrypt        = true
  }
}

locals {
  default_tags = {
    Project     = "DACNTT"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = local.default_tags
  }
}

provider "aws" {
  alias   = "account_a"
  region  = var.aws_region
  profile = "dacntt-a"
  default_tags {
    tags = local.default_tags
  }
}

provider "aws" {
  alias   = "account_a_us_east_1"
  region  = "us-east-1"
  profile = "dacntt-a"
  default_tags {
    tags = local.default_tags
  }
}

# Token đọc từ biến môi trường CLOUDFLARE_API_TOKEN, không ghi vào cấu hình.
provider "cloudflare" {}
