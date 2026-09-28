#!/usr/bin/env bash
#
# Tắt staging: xoá máy chủ backend, Elastic IP và bản ghi DNS api-staging.
#
# Khác production (stop-backend.sh chỉ dừng máy và giữ ổ đĩa + Elastic IP):
# staging không giữ gì tốn tiền theo giờ. Phần còn lại — S3, SQS, Lambda,
# Batch, CloudFront, VPC — không tính phí khi không có lưu lượng, trừ 3 secret
# riêng của staging (~$1,20/tháng). Lần bật sau dựng máy mới từ script mới nhất.
#
# Cách dùng:
#   bash scripts/staging-down.sh       # hiện plan và hỏi xác nhận
#   bash scripts/staging-down.sh -y    # không hỏi

set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-1}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TF_DIR="$REPO_ROOT/infrastructure/environments/staging"
AUTO_APPROVE=""
[ "${1:-}" = "-y" ] && AUTO_APPROVE="-auto-approve"

echo "── Tắt staging ─────────────────────────────────"

# Cần token để xoá bản ghi api-staging trên Cloudflare.
CLOUDFLARE_API_TOKEN=$(aws secretsmanager get-secret-value --region "$REGION" \
  --secret-id dacntt-dev/cloudflare-api-token --query SecretString --output text | tr -d '\r\n')
export CLOUDFLARE_API_TOKEN

# Cùng email_user với lúc bật, để job definition của transcoder không bị đăng
# ký lại chỉ vì biến này đổi.
EMAIL_USER=$(sed -nE 's/^[[:space:]]*email_user[[:space:]]*=[[:space:]]*"([^"]*)".*/\1/p' \
  "$REPO_ROOT/infrastructure/environments/dev/terraform.tfvars" 2>/dev/null | head -1 || true)

terraform -chdir="$TF_DIR" init -input=false >/dev/null
terraform -chdir="$TF_DIR" apply -input=false $AUTO_APPROVE \
  -var backend_enabled=false \
  -var email_user="$EMAIL_USER"

echo ""
echo "  Đã tắt. Không còn EC2, Elastic IP hay ổ EBS nào của staging."
echo "  Bật lại: bash scripts/staging-up.sh <nhánh>"
