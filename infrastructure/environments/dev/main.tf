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
  tags                 = local.common_tags
}

# ── 9. CloudFront CDN ─────────────────────────────
module "cloudfront" {
  source                       = "../../modules/cloudfront"
  project_name                 = "${var.project_name}-${var.environment}"
  processed_bucket_domain_name = module.s3.processed_bucket_domain_name
  processed_bucket_name        = module.s3.processed_bucket_name
  processed_bucket_arn         = module.s3.processed_bucket_arn
  price_class                  = "PriceClass_100" # Dev: cheapest
  cors_allowed_origins         = var.cors_allowed_origins
  enable_cloudfront            = var.enable_cloudfront
  tags                         = local.common_tags
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
  cloudfront_domain           = module.cloudfront.distribution_domain_name
  mongodb_uri_secret_arn      = module.secrets.mongodb_uri_secret_arn
  transcoder_log_group        = module.monitoring.transcoder_log_group_name
  use_spot                    = true # Dev: use FARGATE_SPOT (70% cheaper)
  max_vcpus                   = 4
  job_vcpu                    = 1
  job_memory                  = 2048
  tags                        = local.common_tags
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
