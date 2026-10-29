variable "name" {
  description = "Resource prefix, e.g. zelos-staging"
  type        = string
}

variable "host" {
  description = "Public host of the web app, e.g. v2-staging.zelostech.site"
  type        = string
}

variable "cloudflare_zone_id" {
  type = string
}

variable "force_destroy" {
  description = "Allow destroying the bucket with files in it (staging only)"
  type        = bool
  default     = false
}

variable "price_class" {
  description = "PriceClass_200 includes Asian edges"
  type        = string
  default     = "PriceClass_200"
}
