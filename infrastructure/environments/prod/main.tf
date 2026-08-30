# ═══════════════════════════════════════════════════
# Prod Environment — Root Module
# Differences from Dev: ON_DEMAND Fargate, longer logs, no force_destroy
# ═══════════════════════════════════════════════════

locals {
  common_tags = {
    Project     = "DACNTT"
    Environment = var.environment
  }
}

module "vpc" {
  source       = "../../modules/vpc"
  project_name = "${var.project_name}-${var.environment}"
  region       = var.aws_region
  vpc_cidr     = "10.1.0.0/16" # Different CIDR from dev
  tags         = local.common_tags
}

module "sqs" {
  source         = "../../modules/sqs"
  project_name   = "${var.project_name}-${var.environment}"
  raw_bucket_arn = module.s3.raw_bucket_arn
  tags           = local.common_tags
}

module "s3" {
  source                      = "../../modules/s3"
  project_name                = "${var.project_name}-${var.environment}"
  force_destroy               = false # Prod: protect data
  cors_allowed_origins        = var.cors_allowed_origins
  sqs_queue_arn               = module.sqs.queue_arn
  sqs_queue_policy_dependency = module.sqs.queue_policy_id
  tags                        = local.common_tags
}

module "ecr" {
  source          = "../../modules/ecr"
  project_name    = "${var.project_name}-${var.environment}"
  max_image_count = 10 # Prod: keep more images
  force_delete    = false
  tags            = local.common_tags
}

module "secrets" {
  source                  = "../../modules/secrets"
  project_name            = "${var.project_name}-${var.environment}"
  mongodb_uri             = var.mongodb_uri
  jwt_secret              = var.jwt_secret
  recovery_window_in_days = 7 # Prod: 7-day recovery window
  tags                    = local.common_tags
}

module "iam" {
  source               = "../../modules/iam"
  project_name         = "${var.project_name}-${var.environment}"
  raw_bucket_arn       = module.s3.raw_bucket_arn
  processed_bucket_arn = module.s3.processed_bucket_arn
  sqs_queue_arn        = module.sqs.queue_arn
  tags                 = local.common_tags
}

module "sns" {
  source       = "../../modules/sns"
  project_name = "${var.project_name}-${var.environment}"
  admin_email  = var.admin_email
  tags         = local.common_tags
}

module "monitoring" {
  source               = "../../modules/monitoring"
  project_name         = "${var.project_name}-${var.environment}"
  region               = var.aws_region
  log_retention_days   = 30 # Prod: longer retention
  dlq_alert_topic_arn  = module.sns.dlq_alert_topic_arn
  dlq_queue_name       = "${var.project_name}-${var.environment}-transcode-dlq"
  transcode_queue_name = "${var.project_name}-${var.environment}-transcode-queue"
  tags                 = local.common_tags
}

module "cloudfront" {
  source = "../../modules/cloudfront"
  # Prod dùng 1 account duy nhất (không bị chặn CloudFront như account dev),
  # nên module chỉ cần ánh xạ cả 2 provider slot về cùng provider mặc định.
  providers = {
    aws           = aws
    aws.account_a = aws
  }
  project_name                 = "${var.project_name}-${var.environment}"
  processed_bucket_domain_name = module.s3.processed_bucket_domain_name
  processed_bucket_name        = module.s3.processed_bucket_name
  processed_bucket_arn         = module.s3.processed_bucket_arn
  price_class                  = "PriceClass_200" # Prod: better coverage
  cors_allowed_origins         = var.cors_allowed_origins
  tags                         = local.common_tags
}

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
  use_spot                    = false # Prod: ON_DEMAND (reliable)
  max_vcpus                   = 16    # Prod: more capacity
  job_vcpu                    = 2     # Prod: more power per job
  job_memory                  = 4096  # Prod: 4GB RAM
  tags                        = local.common_tags
}

module "lambda" {
  source                    = "../../modules/lambda"
  project_name              = "${var.project_name}-${var.environment}"
  lambda_role_arn           = module.iam.lambda_job_submitter_role_arn
  sqs_queue_arn             = module.sqs.queue_arn
  batch_job_queue_name      = module.batch.job_queue_name
  batch_job_definition_name = module.batch.job_definition_name
  tags                      = local.common_tags
}
