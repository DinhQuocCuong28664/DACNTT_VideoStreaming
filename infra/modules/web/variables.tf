variable "name" {
  description = "Resource prefix, e.g. zelos-staging"
  type        = string
}

variable "host" {
  description = "Public host of the web app, e.g. v2-staging.zelostech.site"
  type        = string
}

variable "redirect_hosts" {
  description = "Extra hosts (e.g. www.zelostech.site) answered with a 301 to host"
  type        = list(string)
  default     = []
}

variable "certificate_arn" {
  description = "Existing ACM certificate (us-east-1, account A) covering host and redirect_hosts; null issues a new one validated on Cloudflare"
  type        = string
  default     = null
}

variable "attach_hosts" {
  description = "Put the hosts on the distribution and create their CNAMEs. False while another distribution still owns them (cutover)"
  type        = bool
  default     = true
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
