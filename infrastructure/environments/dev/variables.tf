# ═══════════════════════════════════════════════════
# Input Variables
# ═══════════════════════════════════════════════════

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-1"
}

variable "environment" {
  description = "Environment name (dev/prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name prefix for all resources"
  type        = string
  default     = "dacntt"
}

variable "admin_email" {
  description = "Admin email for CloudWatch alarm notifications"
  type        = string
  default     = ""
}

variable "mongodb_uri" {
  description = "MongoDB Atlas connection URI"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret"
  type        = string
  sensitive   = true
}

variable "cors_allowed_origins" {
  description = "Allowed CORS origins"
  type        = list(string)
  default     = ["http://localhost:5173"]
}
