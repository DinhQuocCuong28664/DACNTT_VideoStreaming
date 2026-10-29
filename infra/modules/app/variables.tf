variable "name" {
  description = "Resource prefix, e.g. zelos-staging"
  type        = string
}

variable "environment_name" {
  description = "staging or prod"
  type        = string
}

variable "api_dist_dir" {
  description = "Folder holding the built API bundle (api/dist)"
  type        = string
}

variable "functions_dist_dir" {
  description = "Folder holding the built functions (functions/dist)"
  type        = string
}

variable "db_name" {
  type = string
}

variable "web_origins" {
  description = "Origins allowed by CORS"
  type        = list(string)
}

variable "web_base_url" {
  type = string
}

variable "api_base_url" {
  description = "Public API base without /v1"
  type        = string
}

variable "cdn_base_url" {
  description = "CloudFront base URL of the processed bucket"
  type        = string
}

variable "bucket_names" {
  type = map(string)
}

variable "bucket_arns" {
  type = map(string)
}

variable "table_names" {
  type = map(string)
}

variable "table_arns" {
  type = list(string)
}

variable "event_bus_name" {
  type = string
}

variable "alert_topic_arn" {
  type = string
}

variable "status_function_arn" {
  description = "The workflow status function, target of publish schedules"
  type        = string
}

variable "api_reserved_concurrency" {
  description = "Caps API instances and with it MongoDB connections (docs/ARCHITECTURE.md §5.8)"
  type        = number
  default     = 20
}

variable "secret_recovery_days" {
  type    = number
  default = 7
}

variable "log_retention_days" {
  type    = number
  default = 30
}
