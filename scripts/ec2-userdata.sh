#!/bin/bash
exec > /var/log/user-data.log 2>&1
echo "Starting Backend API installation..."

# ═══════════════════════════════════════════════════
# Config — adjust if project_name/environment change
# ═══════════════════════════════════════════════════
PROJECT_SECRET_PREFIX="dacntt-dev"   # matches "${project_name}-${environment}" in Terraform
AWS_REGION="ap-southeast-1"
REPO_URL="https://github.com/DinhQuocCuong28664/DACNTT_VideoStreaming.git"

# Install Node.js 20 LTS, Git & AWS CLI
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get update -y
apt-get install -y nodejs git build-essential awscli

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
FRONTEND_URL=http://zelostech.site
CLIENT_URL=http://zelostech.site
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=${EMAIL_USER}
EMAIL_APP_PASSWORD=${EMAIL_APP_PASSWORD}
EMAIL_FROM=DACNTT Video Platform <${EMAIL_USER}>
EOF

chmod 600 .env

# Start PM2
pm2 start src/server.js --name "backend-api"
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu
chown -R ubuntu:ubuntu /home/ubuntu/app
echo "Backend API deployment complete!"
echo "⚠️  Remember to set real EMAIL_USER / EMAIL_APP_PASSWORD via SSH — see comment above."
