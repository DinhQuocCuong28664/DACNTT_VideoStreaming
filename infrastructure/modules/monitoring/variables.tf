variable "project_name" {
  type = string
}

variable "region" {
  type    = string
  default = "ap-southeast-1"
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "dlq_alert_topic_arn" {
  type = string
}

variable "dlq_queue_name" {
  type = string
}

variable "transcode_queue_name" {
  type = string
}

variable "batch_job_queue_arn" {
  description = "ARN hàng đợi AWS Batch — dùng để giới hạn cảnh báo job thất bại đúng vào hàng đợi của dự án. Để rỗng thì bỏ qua cảnh báo này."
  type        = string
  default     = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}
