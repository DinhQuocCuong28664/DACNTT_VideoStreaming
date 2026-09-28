#!/usr/bin/env bash
#
# Bật staging cho một nhánh: dựng máy chủ backend, chờ API sẵn sàng, rồi kích
# hoạt workflow deploy frontend + transcoder của đúng nhánh đó.
#
# Staging theo "cách 2": lúc tắt không có máy chủ, Elastic IP hay bản ghi DNS
# api-staging nào (xem infrastructure/environments/staging/backend-ec2.tf). Bật
# là dựng máy mới — mất khoảng 5–10 phút cho apt, npm và chứng chỉ TLS.
#
# Cách dùng:
#   bash scripts/staging-up.sh              # nhánh hiện tại
#   bash scripts/staging-up.sh develop      # nhánh chỉ định
#   bash scripts/staging-up.sh develop -y   # không hỏi xác nhận terraform apply
#
# Yêu cầu: AWS CLI (profile mặc định = account chính, profile "dacntt-a" =
# account A), Terraform, git; gh CLI nếu muốn script tự kích hoạt workflow.
# Xong việc thì tắt: bash scripts/staging-down.sh

set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-1}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TF_DIR="$REPO_ROOT/infrastructure/environments/staging"
API_URL="https://api-staging.zelostech.site/"
FRONTEND_URL="https://staging.zelostech.site/"
CHO_TOI_DA=90   # 90 lần x 10 giây = tối đa 15 phút

REF="${1:-$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)}"
AUTO_APPROVE=""
[ "${2:-}" = "-y" ] && AUTO_APPROVE="-auto-approve"

echo "── Bật staging cho nhánh: $REF ─────────────────"

# Máy chủ clone code từ GitHub, không phải từ máy này: nhánh chưa push thì máy
# dựng xong sẽ chạy nhầm code (hoặc clone thất bại).
if ! git -C "$REPO_ROOT" ls-remote --exit-code --heads origin "$REF" >/dev/null 2>&1; then
  echo "LỖI: nhánh '$REF' chưa có trên GitHub. Chạy: git push -u origin $REF" >&2
  exit 1
fi
LOCAL_SHA=$(git -C "$REPO_ROOT" rev-parse "$REF" 2>/dev/null || echo "")
REMOTE_SHA=$(git -C "$REPO_ROOT" ls-remote origin "refs/heads/$REF" | cut -f1)
if [ -n "$LOCAL_SHA" ] && [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  echo "CẢNH BÁO: '$REF' trên máy này ($LOCAL_SHA) khác GitHub ($REMOTE_SHA); staging sẽ chạy bản trên GitHub."
fi

# Terraform quản lý bản ghi DNS của staging trên Cloudflare, dùng chung token
# với certbot của production. Token chỉ nằm trong biến môi trường của tiến
# trình này.
CLOUDFLARE_API_TOKEN=$(aws secretsmanager get-secret-value --region "$REGION" \
  --secret-id dacntt-dev/cloudflare-api-token --query SecretString --output text | tr -d '\r\n')
export CLOUDFLARE_API_TOKEN

# Địa chỉ gửi mail giống production (không phải bí mật).
EMAIL_USER=$(sed -nE 's/^[[:space:]]*email_user[[:space:]]*=[[:space:]]*"([^"]*)".*/\1/p' \
  "$REPO_ROOT/infrastructure/environments/dev/terraform.tfvars" 2>/dev/null | head -1 || true)

terraform -chdir="$TF_DIR" init -input=false >/dev/null
terraform -chdir="$TF_DIR" apply -input=false $AUTO_APPROVE \
  -var backend_enabled=true \
  -var git_ref="$REF" \
  -var email_user="$EMAIL_USER"

echo "  Đang chờ API staging sẵn sàng tại $API_URL ..."
for ((i = 1; i <= CHO_TOI_DA; i++)); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API_URL" || echo 000)
  if [ "$CODE" = "200" ]; then
    echo "  API staging phản hồi 200 (đã kết nối MongoDB) sau $((i * 10))s."
    break
  fi
  printf "    lần %2d: HTTP %s\n" "$i" "$CODE"
  if [ "$i" = "$CHO_TOI_DA" ]; then
    INSTANCE_ID=$(terraform -chdir="$TF_DIR" output -raw backend_instance_id 2>/dev/null || echo "?")
    echo "LỖI: API staging không phản hồi sau $((CHO_TOI_DA * 10))s." >&2
    echo "  Xem log dựng máy: aws ssm start-session --target $INSTANCE_ID" >&2
    echo "    rồi: sudo tail -n 80 /var/log/user-data.log" >&2
    echo "  Staging VẪN ĐANG BẬT (và tính tiền) — tắt bằng: bash scripts/staging-down.sh" >&2
    exit 1
  fi
  sleep 10
done

# Frontend và image transcoder do workflow build và deploy, để staging chạy
# đúng thứ CI sẽ đưa lên production.
if command -v gh >/dev/null 2>&1; then
  echo "  Kích hoạt workflow cd-staging.yml cho nhánh $REF ..."
  gh workflow run cd-staging.yml --ref "$REF"
  echo "  Theo dõi: gh run watch \$(gh run list --workflow cd-staging.yml --limit 1 --json databaseId -q '.[0].databaseId')"
else
  echo "  Chưa có gh CLI: vào GitHub → Actions → 'CD — Deploy to Staging' → Run workflow, chọn nhánh $REF."
fi

echo ""
echo "  Staging: $FRONTEND_URL  (API: $API_URL)"
echo "  Thử xong thì tắt để ngừng tính tiền: bash scripts/staging-down.sh"
