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

variable "tags" {
  type    = map(string)
  default = {}
}
