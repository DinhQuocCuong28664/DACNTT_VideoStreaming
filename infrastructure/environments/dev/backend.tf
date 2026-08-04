# ═══════════════════════════════════════════════════
# Terraform State Backend (S3 + DynamoDB Lock)
# ═══════════════════════════════════════════════════
# NOTE: This backend must be created manually first (bootstrap).
# Run the bootstrap script: scripts/bootstrap-terraform-state.sh
# ═══════════════════════════════════════════════════

terraform {
  backend "s3" {
    bucket         = "dacntt-terraform-state"
    key            = "dev/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "dacntt-terraform-locks"
    encrypt        = true
  }
}
