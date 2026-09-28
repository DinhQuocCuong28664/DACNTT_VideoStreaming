variable "project_name" {
  type = string
}

variable "raw_bucket_arn" {
  type = string
}

variable "processed_bucket_arn" {
  type = string
}

variable "sqs_queue_arn" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}

# Bucket tĩnh chứa ảnh đại diện (avatars/). Để trống thì không cấp quyền nào.
# Backend chỉ ký presigned POST cho avatars/{userId}/...; chữ ký chỉ hợp lệ
# trong phạm vi quyền của role đã ký, nên thiếu quyền này thì S3 từ chối mọi
# lượt tải ảnh đại diện.
variable "static_bucket_arn" {
  type    = string
  default = ""
}

# Secret dùng chung với môi trường khác (vd. staging đọc mật khẩu Gmail và token
# Cloudflare của dev thay vì nhân bản chúng). Mặc định rỗng: chỉ đọc được
# secret mang tiền tố ${project_name}/, như trước.
variable "extra_secret_arns" {
  type    = list(string)
  default = []
}
