variable "project_name" {
  type = string
}

variable "raw_bucket_arn" {
  type = string
}

variable "processed_bucket_arn" {
  type = string
}

variable "sqs_queue_arn" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
