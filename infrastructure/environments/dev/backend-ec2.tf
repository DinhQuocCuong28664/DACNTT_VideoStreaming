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

  # MongoDB Atlas, S3, Secrets Manager va cac mirror apt/npm deu khong co dai
  # IP co dinh de ghim; day cung la egress mac dinh AWS tu tao cho moi
  # security group moi neu khong tuy chinh.
  # trivy:ignore:AWS-0104
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

  lifecycle {
    # Bỏ qua thay đổi của `ami`, nếu không máy chủ này sẽ tự huỷ và dựng lại.
    #
    # data.aws_ami.ubuntu đặt most_recent = true, nên mỗi lần Canonical phát
    # hành một bản vá Ubuntu 24.04 là AMI ID đổi. Thuộc tính `ami` của
    # aws_instance thì buộc thay mới khi đổi, nên chỉ cần Canonical đẩy ảnh mới
    # là lần `terraform apply` kế tiếp — dù áp dụng một thay đổi hoàn toàn
    # không liên quan — sẽ huỷ máy chủ đang chạy. Đây không phải giả thiết:
    # bản plan tại thời điểm thêm dòng này đã hiện đúng như vậy
    # (ami-0ed6a65b84536f6ce -> ami-02a51b0cea2315d19, "forces replacement").
    #
    # Cái mất đi không chỉ là một máy ảo. Máy chủ này mang trạng thái được cấu
    # hình bằng tay và KHÔNG nằm trong Terraform: tệp backend/.env (chuỗi kết
    # nối MongoDB, JWT_SECRET, khoá riêng ký CloudFront, mật khẩu ứng dụng
    # Gmail), cấu hình nginx, chứng chỉ Let's Encrypt, và trạng thái tiến trình
    # pm2. Địa chỉ IP công khai cũng đổi theo, làm hỏng bản ghi A trên
    # Cloudflare cho api.zelostech.site.
    #
    # Nâng cấp AMI vì thế phải là hành động có chủ đích — thay bằng
    # `terraform apply -replace=aws_instance.backend_api` sau khi đã sao lưu
    # những thứ trên — chứ không phải hệ quả phụ của một lần apply bất kỳ.
    #
    # Lưu ý user_data_replace_on_change = true ở trên cũng thay mới máy chủ khi
    # scripts/ec2-userdata.sh đổi. Điều đó là cố ý, nhưng nay mang đúng những
    # hậu quả vừa liệt kê, nên hãy sửa tệp đó một cách có ý thức.
    ignore_changes = [ami]
  }
}

# ── Địa chỉ IP cố định ─────────────────────────────
#
# Không có Elastic IP, địa chỉ công khai của máy chủ gắn liền với vòng đời của
# chính instance: dựng lại máy là mất địa chỉ, và bản ghi A cho
# api.zelostech.site trên Cloudflare phải sửa tay. Đây không phải rủi ro giả
# định — instance hiện tại có LaunchTime 30/08/2026 và địa chỉ đã đổi từ
# 13.212.74.63 sang 13.229.211.233 đúng lần dựng lại đó.
#
# ignore_changes trên `ami` ở trên chặn NGUYÊN NHÂN hay gặp nhất khiến máy bị
# dựng lại; Elastic IP chặn nốt HẬU QUẢ, cho mọi lý do dựng lại còn lại — đổi
# instance type, sửa user_data, hay tự tay chạy -replace.
#
# Về chi phí: gắn EIP vào máy đang chạy KHÔNG tốn thêm. Từ 01/02/2024 AWS tính
# phí mọi địa chỉ IPv4 công khai (~$0,005/giờ), và máy này vốn đã có một địa
# chỉ như vậy do associate_public_ip_address = true. EIP thay thế địa chỉ đó
# chứ không cộng thêm, nên số địa chỉ vẫn là một. Cảnh báo duy nhất: một EIP
# đã cấp phát nhưng KHÔNG gắn vào đâu vẫn bị tính tiền — đừng để nó mồ côi.
resource "aws_eip" "backend_api" {
  instance = aws_instance.backend_api.id
  domain   = "vpc"

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-backend-eip"
  })
}

output "backend_public_ip" {
  description = "Tro ban ghi A cua api.zelostech.site tren Cloudflare toi dia chi nay (Elastic IP - co dinh qua cac lan dung lai may chu)"
  value       = aws_eip.backend_api.public_ip
}

output "backend_instance_id" {
  value = aws_instance.backend_api.id
}
