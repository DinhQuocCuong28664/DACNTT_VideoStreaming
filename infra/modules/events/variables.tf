variable "name" {
  description = "Resource prefix, for example zelos-staging"
  type        = string
}

variable "alert_emails" {
  description = "Email addresses subscribed to operator alerts (each must confirm the subscription)"
  type        = list(string)
  default     = []
}
