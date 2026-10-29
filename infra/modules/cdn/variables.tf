variable "name" {
  description = "Resource prefix, e.g. zelos-staging"
  type        = string
}

variable "host" {
  description = "Public host of the CDN, e.g. cdn-v2-staging.zelostech.site"
  type        = string
}

variable "web_origins" {
  description = "Origins allowed by CORS"
  type        = list(string)
}

variable "signing_public_key_pem" {
  description = "Public half of the key the API signs playback policies with"
  type        = string
}

variable "processed_bucket_arn" {
  type = string
}

variable "processed_bucket_regional_domain_name" {
  type = string
}

variable "cloudflare_zone_id" {
  type = string
}

variable "price_class" {
  description = "PriceClass_200 includes Asian edges"
  type        = string
  default     = "PriceClass_200"
}
