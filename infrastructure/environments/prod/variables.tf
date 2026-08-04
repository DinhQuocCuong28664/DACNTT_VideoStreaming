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
