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

variable "moderation_enabled" {
  description = "Set to false only while a measurement runs (-var moderation_enabled=false); apply again without it afterwards"
  type        = bool
  default     = true
}

variable "cdn_transition_reader_arns" {
  description = "Old media distributions that may still read the processed bucket during a move (docs/ops/cdn-to-b.md)"
  type        = list(string)
  default     = []
}

variable "web_transition_reader_arns" {
  description = "Old web distributions that may still read the web bucket during a move (docs/ops/cdn-to-b.md)"
  type        = list(string)
  default     = []
}
