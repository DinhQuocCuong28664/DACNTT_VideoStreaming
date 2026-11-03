variable "transcoder_image_tag" {
  description = "Commit SHA of the transcoder image (no default: production never runs a bootstrap image)"
  type        = string
}

variable "attach_hosts" {
  description = "Hosts on the distributions and their CNAMEs; false only while the old stack owns them (docs/ops/cutover.md)"
  type        = bool
  default     = true
}

variable "alert_emails" {
  description = "Operator email addresses for alerts (each must confirm the SNS subscription)"
  type        = list(string)
  default     = []
}
