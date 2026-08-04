variable "project_name" {
  type = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "region" {
  type    = string
  default = "ap-southeast-1"
}

variable "tags" {
  type    = map(string)
  default = {}
}
