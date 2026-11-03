variable "transcoder_image_tag" {
  description = "Commit SHA of the transcoder image (no default: production never runs a bootstrap image)"
  type        = string
}

variable "attach_hosts" {
  description = "False until cutover: the old distributions still own zelostech.site, www and cdn (docs/ops/cutover.md)"
  type        = bool
  default     = false
}

variable "alert_emails" {
  description = "Operator email addresses for alerts (each must confirm the SNS subscription)"
  type        = list(string)
  default     = []
}
