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

# ── Kiểm duyệt nội dung (Amazon Rekognition) ──
variable "moderation_enabled" {
  description = "Bật kiểm duyệt nội dung tự động trước khi công khai video"
  type        = bool
  default     = true
}

variable "moderation_review_confidence" {
  description = "Độ tin cậy (%) tối thiểu để đưa video vào hàng rà soát"
  type        = number
  default     = 60
}

variable "moderation_block_confidence" {
  description = "Độ tin cậy (%) tối thiểu để tự động gỡ video"
  type        = number
  default     = 90

  validation {
    condition     = var.moderation_block_confidence >= var.moderation_review_confidence
    error_message = "Ngưỡng gỡ video phải lớn hơn hoặc bằng ngưỡng rà soát."
  }
}

variable "moderation_frame_interval" {
  description = "Khoảng cách (giây) giữa hai khung hình được phân tích"
  type        = number
  default     = 5
}

variable "moderation_max_frames" {
  description = "Số khung hình tối đa mỗi video — trần chi phí $0.001 × số khung"
  type        = number
  default     = 120
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
