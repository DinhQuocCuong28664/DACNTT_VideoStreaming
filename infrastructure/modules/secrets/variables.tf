variable "project_name" {
  type = string
}

variable "mongodb_uri" {
  type      = string
  sensitive = true
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "email_app_password" {
  description = "Gmail App Password dùng để Transcoder gửi email thông báo trạng thái video"
  type        = string
  sensitive   = true
  default     = ""
}

variable "recovery_window_in_days" {
  type    = number
  default = 7
}

variable "tags" {
  type    = map(string)
  default = {}
}
