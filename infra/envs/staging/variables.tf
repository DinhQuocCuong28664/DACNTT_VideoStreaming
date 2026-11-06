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

variable "attach_hosts" {
  description = "Put the hosts on the distributions and create their CNAMEs; false while other distributions still own them (docs/ops/cdn-to-b.md)"
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
