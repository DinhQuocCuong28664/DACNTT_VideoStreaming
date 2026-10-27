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

variable "google_client_id" {
  description = "Google OAuth client ID for Sign in with Google (public value); empty disables it on staging"
  type        = string
  default     = ""
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

# Video dài hơn ngưỡng này (giây) đi đường chia đoạn. Xem modules/batch/variables.tf.
variable "chunk_threshold_seconds" {
  description = "Ngưỡng thời lượng (giây) để chuyển mã chia đoạn; video ngắn hơn đi một job. 300 theo đo ngày 2026-10-11 (docs/CHUNKED_TRANSCODING_DESIGN.md mục 10.12): video 5 phút từ 26,7 xuống 11,9 phút."
  type        = number
  default     = 300
}

# Cỡ task riêng cho job chunk (các job khác vẫn dùng job_vcpu/job_memory). Xem modules/batch/variables.tf.
variable "chunk_vcpu" {
  description = "Số vCPU của mỗi job chunk (Fargate: 0.25/0.5/1/2/4/8/16). 4 nhanh hơn 14% và ít vCPU-giây hơn 7% so với 1 (đo 2026-10-10)."
  type        = number
  default     = 4
}

variable "chunk_memory" {
  description = "Bộ nhớ (MiB) của mỗi job chunk, phải khớp chunk_vcpu theo bảng Fargate (4 vCPU: 8192 đến 30720)"
  type        = number
  default     = 8192
}

# Quota của môi trường Fargate Spot (production dùng 8). Đặt 0 để đo riêng Fargate On-Demand: mọi job rơi
# sang môi trường On-Demand đứng sau, và CHUNK_TARGET_PARALLELISM tính theo đúng tổng quota còn lại.
variable "spot_max_vcpus" {
  description = "max_vcpus của môi trường Fargate Spot ở staging; 0 để đo riêng On-Demand"
  type        = number
  default     = 8
}

# Môi trường Fargate On-Demand tràn, chỉ bật khi đo (docs/CHUNKED_TRANSCODING_DESIGN.md). Quota Fargate
# On-Demand riêng với Spot, và staging dùng chung quota với production nên phải đảm bảo production nghỉ.
variable "ondemand_max_vcpus" {
  description = "max_vcpus của môi trường Fargate On-Demand đứng sau môi trường Spot; 0 = không tạo"
  type        = number
  default     = 0
}

variable "job_memory" {
  type    = number
  default = 2048
}
