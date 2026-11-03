variable "name" {
  description = "Resource prefix, for example zelos-staging"
  type        = string
}

variable "environment_name" {
  description = "staging or prod"
  type        = string
}

variable "functions_dist_dir" {
  description = "Directory with the built functions (dist/<name>/index.mjs) and layers"
  type        = string
}

variable "artifacts_bucket" {
  description = "Bucket that holds the ffprobe layer zip"
  type        = string
}

variable "bucket_names" {
  type = map(string)
}

variable "bucket_arns" {
  type = map(string)
}

variable "ingest_queue_arn" {
  type = string
}

variable "event_bus_name" {
  type = string
}

variable "event_bus_arn" {
  type = string
}

variable "alert_topic_arn" {
  type = string
}

variable "job_queue_arns" {
  description = "Batch queue ARNs by name: main, bulk"
  type        = map(string)
}

variable "job_definition_arns" {
  description = "Batch job definition ARNs by role"
  type        = map(string)
}

variable "api_base_url" {
  description = "API base URL written into key URIs"
  type        = string
}

variable "db_name" {
  description = "MongoDB database of this environment"
  type        = string
}

variable "chunk_parallel_slots" {
  description = "Chunk jobs that can run at once (Fargate vCPU ceiling / chunk vCPU)"
  type        = number
  default     = 4
}

variable "status_reserved_concurrency" {
  description = "Reserved concurrency of the status function (MongoDB connection budget, §5.8)"
  type        = number
  default     = 5
}

variable "workflow_timeout_seconds" {
  description = "Upper bound of one execution, queue wait included"
  type        = number
  default     = 86400
}

variable "secret_recovery_days" {
  description = "0 deletes the secret at once (staging); 7-30 keeps it recoverable"
  type        = number
  default     = 7
}

variable "log_retention_days" {
  type    = number
  default = 14
}
