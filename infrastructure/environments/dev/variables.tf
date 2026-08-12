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

# ── Email thông báo trạng thái video (Transcoder → người upload) ──
variable "email_app_password" {
  description = "Gmail App Password dùng để Transcoder gửi email thông báo. Để trống nếu chưa muốn bật tính năng này."
  type        = string
  sensitive   = true
  default     = ""
}

variable "email_user" {
  description = "Địa chỉ Gmail dùng làm tài khoản gửi (SMTP user)"
  type        = string
  default     = ""
}

variable "email_from" {
  description = "Giá trị hiển thị ở trường From của email thông báo"
  type        = string
  default     = ""
}

variable "frontend_url" {
  description = "URL gốc của frontend, dùng để dựng link xem video trong email"
  type        = string
  default     = "https://zelostech.site"
}

variable "cors_allowed_origins" {
  description = "Allowed CORS origins"
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "enable_cloudfront" {
  description = "Enable CloudFront distribution (set to false if AWS account restriction pending verification)"
  type        = bool
  default     = false
}

# ── CloudFront Signed Cookies (bảo vệ video riêng tư) ──
variable "enable_signed_urls" {
  description = "Bật Trusted Key Group để CloudFront chỉ phục vụ nội dung HLS khi có Signed Cookie hợp lệ"
  type        = bool
  default     = false
}

variable "signing_public_key_pem" {
  description = "Khóa công khai RSA dạng PEM dùng để CloudFront xác thực Signed Cookie (bắt buộc khi enable_signed_urls = true)"
  type        = string
  default     = ""
}

variable "cdn_aliases" {
  description = "Tên miền tùy chỉnh cho CDN, ví dụ [\"cdn.zelostech.site\"]. Cần thiết để Signed Cookie dùng chung parent domain với ứng dụng"
  type        = list(string)
  default     = []
}

variable "cdn_acm_certificate_arn" {
  description = "ARN chứng chỉ ACM tại us-east-1, bắt buộc khi khai báo cdn_aliases"
  type        = string
  default     = ""
}
