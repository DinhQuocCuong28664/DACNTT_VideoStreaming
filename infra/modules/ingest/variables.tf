variable "name" {
  description = "Resource prefix, for example zelos-staging"
  type        = string
}

variable "raw_bucket_name" {
  type = string
}

variable "raw_bucket_arn" {
  type = string
}

variable "consumer_timeout_seconds" {
  description = "Timeout of the starter function; the queue visibility timeout is six times this"
  type        = number
  default     = 30
}

variable "alarm_topic_arn" {
  description = "SNS topic that receives the DLQ alarm"
  type        = string
}
