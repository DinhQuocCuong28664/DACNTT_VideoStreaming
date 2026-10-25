variable "project_name" {
  type = string
}

variable "lambda_role_arn" {
  type = string
}

variable "sqs_queue_arn" {
  type = string
}

variable "batch_job_queue_name" {
  type = string
}

variable "batch_job_definition_name" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days for Lambda job submitter"
  type        = number
  default     = 7
}
