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

variable "cookie_domain" {
  description = "Cookie domain attribute (e.g. .zelostech.site)"
  type        = string
  default     = ".zelostech.site"
}

variable "node_env" {
  description = "Node environment for Lambda"
  type        = string
  default     = "production"
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

variable "email_host" {
  description = "SMTP host for outgoing mail"
  type        = string
  default     = "smtp.gmail.com"
}

variable "email_port" {
  description = "SMTP port for outgoing mail"
  type        = string
  default     = "587"
}

variable "static_bucket_name" {
  description = "Frontend bucket that holds avatars/ (S3_STATIC_BUCKET_NAME)"
  type        = string
}

variable "google_client_id" {
  description = "Google OAuth client ID; the backend checks Google ID tokens against it"
  type        = string
}

variable "max_video_size_gb" {
  description = "Upload cap in GiB (MAX_VIDEO_SIZE_GB). Without it the backend falls back to 2 GiB, too small for the required 4-hour videos"
  type        = number
  default     = 20

  # backend/src/config/uploadLimits.js clamps anything above its hard cap of 20 GiB.
  validation {
    condition     = var.max_video_size_gb > 0 && var.max_video_size_gb <= 20
    error_message = "max_video_size_gb must be above 0 and at most 20 (the backend's hard cap)."
  }
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
