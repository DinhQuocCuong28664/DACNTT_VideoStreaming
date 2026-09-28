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

# ── Dải IP Cloudflare ──────────────────────────────
#
# api.zelostech.site là bản ghi proxied trên Cloudflare, nên người dùng không
# bao giờ kết nối thẳng tới máy chủ: mọi request hợp lệ đều tới từ các dải dưới
# đây. Trước đây cổng 80/443 mở cho 0.0.0.0/0, ai biết địa chỉ Elastic IP là gọi
# thẳng được, vòng qua toàn bộ lớp chống DDoS và WAF của Cloudflare.
#
# Cloudflare xếp cách này ở mức "khá an toàn": nó chặn được việc vòng qua
# Cloudflare, nhưng mọi khách hàng Cloudflare đều đi ra từ cùng các dải này.
# Mạnh hơn là Authenticated Origin Pulls (mTLS) hoặc Cloudflare Tunnel.
#
# Lấy từ https://www.cloudflare.com/ips-v4 ngày 2026-09-28. Cloudflare yêu cầu
# cập nhật định kỳ; khi đổi thì sửa cùng lúc với backend/src/config/
# trustedProxies.js, nơi Express dùng cùng danh sách để đọc đúng IP người dùng.
# Chỉ có IPv4 vì VPC này không cấp IPv6.
locals {
  cloudflare_ipv4_cidrs = [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
  ]
}

resource "aws_security_group" "backend_api" {
  name        = "${var.project_name}-${var.environment}-backend-sg"
  description = "Backend API: HTTP/HTTPS tu Internet, SSH de quan tri"
  vpc_id      = module.vpc.vpc_id

  # Nginx nhận cổng 80 rồi chuyển tiếp nội bộ sang Node (cổng 5000). Cổng 5000
  # KHÔNG mở ra Internet: Cloudflare gói Free không proxy được cổng đó, và mở
  # thừa chỉ làm tăng bề mặt tấn công.
  #
  # 15 dải x 2 cổng = 30 rule, dưới hạn mức mặc định 60 rule inbound IPv4 của
  # một security group.
  ingress {
    description = "HTTP (Nginx reverse proxy), chi tu Cloudflare"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = local.cloudflare_ipv4_cidrs
  }

  ingress {
    description = "HTTPS (Cloudflare che do Full ket noi qua cong nay), chi tu Cloudflare"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = local.cloudflare_ipv4_cidrs
  }

  # Không mở cổng 22. Máy không gắn key pair nào nên không SSH được, và mọi
  # thao tác quản trị đi qua SSM (deploy trong cd-deploy.yml, đọc log bằng
  # Session Manager) — Session Manager không cần cổng inbound nào. Rule SSH cho
  # 0.0.0.0/0 trước đây chỉ để lộ sshd ra Internet mà không dùng vào việc gì.
  # (Mô tả của security group vẫn nhắc SSH vì đổi mô tả buộc Terraform thay mới
  # cả nhóm đang gắn vào máy.)

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

module "backend_userdata" {
  source = "../../modules/backend-userdata"

  project_prefix       = "${var.project_name}-${var.environment}"
  shared_secret_prefix = "${var.project_name}-${var.environment}"
  git_ref              = "master"
  frontend_url         = "https://zelostech.site"
  # Bỏ localhost:5173/3000 khỏi danh sách cũ: đó là origin phát triển cục bộ,
  # không có lý do gì để API production chấp nhận request kèm credentials từ đó.
  cors_origins           = "https://zelostech.site,https://www.zelostech.site,http://zelostech.site,http://www.zelostech.site"
  static_bucket_name     = aws_s3_bucket.frontend.bucket
  api_domain             = "api.zelostech.site"
  cloudfront_domain      = "cdn.zelostech.site"
  email_user             = var.email_user
  cloudfront_key_pair_id = module.cloudfront.signing_key_pair_id != null ? module.cloudfront.signing_key_pair_id : ""
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

  # Script dùng chung với staging, điền giá trị của production qua
  # module.backend_userdata (bên dưới). Mật khẩu Gmail, khoá riêng CloudFront
  # và token Cloudflare thì script tự đọc từ Secrets Manager lúc khởi động.
  user_data                   = module.backend_userdata.rendered
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
    # Khi dòng này được viết, máy chủ mang trạng thái cấu hình tay nằm ngoài
    # Terraform: backend/.env, cấu hình nginx, chứng chỉ Let's Encrypt. Đến
    # 2026-09-25 cả ba đã do scripts/ec2-userdata.sh dựng lại từ Secrets
    # Manager (kể cả chứng chỉ, qua certbot dns-cloudflare), và Elastic IP bên
    # dưới giữ nguyên địa chỉ. Dựng lại máy vẫn có vài phút gián đoạn, nên việc
    # đó vẫn phải là hành động có chủ đích.
    #
    # Nâng cấp AMI vì thế phải là hành động có chủ đích — thay bằng
    # `terraform apply -replace=aws_instance.backend_api` sau khi đã sao lưu
    # những thứ trên — chứ không phải hệ quả phụ của một lần apply bất kỳ.
    #
    # Lưu ý user_data_replace_on_change = true ở trên cũng thay mới máy chủ khi
    # scripts/ec2-userdata.sh đổi. Điều đó là cố ý, nhưng nay mang đúng những
    # hậu quả vừa liệt kê, nên hãy sửa tệp đó một cách có ý thức.
    #
    # `user_data` cũng được bỏ qua vì cùng lý do: script dùng chung với staging
    # và sẽ còn được sửa, mà mỗi lần sửa thì user_data_replace_on_change sẽ dựng
    # lại máy production ở lần apply kế tiếp. Máy nhận script mới khi chủ động
    # chạy `terraform apply -replace=aws_instance.backend_api`. Staging không bỏ
    # qua: mỗi lần bật là một máy mới, luôn chạy script mới nhất.
    ignore_changes = [ami, user_data]
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
