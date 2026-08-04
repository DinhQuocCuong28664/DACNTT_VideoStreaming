variable "project_name" {
  description = "Project name prefix for S3 bucket names (must be globally unique)"
  type        = string
}

variable "force_destroy" {
  description = "Allow force destroy of buckets (dev only)"
  type        = bool
  default     = false
}

variable "cors_allowed_origins" {
  description = "List of allowed CORS origins for S3 buckets"
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "sqs_queue_arn" {
  description = "ARN of the SQS queue for S3 event notifications"
  type        = string
}

variable "sqs_queue_policy_dependency" {
  description = "Dependency to ensure SQS policy is created before S3 notification"
  type        = any
  default     = null
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default     = {}
}
