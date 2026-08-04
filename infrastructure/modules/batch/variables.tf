variable "project_name" {
  type = string
}

variable "region" {
  type    = string
  default = "ap-southeast-1"
}

variable "batch_service_role_arn" {
  type = string
}

variable "ecs_task_execution_role_arn" {
  type = string
}

variable "transcoder_task_role_arn" {
  type = string
}

variable "ecr_repository_url" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "security_group_id" {
  type = string
}

variable "raw_bucket_name" {
  type = string
}

variable "processed_bucket_name" {
  type = string
}

variable "sqs_queue_url" {
  type = string
}

variable "cloudfront_domain" {
  type    = string
  default = ""
}

variable "mongodb_uri_secret_arn" {
  type = string
}

variable "transcoder_log_group" {
  type = string
}

variable "use_spot" {
  type    = bool
  default = true
}

variable "max_vcpus" {
  type    = number
  default = 4
}

variable "job_vcpu" {
  type    = number
  default = 1
}

variable "job_memory" {
  type    = number
  default = 2048
}

variable "tags" {
  type    = map(string)
  default = {}
}
