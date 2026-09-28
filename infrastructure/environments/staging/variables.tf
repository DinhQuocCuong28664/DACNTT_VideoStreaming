# ═══════════════════════════════════════════════════
# Input Variables — Staging
# ═══════════════════════════════════════════════════

variable "aws_region" {
  type    = string
  default = "ap-southeast-1"
}

variable "environment" {
  type    = string
  default = "staging"
}

variable "project_name" {
  type    = string
  default = "dacntt"
}

variable "backend_enabled" {
  description = "true: dựng máy chủ backend, Elastic IP và bản ghi DNS api-staging. false: xoá cả ba (không còn tốn compute, IPv4 hay EBS)."
  type        = bool
  default     = false
}

variable "git_ref" {
  description = "Nhánh hoặc tag mà máy chủ staging clone lúc dựng. Nhánh phải có trên GitHub."
  type        = string
  default     = "master"
}

variable "backend_instance_type" {
  type    = string
  default = "t3.micro"
}

variable "email_user" {
  description = "Địa chỉ Gmail gửi thông báo, giống production (mật khẩu ứng dụng đọc từ secret dùng chung)"
  type        = string
  default     = ""
}

variable "cloudflare_zone_id" {
  description = "Zone zelostech.site trên Cloudflare (không phải bí mật)"
  type        = string
  default     = "d2ade2da1df8b663763db24000786b3a"
}

variable "job_vcpu" {
  type    = number
  default = 1
}

variable "job_memory" {
  type    = number
  default = 2048
}
