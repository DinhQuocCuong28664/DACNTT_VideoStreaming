#!/bin/bash
exec > /var/log/user-data.log 2>&1
echo "Starting Backend API installation..."

# Install Node.js 20 LTS & Git
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get update -y
apt-get install -y nodejs git build-essential

npm install -g pm2

# Setup backend directory
mkdir -p /home/ubuntu/app
cd /home/ubuntu/app

git clone https://github.com/DinhQuocCuong28664/DACNTT_VideoStreaming.git .
cd backend

npm install

# Write production .env file
cat << 'EOF' > .env
PORT=5000
MONGODB_URI=mongodb+srv://cbzero28664_db_user:BBY3BTPtPKO3XzhF@dacntt-videostreaming.kunxhmk.mongodb.net/vidshare?appName=DACNTT-VideoStreaming
JWT_SECRET=8a50Fzpuarfx47RKjRZz8XZi/IxLwVhI2VHWnQ+PgyLxfha2nxGC8767cw3NwWdI
JWT_EXPIRE=7d
AWS_REGION=ap-southeast-1
S3_RAW_BUCKET_NAME=dacntt-dev-raw-bucket
S3_PROCESSED_BUCKET_NAME=dacntt-dev-processed-bucket
CLIENT_URL=http://zelostech.site
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=cbzero28664@gmail.com
EMAIL_APP_PASSWORD=nrcx ymgv agpk gmch
EMAIL_FROM=DACNTT Video Platform <cbzero28664@gmail.com>
EOF

# Start PM2
pm2 start src/server.js --name "backend-api"
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu
chown -R ubuntu:ubuntu /home/ubuntu/app
echo "Backend API deployment complete!"
