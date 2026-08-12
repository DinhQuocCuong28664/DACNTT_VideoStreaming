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

# ── Email thông báo trạng thái video (biến không nhạy cảm) ──
variable "email_host" {
  type    = string
  default = "smtp.gmail.com"
}

variable "email_port" {
  type    = string
  default = "587"
}

variable "email_user" {
  type    = string
  default = ""
}

variable "email_from" {
  type    = string
  default = ""
}

variable "frontend_url" {
  description = "Dùng để dựng link xem video trong email thông báo"
  type        = string
  default     = ""
}

variable "email_app_password_secret_arn" {
  description = "ARN của Secrets Manager secret chứa Gmail App Password"
  type        = string
  default     = ""
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
