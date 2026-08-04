variable "project_name" {
  description = "Project name prefix"
  type        = string
}

variable "max_image_count" {
  description = "Maximum number of images to retain in ECR"
  type        = number
  default     = 5
}

variable "force_delete" {
  description = "Force delete repository even if it contains images"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
