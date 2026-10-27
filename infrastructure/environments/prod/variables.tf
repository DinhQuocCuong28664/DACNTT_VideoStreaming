variable "aws_region" {
  type    = string
  default = "ap-southeast-1"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "project_name" {
  type    = string
  default = "dacntt"
}

variable "admin_email" {
  type    = string
  default = ""
}

variable "mongodb_uri" {
  type      = string
  sensitive = true
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "cors_allowed_origins" {
  type    = list(string)
  default = ["https://zelostech.site"]
}

variable "key_delivery_base_url" {
  description = "API base URL players fetch the HLS AES-128 key from, e.g. https://api.example.com/api. Required: prod has no API domain of its own in this configuration."
  type        = string
}
