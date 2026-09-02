# ═══════════════════════════════════════════════════
# Dev Environment — Root Module (connects all modules)
# ═══════════════════════════════════════════════════

locals {
  common_tags = {
    Project     = "DACNTT"
    Environment = var.environment
  }
}

# ── 1. VPC ─────────────────────────────────────────
module "vpc" {
  source       = "../../modules/vpc"
  project_name = "${var.project_name}-${var.environment}"
  region       = var.aws_region
  vpc_cidr     = "10.0.0.0/16"
  tags         = local.common_tags
}

# ── 2. SQS (must be created before S3 notification) ──
module "sqs" {
  source         = "../../modules/sqs"
  project_name   = "${var.project_name}-${var.environment}"
  raw_bucket_arn = module.s3.raw_bucket_arn
  tags           = local.common_tags
}

# ── 3. S3 Buckets ──────────────────────────────────
module "s3" {
  source                      = "../../modules/s3"
  project_name                = "${var.project_name}-${var.environment}"
  force_destroy               = true # Dev only — allow force destroy
  cors_allowed_origins        = var.cors_allowed_origins
  sqs_queue_arn               = module.sqs.queue_arn
  sqs_queue_policy_dependency = module.sqs.queue_policy_id
  tags                        = local.common_tags
}

# ── 4. ECR ─────────────────────────────────────────
module "ecr" {
  source          = "../../modules/ecr"
  project_name    = "${var.project_name}-${var.environment}"
  max_image_count = 5
  force_delete    = true
  tags            = local.common_tags
}

# ── 5. Secrets Manager ─────────────────────────────
module "secrets" {
  source                  = "../../modules/secrets"
  project_name            = "${var.project_name}-${var.environment}"
  mongodb_uri             = var.mongodb_uri
  jwt_secret              = var.jwt_secret
  email_app_password      = var.email_app_password
  recovery_window_in_days = 0 # Dev: immediate delete (no recovery period)
  tags                    = local.common_tags
}

# ── 6. IAM Roles ───────────────────────────────────
module "iam" {
  source               = "../../modules/iam"
  project_name         = "${var.project_name}-${var.environment}"
  raw_bucket_arn       = module.s3.raw_bucket_arn
  processed_bucket_arn = module.s3.processed_bucket_arn
  sqs_queue_arn        = module.sqs.queue_arn
  tags                 = local.common_tags
}

# ── 7. SNS Notifications ──────────────────────────
module "sns" {
  source       = "../../modules/sns"
  project_name = "${var.project_name}-${var.environment}"
  admin_email  = var.admin_email
  tags         = local.common_tags
}

# ── 8. CloudWatch Monitoring ──────────────────────
module "monitoring" {
  source               = "../../modules/monitoring"
  project_name         = "${var.project_name}-${var.environment}"
  region               = var.aws_region
  log_retention_days   = 7 # Dev: shorter retention
  dlq_alert_topic_arn  = module.sns.dlq_alert_topic_arn
  dlq_queue_name       = "${var.project_name}-${var.environment}-transcode-dlq"
  transcode_queue_name = "${var.project_name}-${var.environment}-transcode-queue"
  batch_job_queue_arn  = module.batch.job_queue_arn
  tags                 = local.common_tags
}

# ── 9. CloudFront CDN ─────────────────────────────
module "cloudfront" {
  source = "../../modules/cloudfront"
  providers = {
    aws           = aws
    aws.account_a = aws.account_a
  }
  project_name                 = "${var.project_name}-${var.environment}"
  processed_bucket_domain_name = module.s3.processed_bucket_domain_name
  processed_bucket_name        = module.s3.processed_bucket_name
  processed_bucket_arn         = module.s3.processed_bucket_arn
  price_class                  = "PriceClass_100" # Dev: cheapest
  cors_allowed_origins         = var.cors_allowed_origins
  enable_cloudfront            = var.enable_cloudfront
  enable_signed_urls           = var.enable_signed_urls
  # terraform.tfvars là file CRLF nên heredoc giữ nguyên \r\n giữa các dòng,
  # nhưng AWS chuẩn hoá PEM về \n thuần khi lưu — mỗi lần plan sau đó Terraform
  # thấy config (\r\n) khác state (\n) và đòi xoá + tạo lại khoá ký dù nội dung
  # không hề đổi. Bỏ hết \r trước khi truyền vào để khớp đúng những gì AWS lưu.
  signing_public_key_pem = "${replace(trimspace(var.signing_public_key_pem), "\r", "")}\n"
  # cdn.zelostech.site dùng chung chứng chỉ ACM với frontend (đã phủ thêm SAN
  # này trong frontend.tf) thay vì biến cdn_acm_certificate_arn — tránh phải
  # xin/validate thêm 1 chứng chỉ ACM riêng chỉ để phục vụ 1 alias.
  aliases             = ["cdn.zelostech.site"]
  acm_certificate_arn = aws_acm_certificate_validation.frontend.certificate_arn
  tags                = local.common_tags
}

# ── 10. AWS Batch (Fargate) ───────────────────────
module "batch" {
  source                      = "../../modules/batch"
  project_name                = "${var.project_name}-${var.environment}"
  region                      = var.aws_region
  batch_service_role_arn      = module.iam.batch_service_role_arn
  ecs_task_execution_role_arn = module.iam.ecs_task_execution_role_arn
  transcoder_task_role_arn    = module.iam.transcoder_task_role_arn
  ecr_repository_url          = module.ecr.repository_url
  subnet_ids                  = module.vpc.public_subnet_ids
  security_group_id           = module.vpc.batch_security_group_id
  raw_bucket_name             = module.s3.raw_bucket_name
  processed_bucket_name       = module.s3.processed_bucket_name
  sqs_queue_url               = module.sqs.queue_url
  # Domain alias (không dùng module.cloudfront.distribution_domain_name nữa):
  # Signed Cookie ký Resource theo đúng host trong hlsUrl, nên transcoder phải
  # sinh hlsUrl bằng cùng 1 domain mà backend dùng để build Resource pattern —
  # domain rời rạc *.cloudfront.net sẽ không khớp policy đã ký.
  cloudfront_domain      = "cdn.zelostech.site"
  mongodb_uri_secret_arn = module.secrets.mongodb_uri_secret_arn
  transcoder_log_group   = module.monitoring.transcoder_log_group_name
  # Email thông báo trạng thái video — để trống email_user/email_from/
  # email_app_password (mặc định "") thì Terraform vẫn apply được bình
  # thường, chỉ là Batch Job Definition sẽ không có EMAIL_APP_PASSWORD secret
  # và transcoder tự bỏ qua bước gửi email (xem notifySafely trong index.js).
  email_user                    = var.email_user
  email_from                    = var.email_from
  frontend_url                  = var.frontend_url
  email_app_password_secret_arn = module.secrets.email_app_password_secret_arn
  use_spot                      = true # Dev: use FARGATE_SPOT (70% cheaper)
  # max_vcpus nâng lên 8 (khớp đúng quota Fargate Spot hiện có của tài khoản)
  # để compute environment không tự giới hạn thấp hơn khả năng thật khi chạy
  # stress test nhiều job đồng thời.
  max_vcpus = 8
  # Mặc định 1 vCPU / 2 GB (giá trị gốc của hệ thống). Thí nghiệm so sánh
  # hiệu năng đổi sang 4 vCPU / 8 GB bằng cách truyền biến lúc chạy:
  #   terraform apply -var="job_vcpu=4" -var="job_memory=8192"
  # Cách này cho phép xen kẽ hai cấu hình giữa các lần đo (xem
  # scripts/run-benchmark-suite.js) để khử ảnh hưởng của biến thiên năng lực
  # Fargate Spot theo thời gian, thay vì đo dồn từng cấu hình thành hai khối.
  job_vcpu   = var.job_vcpu
  job_memory = var.job_memory
  tags       = local.common_tags
}

# ── 11. Lambda Job Submitter ──────────────────────
module "lambda" {
  source                    = "../../modules/lambda"
  project_name              = "${var.project_name}-${var.environment}"
  lambda_role_arn           = module.iam.lambda_job_submitter_role_arn
  sqs_queue_arn             = module.sqs.queue_arn
  batch_job_queue_name      = module.batch.job_queue_name
  batch_job_definition_name = module.batch.job_definition_name
  tags                      = local.common_tags
}
