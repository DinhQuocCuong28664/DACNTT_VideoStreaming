#!/usr/bin/env bash
#
# Bật lại máy chủ backend sau khi đã tắt bằng stop-backend.sh.
#
# Điểm mấu chốt của script này là KHÔNG dừng lại ở trạng thái "instance đang
# chạy". Máy chạy không có nghĩa API phục vụ được: nginx và pm2 tự khởi động
# theo systemd nhưng mất thêm một lúc, và trong khoảng đó tên miền vẫn trả lỗi.
# Script vì thế chờ tới khi API thực sự trả 200 rồi mới bật lại canary — bật
# sớm hơn thì canary sẽ cảnh báo về chính giai đoạn khởi động bình thường.
#
# Cách dùng: bash scripts/start-backend.sh

set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-1}"
TAG_NAME="${BACKEND_TAG_NAME:-dacntt-dev-backend-api}"
CANARY_RULE="${CANARY_RULE:-dacntt-dev-health-check-schedule}"
API_URL="${API_URL:-https://api.zelostech.site/}"
CHO_TOI_DA=40   # 40 lần x 10 giây = tối đa ~7 phút

echo "── Bật backend ──────────────────────────────"

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

if [ "$STATE" != "running" ]; then
  echo "  Gửi lệnh bật máy..."
  aws ec2 start-instances --region "$REGION" --instance-ids "$INSTANCE_ID" >/dev/null
  echo "  Đang chờ máy chạy..."
  aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE_ID"
fi

IP=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].PublicIpAddress" --output text)
echo "  Địa chỉ công khai: $IP"

# Kiểm chứng thật thay vì tin vào trạng thái instance. Đây cũng là nơi phát
# hiện được nếu Elastic IP vì lý do nào đó không còn gắn đúng: khi ấy tên miền
# sẽ mãi không trả 200 dù máy chạy bình thường.
echo "  Đang chờ API phản hồi tại $API_URL ..."
for ((i = 1; i <= CHO_TOI_DA; i++)); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API_URL" || echo 000)
  if [ "$CODE" = "200" ]; then
    echo "  API đã phản hồi (HTTP 200) sau $((i * 10))s."
    echo "  Bật lại canary giám sát ($CANARY_RULE)..."
    aws events enable-rule --region "$REGION" --name "$CANARY_RULE"
    echo ""
    echo "  Xong. Hệ thống hoạt động bình thường."
    exit 0
  fi
  printf "    lần %2d: HTTP %s\n" "$i" "$CODE"
  sleep 10
done

echo "" >&2
echo "LỖI: API không phản hồi sau $((CHO_TOI_DA * 10))s." >&2
echo "  Canary CHƯA được bật lại — bật thủ công sau khi khắc phục xong:" >&2
echo "    aws events enable-rule --region $REGION --name $CANARY_RULE" >&2
echo "" >&2
echo "  Hướng kiểm tra:" >&2
echo "    - Bản ghi A của tên miền có trỏ đúng $IP không (Cloudflare)" >&2
echo "    - Trên máy: systemctl status nginx; sudo -u ubuntu pm2 list" >&2
exit 1
