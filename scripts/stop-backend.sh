#!/usr/bin/env bash
#
# Tắt máy chủ backend để ngừng tính tiền compute.
#
# Vì sao cần script thay vì bấm Stop trên console: phải tắt canary giám sát
# TRƯỚC khi tắt máy. Nếu không, canary sẽ phát hiện API chết và gửi cảnh báo
# cho một sự cố mà chính bạn vừa gây ra có chủ đích. Cảnh báo cho việc đã biết
# trước là cách nhanh nhất khiến người ta bắt đầu bỏ qua cảnh báo thật.
#
# Ổ đĩa EBS và Elastic IP vẫn được giữ (và vẫn tính tiền, xem cuối script), nên
# toàn bộ trạng thái trên máy — .env, cấu hình nginx, chứng chỉ Let's Encrypt,
# danh sách tiến trình pm2 — còn nguyên khi bật lại.
#
# Cách dùng: bash scripts/stop-backend.sh

set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-1}"
TAG_NAME="${BACKEND_TAG_NAME:-dacntt-dev-backend-api}"
CANARY_RULE="${CANARY_RULE:-dacntt-dev-health-check-schedule}"

echo "── Tắt backend ──────────────────────────────"

# Tìm theo tag thay vì ghi cứng instance ID, giống cách workflow CD làm: khi
# Terraform thay máy thì script không cần sửa theo.
INSTANCE_ID=$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:Name,Values=$TAG_NAME" \
            "Name=instance-state-name,Values=running,pending,stopping,stopped" \
  --query "Reservations[0].Instances[0].InstanceId" --output text)

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  echo "LỖI: không tìm thấy EC2 nào mang tag Name=$TAG_NAME" >&2
  exit 1
fi

STATE=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].State.Name" --output text)

echo "  Instance : $INSTANCE_ID (đang $STATE)"

if [ "$STATE" = "stopped" ]; then
  echo "  Máy đã tắt sẵn, không làm gì thêm."
  exit 0
fi

# Tắt canary trước, không phải sau: thứ tự ngược lại sẽ để lọt ít nhất một lần
# kiểm tra vào đúng lúc API đang chết.
echo "  Tắt canary giám sát ($CANARY_RULE)..."
aws events disable-rule --region "$REGION" --name "$CANARY_RULE"

echo "  Gửi lệnh tắt máy..."
aws ec2 stop-instances --region "$REGION" --instance-ids "$INSTANCE_ID" >/dev/null

echo "  Đang chờ máy dừng hẳn..."
aws ec2 wait instance-stopped --region "$REGION" --instance-ids "$INSTANCE_ID"

echo ""
echo "  Đã tắt. Compute ngừng tính tiền (~8,5 USD/tháng nếu chạy 24/7)."
echo ""
echo "  Vẫn còn tính tiền khi máy tắt:"
echo "    - Ổ đĩa EBS 20 GB      ~1,9 USD/tháng (giữ toàn bộ dữ liệu trên máy)"
echo "    - Elastic IP           ~3,7 USD/tháng (AWS tính phí IPv4 công khai"
echo "                           không gắn với instance đang chạy)"
echo ""
echo "  Giữ Elastic IP là có chủ đích: nhờ nó mà lần bật lại địa chỉ không đổi"
echo "  và bản ghi DNS trên Cloudflare vẫn đúng. Chỉ giải phóng nó nếu bạn tắt"
echo "  máy trong nhiều tuần và chấp nhận phải sửa DNS bằng tay khi bật lại."
echo ""
echo "  Bật lại: bash scripts/start-backend.sh"
