variable "project_name" {
  description = "Project name prefix"
  type        = string
}

variable "raw_bucket_arn" {
  description = "ARN of the raw S3 bucket (for SQS policy)"
  type        = string
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
