#!/bin/bash
exec > /var/log/user-data.log 2>&1
echo "Starting Backend API installation..."

# ═══════════════════════════════════════════════════
# Config — adjust if project_name/environment change
# ═══════════════════════════════════════════════════
PROJECT_SECRET_PREFIX="dacntt-dev"   # matches "${project_name}-${environment}" in Terraform
AWS_REGION="ap-southeast-1"
REPO_URL="https://github.com/DinhQuocCuong28664/DACNTT_VideoStreaming.git"

# Install Node.js 24 LTS, Git, AWS CLI & Nginx
#
# Node 24 (không phải 20): Node 20 đã EOL từ 30/4/2026 và AWS SDK v3 cảnh báo
# sẽ bỏ hỗ trợ. Phần còn lại của dự án (Dockerfile transcoder, CI workflows)
# đều đã dùng Node 24 — giữ đồng bộ để tránh lệch phiên bản giữa các môi trường.
#
# Nginx là bắt buộc, không phải tuỳ chọn: Cloudflare gói Free chỉ proxy một tập
# cổng cố định và KHÔNG có cổng 5000, nên nếu để trình duyệt gọi thẳng
# api.zelostech.site:5000 thì Cloudflare trả lỗi 521. Nginx nhận cổng 80 rồi
# chuyển tiếp nội bộ sang Node ở cổng 5000.
# Chờ cloud-init giải phóng khoá dpkg/apt trước khi cài gì.
#
# Ubuntu chạy unattended-upgrades và apt của chính cloud-init ngay lúc khởi
# động. Nếu userdata gọi apt-get vào đúng lúc đó, lệnh chết với
# "Could not get lock /var/lib/dpkg/lock-frontend" và toàn bộ phần sau của
# script không chạy — Nginx không được cài, cổng 80 từ chối kết nối, máy chủ
# trông như treo dù OS hoàn toàn khoẻ. Đây là lỗi đã thực sự xảy ra ngày
# 2026-08-18 khi dựng lại trên tài khoản AWS mới.
wait_for_apt() {
  local i
  for i in $(seq 1 60); do
    if ! fuser /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock \
         /var/cache/apt/archives/lock >/dev/null 2>&1; then
      return 0
    fi
    echo "apt dang bi khoa boi tien trinh khac, cho 10s (lan $i)..."
    sleep 10
  done
  echo "CANH BAO: van con khoa apt sau 10 phut, van thu tiep tuc."
}

wait_for_apt
# DPkg::Lock::Timeout để apt tự chờ thay vì thất bại ngay nếu vẫn còn tranh khoá
APT_OPTS="-y -o DPkg::Lock::Timeout=600"

curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
wait_for_apt
apt-get update $APT_OPTS
wait_for_apt
apt-get install $APT_OPTS nodejs git build-essential nginx

# awscli cài riêng: gói này không phải lúc nào cũng có trong repo mặc định của
# mọi bản Ubuntu, và nếu nó thiếu thì cả dòng apt-get install ở trên sẽ hỏng
# theo, kéo sập luôn việc cài Nginx.
wait_for_apt
apt-get install $APT_OPTS awscli || {
  echo "awscli khong co trong apt, cai qua bo cai chinh thuc cua AWS"
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  apt-get install $APT_OPTS unzip
  unzip -q /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install
  ln -sf /usr/local/bin/aws /usr/bin/aws
}

npm install -g pm2

# Setup backend directory
mkdir -p /home/ubuntu/app
cd /home/ubuntu/app

git clone "$REPO_URL" .
cd backend

npm install

# ═══════════════════════════════════════════════════
# Fetch secrets from AWS Secrets Manager at boot time
# (requires this EC2 instance to have the
#  "${project_name}-${environment}-ec2-backend-profile"
#  instance profile attached — see
#  infrastructure/modules/iam/main.tf: aws_iam_instance_profile.ec2_backend)
#
# NEVER hardcode real secret values in this file again —
# it is committed to git and would leak them.
# ═══════════════════════════════════════════════════
MONGODB_URI=$(aws secretsmanager get-secret-value \
  --secret-id "${PROJECT_SECRET_PREFIX}/mongodb-uri" \
  --region "$AWS_REGION" \
  --query SecretString --output text)

JWT_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id "${PROJECT_SECRET_PREFIX}/jwt-secret" \
  --region "$AWS_REGION" \
  --query SecretString --output text)

# Email credentials are not yet stored in Secrets Manager.
# Set them manually AFTER first boot via SSH (do not commit real values):
#   sudo sed -i 's|^EMAIL_USER=.*|EMAIL_USER=your_email@gmail.com|' /home/ubuntu/app/backend/.env
#   sudo sed -i 's|^EMAIL_APP_PASSWORD=.*|EMAIL_APP_PASSWORD=your_gmail_app_password|' /home/ubuntu/app/backend/.env
#   sudo -u ubuntu pm2 restart backend-api
EMAIL_USER="REPLACE_ME_AFTER_BOOT"
EMAIL_APP_PASSWORD="REPLACE_ME_AFTER_BOOT"

# Write production .env file (values injected at boot, never hardcoded)
cat << EOF > .env
PORT=5000
MONGODB_URI=${MONGODB_URI}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRE=7d
AWS_REGION=${AWS_REGION}
S3_RAW_BUCKET_NAME=${PROJECT_SECRET_PREFIX}-raw-bucket
S3_PROCESSED_BUCKET_NAME=${PROJECT_SECRET_PREFIX}-processed-bucket
FRONTEND_URL=https://zelostech.site
CLIENT_URL=https://zelostech.site
# Danh sách Origin được phép gọi API. BẮT BUỘC phải khai ở đây: giá trị mặc
# định trong src/server.js chỉ có biến thể https://, nên nếu trang chạy tạm ở
# http:// (lúc chưa có CloudFront/HTTPS) thì mọi request bị chặn CORS và trang
# không tải được video — đúng lỗi đã gặp ngày 2026-08-13. Liệt kê cả hai biến
# thể để chuyển qua lại giữa http và https không phải sửa lại máy chủ.
CORS_ORIGINS=https://zelostech.site,https://www.zelostech.site,http://zelostech.site,http://www.zelostech.site,http://localhost:5173,http://localhost:3000
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=${EMAIL_USER}
EMAIL_APP_PASSWORD=${EMAIL_APP_PASSWORD}
EMAIL_FROM=DACNTT Video Platform <${EMAIL_USER}>
EOF

chmod 600 .env

# ═══════════════════════════════════════════════════
# Nginx reverse proxy: cổng 80 → Node ở cổng 5000
# ═══════════════════════════════════════════════════
cat << 'NGINXEOF' > /etc/nginx/sites-available/api
server {
    listen 80 default_server;
    server_name api.zelostech.site _;

    # Video tải lên đi thẳng lên S3 bằng pre-signed URL nên không qua đây,
    # nhưng vẫn nới giới hạn phòng khi có endpoint nhận tệp trực tiếp.
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXEOF

# Gỡ site mặc định để nó không tranh default_server với cấu hình trên
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/api /etc/nginx/sites-enabled/api
nginx -t && systemctl restart nginx && systemctl enable nginx

# Start PM2 — chạy dưới quyền ubuntu để pm2 startup/save khớp đúng người dùng
cd /home/ubuntu/app/backend
chown -R ubuntu:ubuntu /home/ubuntu/app
sudo -u ubuntu pm2 start src/server.js --name "backend-api"
sudo -u ubuntu pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu
echo "Backend API deployment complete!"
echo "⚠️  Remember to set real EMAIL_USER / EMAIL_APP_PASSWORD via SSH — see comment above."
