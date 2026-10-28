variable "transcoder_image_tag" {
  description = "Commit SHA of the transcoder image; CI passes it when it deploys"
  type        = string
  default     = "bootstrap"
}

variable "alert_emails" {
  description = "Operator email addresses for alerts (each must confirm the SNS subscription)"
  type        = list(string)
  default     = []
}
