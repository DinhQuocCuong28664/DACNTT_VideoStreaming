variable "name" {
  description = "Name prefix of the network resources"
  type        = string
}

variable "cidr_block" {
  description = "VPC address range; must not overlap the old stack (10.0.0.0/16, 10.2.0.0/16) or bench (10.60.0.0/16)"
  type        = string
  default     = "10.20.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones with a public subnet"
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "Use two or three availability zones."
  }
}
