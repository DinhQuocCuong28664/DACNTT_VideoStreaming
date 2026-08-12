variable "project_name" {
  type = string
}

variable "processed_bucket_domain_name" {
  type = string
}

variable "processed_bucket_name" {
  type = string
}

variable "processed_bucket_arn" {
  type = string
}

variable "price_class" {
  description = "CloudFront price class (PriceClass_100=cheapest, PriceClass_200=mid, PriceClass_All=global)"
  type        = string
  default     = "PriceClass_100"
}

variable "cors_allowed_origins" {
  type    = list(string)
  default = ["http://localhost:5173"]
}

variable "enable_cloudfront" {
  description = "Enable CloudFront distribution creation (set to false if AWS account CloudFront restriction is pending verification)"
  type        = bool
  default     = false
}

# ── Signed Cookies (bảo vệ nội dung riêng tư) ─────
variable "enable_signed_urls" {
  description = <<-EOT
    Bật cơ chế Trusted Key Group để CloudFront chỉ phục vụ nội dung HLS cho các
    yêu cầu có Signed Cookie hợp lệ. Khi bật, biến `signing_public_key_pem` là bắt buộc.
    Lưu ý: bật cờ này khiến MỌI video (kể cả công khai) đều cần Signed Cookie;
    Backend chịu trách nhiệm cấp cookie sau khi kiểm tra quyền truy cập.
  EOT
  type        = bool
  default     = false
}

variable "signing_public_key_pem" {
  description = <<-EOT
    Nội dung khóa công khai định dạng PEM (RSA 2048-bit) dùng để CloudFront xác
    thực chữ ký của Signed Cookie. Khóa bí mật tương ứng KHÔNG được đưa vào
    Terraform mà phải lưu trong AWS Secrets Manager và chỉ Backend đọc được.

    Sinh cặp khóa bằng lệnh:
      openssl genrsa -out cloudfront-private.pem 2048
      openssl rsa -pubout -in cloudfront-private.pem -out cloudfront-public.pem
  EOT
  type        = string
  default     = ""
}

variable "aliases" {
  description = "Danh sách tên miền thay thế (CNAME) cho CloudFront, ví dụ [\"cdn.zelostech.site\"]. Cần thiết để Signed Cookie dùng chung parent domain với ứng dụng."
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "ARN chứng chỉ ACM tại vùng us-east-1, bắt buộc khi sử dụng `aliases`"
  type        = string
  default     = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}
