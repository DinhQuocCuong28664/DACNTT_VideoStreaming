variable "name" {
  description = "Resource prefix, for example zelos-staging"
  type        = string
}

variable "environment_name" {
  description = "staging or prod"
  type        = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  description = "Public subnets; tasks get a public IP instead of using a NAT gateway"
  type        = list(string)
}

variable "spot_max_vcpus" {
  description = "Ceiling of the Fargate Spot environment (account quota 8, shared with other stacks)"
  type        = number
  default     = 8
}

variable "ondemand_max_vcpus" {
  description = "Ceiling of the Fargate On-Demand overflow environment (account quota 8)"
  type        = number
  default     = 8
}

variable "image_repository_url" {
  type = string
}

variable "image_tag" {
  description = "Commit SHA of the transcoder image; CI sets it when it deploys"
  type        = string
  default     = "bootstrap"
}

variable "bucket_names" {
  description = "Bucket names by role (raw, processed, work, keys)"
  type        = map(string)
}

variable "bucket_arns" {
  description = "Bucket ARNs by role (raw, processed, work, keys)"
  type        = map(string)
}

variable "event_bus_name" {
  type = string
}

variable "event_bus_arn" {
  type = string
}

variable "environment" {
  description = "Extra environment variables for every job (for example API_BASE_URL)"
  type        = map(string)
  default     = {}
}

variable "log_retention_days" {
  type    = number
  default = 14
}
