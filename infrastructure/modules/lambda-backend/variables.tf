variable "project_name" {
  description = "Project name prefix"
  type        = string
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
}

variable "lambda_role_arn" {
  description = "IAM role ARN for the backend Lambda function"
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

variable "lambda_memory_size" {
  description = "Memory size for the backend Lambda in MB"
  type        = number
  default     = 512
}

variable "lambda_timeout" {
  description = "Timeout for the backend Lambda in seconds"
  type        = number
  default     = 30
}

variable "mongodb_uri" {
  description = "MongoDB connection string"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT secret key"
  type        = string
  sensitive   = true
}

variable "raw_bucket_name" {
  description = "S3 Raw Bucket Name"
  type        = string
}

variable "processed_bucket_name" {
  description = "S3 Processed Bucket Name"
  type        = string
}

variable "cloudfront_domain" {
  description = "CloudFront distribution domain"
  type        = string
  default     = ""
}

variable "cloudfront_key_pair_id" {
  description = "CloudFront public key ID for signed cookies"
  type        = string
  default     = ""
}

variable "cloudfront_private_key" {
  description = "CloudFront RSA private key for signing cookies"
  type        = string
  default     = ""
  sensitive   = true
}

variable "cors_origins" {
  description = "Comma-separated allowed origins"
  type        = string
  default     = "https://zelostech.site,https://www.zelostech.site"
}

variable "frontend_url" {
  description = "Frontend application URL"
  type        = string
  default     = "https://zelostech.site"
}

variable "email_user" {
  description = "Gmail user email for SMTP"
  type        = string
  default     = ""
}

variable "email_app_password" {
  description = "Gmail App Password"
  type        = string
  default     = ""
  sensitive   = true
}

variable "lambda_zip_path" {
  description = "Path to the backend lambda zip package"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
