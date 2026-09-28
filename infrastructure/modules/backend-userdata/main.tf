# ═══════════════════════════════════════════════════
# Module: backend-userdata — điền scripts/ec2-userdata.sh cho một môi trường
#
# Không tạo tài nguyên nào, chỉ trả về chuỗi user_data. Script dùng rất nhiều cú
# pháp ${...} của bash nên không dùng templatefile được; thay vào đó nó mang các
# chuỗi đánh dấu __TEN__ và module này thay từng chuỗi. Production (dev) và
# staging gọi cùng module, nên hai môi trường luôn chạy cùng một script.
# ═══════════════════════════════════════════════════

variable "project_prefix" {
  description = "\"$${project_name}-$${environment}\": tiền tố secret riêng và tên bucket raw/processed"
  type        = string
}

variable "shared_secret_prefix" {
  description = "Tiền tố của secret dùng chung (mật khẩu Gmail, token Cloudflare)"
  type        = string
}

variable "git_ref" {
  description = "Nhánh hoặc tag được clone lúc dựng máy"
  type        = string
}

variable "frontend_url" {
  type = string
}

variable "cors_origins" {
  description = "Danh sách Origin được gọi API, phân tách bằng dấu phẩy"
  type        = string
}

variable "static_bucket_name" {
  description = "Bucket host frontend, nơi lưu avatars/"
  type        = string
}

variable "api_domain" {
  type = string
}

variable "cloudfront_domain" {
  type = string
}

variable "email_user" {
  type    = string
  default = ""
}

variable "cloudfront_key_pair_id" {
  type    = string
  default = ""
}

locals {
  script = file("${path.module}/../../../scripts/ec2-userdata.sh")
}

# EC2 giới hạn user_data ở 16 KB (16.384 byte) trước khi mã hoá base64, và
# script — nhiều chú thích giải thích lý do từng bước — đã chạm mức đó: đo
# ngày 2026-09-29, bản điền giá trị của production là 16.369 byte, của staging
# 16.382 byte; thêm một dòng chú thích là EC2 từ chối. cloud-init tự giải nén
# user_data dạng gzip (tài liệu của nó nêu đúng trường hợp nền tảng giới hạn
# kích thước), còn khoảng 6,1 KB, nên các instance dùng output nén bên dưới qua
# user_data_base64.
output "rendered_base64gzip" {
  value = base64gzip(local.rendered)
}

output "rendered" {
  value = local.rendered
}

locals {
  rendered = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    local.script,
    "__PROJECT_PREFIX__", var.project_prefix),
    "__SHARED_SECRET_PREFIX__", var.shared_secret_prefix),
    "__GIT_REF__", var.git_ref),
    "__FRONTEND_URL__", var.frontend_url),
    "__CORS_ORIGINS__", var.cors_origins),
    "__STATIC_BUCKET_NAME__", var.static_bucket_name),
    "__API_DOMAIN__", var.api_domain),
    "__CLOUDFRONT_DOMAIN__", var.cloudfront_domain),
    "__EMAIL_USER__", var.email_user),
    "__CLOUDFRONT_KEY_PAIR_ID__", var.cloudfront_key_pair_id
  )
}
