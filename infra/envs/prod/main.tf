# Production environment of v2 (zelostech.site). It shares the network, the image repository and
# the artifacts bucket with staging (infra/envs/shared) and never touches dacntt-* resources.
# Cutover from the old stack: docs/ops/cutover.md.

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "dacntt-terraform-state"
    key            = "zelos/prod/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "dacntt-terraform-locks"
    encrypt        = true
  }
}

locals {
  environment = "prod"
  name        = "zelos-${local.environment}"
  db_name     = "zelos_prod"

  # Public hosts. The API base is baked into every key URI the transcoder writes
  # (docs/ARCHITECTURE.md §5.1), so no video may be processed before the API host is live.
  web_origin   = "https://zelostech.site"
  api_base_url = "https://api.zelostech.site"
  cdn_host     = "cdn.zelostech.site"

  # Cloudflare zone of zelostech.site (an identifier, not a secret).
  cloudflare_zone_id = "d2ade2da1df8b663763db24000786b3a"
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

# CloudFront lives in this account as well: distributions use the default provider, and the
# certificates they present must be issued in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = { Project = "DACNTT", Stack = "v2", Environment = local.environment, ManagedBy = "Terraform" }
  }
}

# Token from CLOUDFLARE_API_TOKEN (Secrets Manager dacntt-dev/cloudflare-api-token in account B).
provider "cloudflare" {}

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
  upload_origins = [local.web_origin]

  processed_policy_documents = [module.cdn.bucket_policy_json]
}

module "cdn" {
  source = "../../modules/cdn"
  providers = {
    aws.cdn       = aws
    aws.us_east_1 = aws.us_east_1
  }
  name                                  = local.name
  host                                  = local.cdn_host
  attach_host                           = var.attach_hosts
  web_origins                           = [local.web_origin]
  signing_public_key_pem                = file("${path.module}/cdn-signing-public.pem")
  processed_bucket_arn                  = module.storage.bucket_arns["processed"]
  processed_bucket_regional_domain_name = module.storage.processed_bucket_regional_domain_name
  transition_reader_arns                = var.cdn_transition_reader_arns
  cloudflare_zone_id                    = local.cloudflare_zone_id
}

module "web" {
  source = "../../modules/web"
  providers = {
    aws.cdn       = aws
    aws.us_east_1 = aws.us_east_1
  }
  name                   = local.name
  host                   = trimprefix(local.web_origin, "https://")
  redirect_hosts         = ["www.zelostech.site"]
  attach_hosts           = var.attach_hosts
  cloudflare_zone_id     = local.cloudflare_zone_id
  transition_reader_arns = var.web_transition_reader_arns
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

# Ceilings, not reservations: nothing runs while the queues are empty. Fargate quota in account B
# is 30 Spot + 30 On-Demand; staging keeps 8 + 8, so both fit at once.
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
  spot_max_vcpus       = 24
  ondemand_max_vcpus   = 24
  moderation_enabled   = var.moderation_enabled
  environment = {
    API_BASE_URL = local.api_base_url
  }
}

module "workflow" {
  source              = "../../modules/workflow"
  name                = local.name
  environment_name    = local.environment
  functions_dist_dir  = "${path.root}/../../../functions/dist"
  artifacts_bucket    = data.terraform_remote_state.shared.outputs.artifacts_bucket
  bucket_names        = module.storage.bucket_names
  bucket_arns         = module.storage.bucket_arns
  ingest_queue_arn    = module.ingest.queue_arn
  event_bus_name      = module.events.bus_name
  event_bus_arn       = module.events.bus_arn
  alert_topic_arn     = module.events.alerts_topic_arn
  job_queue_arns      = module.batch.job_queue_arns
  job_definition_arns = module.batch.job_definition_arns
  api_base_url        = local.api_base_url
  db_name             = local.db_name
  # Spot ceiling 24 / 4 vCPU per chunk job: the plan cuts a long video into 3 x 6 chunks.
  chunk_parallel_slots = 6
}

module "app" {
  source              = "../../modules/app"
  name                = local.name
  environment_name    = local.environment
  api_dist_dir        = "${path.root}/../../../api/dist"
  functions_dist_dir  = "${path.root}/../../../functions/dist"
  db_name             = local.db_name
  web_origins         = [local.web_origin]
  web_base_url        = local.web_origin
  api_base_url        = local.api_base_url
  cdn_base_url        = module.cdn.base_url
  bucket_names        = module.storage.bucket_names
  bucket_arns         = module.storage.bucket_arns
  table_names         = module.kv.table_names
  table_arns          = module.kv.table_arns
  event_bus_name      = module.events.bus_name
  alert_topic_arn     = module.events.alerts_topic_arn
  status_function_arn = module.workflow.function_arns["status"]
  # docs/ARCHITECTURE.md §5.8: 80 x 3 connections stay well inside the prod cluster budget.
  api_reserved_concurrency = 80
}
