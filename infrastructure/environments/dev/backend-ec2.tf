# ═══════════════════════════════════════════════════
# Backend API — EC2 instance
#
# Trước đây máy chủ này được tạo thủ công qua Console, nằm ngoài Terraform.
# Điều đó mâu thuẫn với tuyên bố "toàn bộ hạ tầng khởi tạo bằng một lệnh
# terraform apply" của đồ án, và đã gây hậu quả thật: khi tài khoản AWS cũ bị
# đóng, mọi thứ khác dựng lại được bằng một lệnh, riêng máy chủ backend phải
# dựng tay lại từ đầu. Nay đưa vào IaC để lời khẳng định trong báo cáo đúng với
# thực tế.
# ═══════════════════════════════════════════════════

# Ubuntu 24.04 LTS mới nhất, tra động thay vì ghi cứng AMI ID — AMI ID khác
# nhau theo từng region và bị thay mới mỗi lần Canonical phát hành bản vá.
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_security_group" "backend_api" {
  name        = "${var.project_name}-${var.environment}-backend-sg"
  description = "Backend API: HTTP/HTTPS tu Internet, SSH de quan tri"
  vpc_id      = module.vpc.vpc_id

  # Nginx nhận cổng 80 rồi chuyển tiếp nội bộ sang Node (cổng 5000). Cổng 5000
  # KHÔNG mở ra Internet: Cloudflare gói Free không proxy được cổng đó, và mở
  # thừa chỉ làm tăng bề mặt tấn công.
  ingress {
    description = "HTTP (Nginx reverse proxy)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS (du phong cho khi dung chung chi TLS truc tiep tren may chu)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH quan tri"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Cho phep goi ra ngoai: MongoDB Atlas, S3, Secrets Manager, apt/npm"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-backend-sg"
  })
}

resource "aws_instance" "backend_api" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.backend_instance_type
  subnet_id     = module.vpc.public_subnet_ids[0]

  vpc_security_group_ids = [aws_security_group.backend_api.id]

  # Cho phép máy chủ tự đọc MONGODB_URI và JWT_SECRET từ Secrets Manager lúc
  # khởi động, thay vì ghi cứng bí mật vào script (script này nằm trong git).
  iam_instance_profile = module.iam.ec2_backend_instance_profile_name

  associate_public_ip_address = true

  user_data                   = file("${path.module}/../../../scripts/ec2-userdata.sh")
  user_data_replace_on_change = true

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-backend-api"
    Role = "Backend API Server"
  })
}

output "backend_public_ip" {
  description = "Tro ban ghi A cua api.zelostech.site tren Cloudflare toi dia chi nay"
  value       = aws_instance.backend_api.public_ip
}

output "backend_instance_id" {
  value = aws_instance.backend_api.id
}
