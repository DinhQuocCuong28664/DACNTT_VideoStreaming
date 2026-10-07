# ═══════════════════════════════════════════════════
# Staging — pipeline chuyển mã và CDN video (dùng lại module của production)
# ═══════════════════════════════════════════════════

locals {
  prefix      = "${var.project_name}-${var.environment}" # dacntt-staging
  dev_prefix  = "${var.project_name}-dev"                # production hiện chạy trên môi trường "dev"
  common_tags = { Project = "DACNTT", Environment = var.environment }

  domain          = "zelostech.site"
  frontend_domain = "staging.${local.domain}"
  api_domain      = "api-staging.${local.domain}"
  cdn_domain      = "cdn-staging.${local.domain}"
  frontend_url    = "https://${local.frontend_domain}"
}

data "aws_caller_identity" "current" {}

# ── Tài nguyên dùng chung với production ─────────────
#
# Repo ECR: staging chạy đúng image mà CI build cho commit đang thử (tag bằng
# SHA), không cần repo riêng. Hai secret mật khẩu Gmail và token Cloudflare
# cũng đọc thẳng bản của production thay vì nhân bản — đổi mật khẩu thì chỉ
# đổi một nơi.
data "aws_ecr_repository" "transcoder" {
  name = "${local.dev_prefix}-transcoder"
}

data "aws_secretsmanager_secret" "email_app_password" {
  name = "${local.dev_prefix}/email-app-password"
}

data "aws_secretsmanager_secret" "cloudflare_api_token" {
  name = "${local.dev_prefix}/cloudflare-api-token"
}

data "aws_secretsmanager_secret_version" "prod_mongodb_uri" {
  secret_id = "${local.dev_prefix}/mongodb-uri"
}

# ── Secret riêng của staging ─────────────────────────
#
# recovery_window_in_days = 0: xoá ngay, để dựng lại staging không vướng tên
# secret đang chờ xoá.

# Cùng cluster Atlas, khác database: thay tên database trong URI. Staging có
# bộ đối soát video và dữ liệu thử riêng, nên tuyệt đối không được ghi vào
# database production — precondition bên dưới chặn đúng trường hợp phép thay
# không khớp và URI giữ nguyên.
locals {
  staging_mongodb_uri = replace(
    data.aws_secretsmanager_secret_version.prod_mongodb_uri.secret_string,
    "/^(mongodb(\\+srv)?://[^/]+)/[^?]*/",
    "$1/vidshare-staging"
  )
}

resource "aws_secretsmanager_secret" "mongodb_uri" {
  name                    = "${local.prefix}/mongodb-uri"
  description             = "MongoDB URI cua staging (database vidshare-staging)"
  recovery_window_in_days = 0
  tags                    = local.common_tags
}

resource "aws_secretsmanager_secret_version" "mongodb_uri" {
  secret_id     = aws_secretsmanager_secret.mongodb_uri.id
  secret_string = local.staging_mongodb_uri

  lifecycle {
    precondition {
      condition     = local.staging_mongodb_uri != data.aws_secretsmanager_secret_version.prod_mongodb_uri.secret_string && strcontains(local.staging_mongodb_uri, "/vidshare-staging")
      error_message = "Không tách được database staging khỏi URI production; dừng lại để staging không ghi vào database thật."
    }
  }
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${local.prefix}/jwt-secret"
  description             = "JWT secret rieng cua staging: token staging khong dung duoc tren production"
  recovery_window_in_days = 0
  tags                    = local.common_tags
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}

# Cặp khoá ký CloudFront Signed Cookie riêng: staging bị lộ khoá cũng không ký
# được cookie cho CDN production (key group của production không tin khoá này).
# Khoá riêng nằm trong state Terraform (bucket state đã mã hoá) và secret.
resource "tls_private_key" "cloudfront_signing" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "aws_secretsmanager_secret" "cloudfront_private_key" {
  name                    = "${local.prefix}/cloudfront-private-key"
  description             = "Khoa rieng ky CloudFront Signed Cookie cua staging"
  recovery_window_in_days = 0
  tags                    = local.common_tags
}

resource "aws_secretsmanager_secret_version" "cloudfront_private_key" {
  secret_id     = aws_secretsmanager_secret.cloudfront_private_key.id
  secret_string = tls_private_key.cloudfront_signing.private_key_pem
}

# ── Pipeline chuyển mã ───────────────────────────────
module "vpc" {
  source       = "../../modules/vpc"
  project_name = local.prefix
  region       = var.aws_region
  vpc_cidr     = "10.2.0.0/16" # khác dev (10.0) và prod (10.1)
  tags         = local.common_tags
}

module "sqs" {
  source         = "../../modules/sqs"
  project_name   = local.prefix
  raw_bucket_arn = module.s3.raw_bucket_arn
  tags           = local.common_tags
}

module "s3" {
  source                      = "../../modules/s3"
  project_name                = local.prefix
  force_destroy               = true # dữ liệu staging là dữ liệu thử
  cors_allowed_origins        = [local.frontend_url]
  sqs_queue_arn               = module.sqs.queue_arn
  sqs_queue_policy_dependency = module.sqs.queue_policy_id
  tags                        = local.common_tags
}

module "iam" {
  source               = "../../modules/iam"
  project_name         = local.prefix
  raw_bucket_arn       = module.s3.raw_bucket_arn
  processed_bucket_arn = module.s3.processed_bucket_arn
  sqs_queue_arn        = module.sqs.queue_arn
  static_bucket_arn    = aws_s3_bucket.frontend.arn
  extra_secret_arns = [
    data.aws_secretsmanager_secret.email_app_password.arn,
    data.aws_secretsmanager_secret.cloudflare_api_token.arn,
  ]
  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "transcoder" {
  name              = "/ecs/${local.prefix}/transcoder"
  retention_in_days = 7
  tags              = local.common_tags
}

module "cloudfront" {
  source = "../../modules/cloudfront"
  providers = {
    aws           = aws
    aws.account_a = aws.account_a
  }

  project_name                 = local.prefix
  processed_bucket_domain_name = module.s3.processed_bucket_domain_name
  processed_bucket_name        = module.s3.processed_bucket_name
  processed_bucket_arn         = module.s3.processed_bucket_arn
  # Staging chỉ phục vụ người thử trong nước, không cần mọi edge.
  price_class            = "PriceClass_200"
  cors_allowed_origins   = [local.frontend_url]
  enable_cloudfront      = true
  enable_signed_urls     = true
  signing_public_key_pem = tls_private_key.cloudfront_signing.public_key_pem
  aliases                = [local.cdn_domain]
  acm_certificate_arn    = aws_acm_certificate_validation.staging.certificate_arn
  tags                   = local.common_tags
}

module "batch" {
  source                      = "../../modules/batch"
  project_name                = local.prefix
  region                      = var.aws_region
  batch_service_role_arn      = module.iam.batch_service_role_arn
  ecs_task_execution_role_arn = module.iam.ecs_task_execution_role_arn
  transcoder_task_role_arn    = module.iam.transcoder_task_role_arn
  ecr_repository_url          = data.aws_ecr_repository.transcoder.repository_url
  subnet_ids                  = module.vpc.public_subnet_ids
  security_group_id           = module.vpc.batch_security_group_id
  raw_bucket_name             = module.s3.raw_bucket_name
  processed_bucket_name       = module.s3.processed_bucket_name
  sqs_queue_url               = module.sqs.queue_url
  # Cùng domain mà backend dùng để ký cookie, nếu không Resource trong policy
  # không khớp đường dẫn của hlsUrl (xem ghi chú tương ứng ở dev/main.tf).
  cloudfront_domain             = local.cdn_domain
  mongodb_uri_secret_arn        = aws_secretsmanager_secret.mongodb_uri.arn
  transcoder_log_group          = aws_cloudwatch_log_group.transcoder.name
  email_user                    = var.email_user
  email_from                    = var.email_user != "" ? "DACNTT Staging <${var.email_user}>" : ""
  frontend_url                  = local.frontend_url
  email_app_password_secret_arn = data.aws_secretsmanager_secret.email_app_password.arn
  use_spot                      = true
  # 8 = quota Fargate Spot của tài khoản (staging và production dùng chung quota): đủ để đo
  # thời gian thật của pipeline chia đoạn với video 4 giờ. Staging chỉ chạy khi được bật.
  max_vcpus                   = 8
  chunked_transcoding_enabled = true
  job_vcpu                    = var.job_vcpu
  job_memory                  = var.job_memory
  tags                        = local.common_tags
}

module "lambda" {
  source                    = "../../modules/lambda"
  project_name              = local.prefix
  lambda_role_arn           = module.iam.lambda_job_submitter_role_arn
  sqs_queue_arn             = module.sqs.queue_arn
  batch_job_queue_name      = module.batch.job_queue_name
  batch_job_definition_name = module.batch.job_definition_name
  tags                      = local.common_tags
}
