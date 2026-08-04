terraform {
  backend "s3" {
    bucket         = "dacntt-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "dacntt-terraform-locks"
    encrypt        = true
  }
}
