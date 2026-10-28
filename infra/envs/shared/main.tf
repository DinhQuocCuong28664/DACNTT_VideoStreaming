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

output "vpc_id" {
  value = module.network.vpc_id
}

output "public_subnet_ids" {
  value = module.network.public_subnet_ids
}

output "transcoder_repository_url" {
  value = module.ecr.repository_url
}
