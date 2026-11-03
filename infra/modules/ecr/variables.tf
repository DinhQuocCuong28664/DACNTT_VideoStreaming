variable "name" {
  description = "Repository name"
  type        = string
}

variable "keep_images" {
  description = "Number of images kept; older ones expire"
  type        = number
  default     = 30
}
