# Staging environment of v2. It runs next to the old stack and never touches dacntt-* resources.

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
    key            = "zelos/staging/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "dacntt-terraform-locks"
    encrypt        = true
  }
}

locals {
  environment = "staging"
  name        = "zelos-${local.environment}"

  # Public hosts of this environment. The API base is baked into every key URI the
  # transcoder writes (docs/ARCHITECTURE.md §5.1), so it must be final before the first video.
  web_origin   = "https://v2-staging.zelostech.site"
  api_base_url = "https://api-v2-staging.zelostech.site"
  # CloudFront of v2 lives in account A and is not built yet (S4); playback answers 503 until then.
  cdn_base_url = "https://cdn-v2-staging.zelostech.site"
}

provider "aws" {
  region = "ap-southeast-1"
  default_tags {
    tags = {
      Project     = "DACNTT"
      Stack       = "v2"
      Environment = local.environment
      ManagedBy   = "Terraform"
    }
  }
}

data "terraform_remote_state" "shared" {
  backend = "s3"
  config = {
    bucket = "dacntt-terraform-state"
    key    = "zelos/shared/terraform.tfstate"
    region = "ap-southeast-1"
  }
}

module "storage" {
  source         = "../../modules/storage"
  name           = local.name
  upload_origins = [local.web_origin, "http://localhost:5173"]
  force_destroy  = true # staging data is disposable
}

module "events" {
  source       = "../../modules/events"
  name         = local.name
  alert_emails = var.alert_emails
}

module "ingest" {
  source          = "../../modules/ingest"
  name            = local.name
  raw_bucket_name = module.storage.bucket_names["raw"]
  raw_bucket_arn  = module.storage.bucket_arns["raw"]
  alarm_topic_arn = module.events.alerts_topic_arn
}

module "kv" {
  source = "../../modules/kv"
  name   = local.name
}

module "batch" {
  source               = "../../modules/batch"
  name                 = local.name
  environment_name     = local.environment
  vpc_id               = data.terraform_remote_state.shared.outputs.vpc_id
  subnet_ids           = data.terraform_remote_state.shared.outputs.public_subnet_ids
  image_repository_url = data.terraform_remote_state.shared.outputs.transcoder_repository_url
  image_tag            = var.transcoder_image_tag
  bucket_names         = module.storage.bucket_names
  bucket_arns          = module.storage.bucket_arns
  event_bus_name       = module.events.bus_name
  event_bus_arn        = module.events.bus_arn
  environment = {
    API_BASE_URL = local.api_base_url
  }
}

module "workflow" {
  source               = "../../modules/workflow"
  name                 = local.name
  environment_name     = local.environment
  functions_dist_dir   = "${path.root}/../../../functions/dist"
  artifacts_bucket     = data.terraform_remote_state.shared.outputs.artifacts_bucket
  bucket_names         = module.storage.bucket_names
  bucket_arns          = module.storage.bucket_arns
  ingest_queue_arn     = module.ingest.queue_arn
  event_bus_name       = module.events.bus_name
  event_bus_arn        = module.events.bus_arn
  alert_topic_arn      = module.events.alerts_topic_arn
  job_queue_arns       = module.batch.job_queue_arns
  job_definition_arns  = module.batch.job_definition_arns
  api_base_url         = local.api_base_url
  db_name              = "zelos_staging"
  secret_recovery_days = 0 # staging is disposable
}

module "app" {
  source                   = "../../modules/app"
  name                     = local.name
  environment_name         = local.environment
  api_dist_dir             = "${path.root}/../../../api/dist"
  functions_dist_dir       = "${path.root}/../../../functions/dist"
  db_name                  = "zelos_staging"
  web_origins              = [local.web_origin, "http://localhost:5173"]
  web_base_url             = local.web_origin
  api_base_url             = local.api_base_url
  cdn_base_url             = local.cdn_base_url
  bucket_names             = module.storage.bucket_names
  bucket_arns              = module.storage.bucket_arns
  table_names              = module.kv.table_names
  table_arns               = module.kv.table_arns
  event_bus_name           = module.events.bus_name
  alert_topic_arn          = module.events.alerts_topic_arn
  status_function_arn      = module.workflow.function_arns["status"]
  api_reserved_concurrency = 20
  secret_recovery_days     = 0 # staging is disposable
}
