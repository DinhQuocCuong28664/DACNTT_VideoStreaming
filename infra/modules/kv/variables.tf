variable "name" {
  description = "Resource prefix, for example zelos-staging"
  type        = string
}

variable "point_in_time_recovery" {
  description = "Continuous backups for the tables that hold user data (watch progress, notifications)"
  type        = bool
  default     = false
}
