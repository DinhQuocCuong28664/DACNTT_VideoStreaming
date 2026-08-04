variable "project_name" {
  type = string
}

variable "admin_email" {
  description = "Admin email for DLQ alert notifications"
  type        = string
  default     = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}
