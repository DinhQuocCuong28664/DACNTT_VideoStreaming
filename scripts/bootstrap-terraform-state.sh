#!/bin/bash
# ═══════════════════════════════════════════════════
# Bootstrap Terraform State Backend
# Run this ONCE before first `terraform init`
#
# Creates:
#   - S3 Bucket: dacntt-terraform-state (for state files)
#   - DynamoDB Table: dacntt-terraform-locks (for state locking)
# ═══════════════════════════════════════════════════

set -euo pipefail

AWS_REGION="ap-southeast-1"
STATE_BUCKET="dacntt-terraform-state"
LOCK_TABLE="dacntt-terraform-locks"

echo "═══════════════════════════════════════════════"
echo "  Bootstrap Terraform State Backend"
echo "═══════════════════════════════════════════════"

# 1. Create S3 Bucket for Terraform State
echo ""
echo "→ Creating S3 bucket: $STATE_BUCKET ..."
aws s3api create-bucket \
  --bucket "$STATE_BUCKET" \
  --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION" \
  2>/dev/null || echo "  (Bucket already exists — skipping)"

# Enable versioning (protect state from accidental deletion)
echo "→ Enabling versioning on $STATE_BUCKET ..."
aws s3api put-bucket-versioning \
  --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled

# Enable encryption
echo "→ Enabling encryption on $STATE_BUCKET ..."
aws s3api put-bucket-encryption \
  --bucket "$STATE_BUCKET" \
  --server-side-encryption-configuration '{
    "Rules": [
      {
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "AES256"
        }
      }
    ]
  }'

# Block public access
echo "→ Blocking public access on $STATE_BUCKET ..."
aws s3api put-public-access-block \
  --bucket "$STATE_BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# 2. Create DynamoDB Table for State Locking
echo ""
echo "→ Creating DynamoDB table: $LOCK_TABLE ..."
aws dynamodb create-table \
  --table-name "$LOCK_TABLE" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$AWS_REGION" \
  --tags Key=Project,Value=DACNTT Key=ManagedBy,Value=bootstrap \
  2>/dev/null || echo "  (Table already exists — skipping)"

echo ""
echo "═══════════════════════════════════════════════"
echo "  ✅ Bootstrap complete!"
echo ""
echo "  S3 Bucket:     $STATE_BUCKET"
echo "  DynamoDB Table: $LOCK_TABLE"
echo ""
echo "  You can now run:"
echo "    cd infrastructure/environments/dev"
echo "    terraform init"
echo "    terraform plan -var-file=terraform.tfvars"
echo "═══════════════════════════════════════════════"
