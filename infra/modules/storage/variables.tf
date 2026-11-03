variable "name" {
  description = "Resource prefix, for example zelos-staging"
  type        = string
}

variable "upload_origins" {
  description = "Web origins allowed to upload to the raw bucket"
  type        = list(string)
}

variable "force_destroy" {
  description = "Allow destroying non-empty buckets (staging only)"
  type        = bool
  default     = false
}

variable "processed_policy_documents" {
  description = "Extra policy JSON for the processed bucket (the CloudFront OAC read statement)"
  type        = list(string)
  default     = []
}

variable "raw_infrequent_access_days" {
  description = "Days before original uploads move to S3 Standard-IA"
  type        = number
  default     = 30
}

variable "work_retention_days" {
  description = "Days before temporary workflow files expire"
  type        = number
  default     = 7
}
