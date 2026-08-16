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

# ── Tài nguyên container chuyển mã (dùng cho thí nghiệm hiệu năng) ──
# Tách thành biến thay vì hard-code để có thể đổi cấu hình giữa các lần đo
# bằng `terraform apply -var="job_vcpu=4" -var="job_memory=8192"`, phục vụ
# thí nghiệm so sánh 1 vCPU và 4 vCPU theo thiết kế xen kẽ (xem
# scripts/run-benchmark-suite.js). Fargate chỉ chấp nhận một tập giá trị
# vCPU/bộ nhớ cố định, nên hai biến này phải khớp nhau theo đúng bảng của AWS.
variable "job_vcpu" {
  description = "Số vCPU cấp cho mỗi job chuyển mã (Fargate: 0.25/0.5/1/2/4/8/16)"
  type        = number
  default     = 1
}

variable "job_memory" {
  description = "Bộ nhớ (MiB) cấp cho mỗi job chuyển mã, phải khớp với job_vcpu theo bảng Fargate"
  type        = number
  default     = 2048
}
