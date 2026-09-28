# ═══════════════════════════════════════════════════
# Staging — máy chủ backend, chỉ tồn tại khi backend_enabled = true
#
# Cách 2 của thiết kế staging: tắt là XOÁ hẳn EC2, Elastic IP và bản ghi DNS
# api-staging (không giữ ổ EBS hay địa chỉ IPv4 tốn tiền lúc rảnh), bật là
# dựng máy mới từ scripts/ec2-userdata.sh — luôn là script mới nhất, và clone
# đúng var.git_ref. Xem scripts/staging-up.sh / staging-down.sh.
#
# Chứng chỉ TLS cho api-staging do certbot xin ở mỗi lần dựng (DNS-01 qua
# Cloudflare, như production). Let's Encrypt giới hạn 5 chứng chỉ trùng tên mỗi
# 7 ngày: bật staging quá 5 lần/tuần thì lần thứ 6 không có HTTPS (Cloudflare
# trả 521) cho tới khi hết hạn chế.
# ═══════════════════════════════════════════════════

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

module "cloudflare_ips" {
  source = "../../modules/cloudflare-ips"
}

# Security group không tốn tiền nên giữ lại cả khi tắt.
resource "aws_security_group" "backend_api" {
  name        = "${local.prefix}-backend-sg"
  description = "Backend API staging: HTTP/HTTPS chi tu Cloudflare"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "HTTP (Nginx), chi tu Cloudflare"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = module.cloudflare_ips.ipv4_cidrs
  }

  ingress {
    description = "HTTPS, chi tu Cloudflare"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = module.cloudflare_ips.ipv4_cidrs
  }

  # MongoDB Atlas, S3, Secrets Manager, apt/npm không có dải IP cố định.
  # trivy:ignore:AWS-0104
  egress {
    description = "Goi ra ngoai: MongoDB Atlas, S3, Secrets Manager, apt/npm"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-backend-sg" })
}

module "backend_userdata" {
  source = "../../modules/backend-userdata"

  project_prefix         = local.prefix
  shared_secret_prefix   = local.dev_prefix
  git_ref                = var.git_ref
  frontend_url           = local.frontend_url
  cors_origins           = local.frontend_url
  static_bucket_name     = aws_s3_bucket.frontend.bucket
  api_domain             = local.api_domain
  cloudfront_domain      = local.cdn_domain
  email_user             = var.email_user
  cloudfront_key_pair_id = module.cloudfront.signing_key_pair_id
}

resource "aws_instance" "backend_api" {
  count = var.backend_enabled ? 1 : 0

  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.backend_instance_type
  subnet_id                   = module.vpc.public_subnet_ids[0]
  vpc_security_group_ids      = [aws_security_group.backend_api.id]
  iam_instance_profile        = module.iam.ec2_backend_instance_profile_name
  associate_public_ip_address = true

  user_data_base64            = module.backend_userdata.rendered_base64gzip
  user_data_replace_on_change = true

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  metadata_options {
    http_tokens = "required" # IMDSv2
  }

  tags = merge(local.common_tags, {
    # cd-staging.yml và role deploy staging tìm máy theo đúng tên này.
    Name = "${local.prefix}-backend-api"
    Role = "Backend API Server (staging)"
  })

  depends_on = [
    aws_secretsmanager_secret_version.mongodb_uri,
    aws_secretsmanager_secret_version.jwt_secret,
    aws_secretsmanager_secret_version.cloudfront_private_key,
  ]
}

resource "aws_eip" "backend_api" {
  count    = var.backend_enabled ? 1 : 0
  instance = aws_instance.backend_api[0].id
  domain   = "vpc"
  tags     = merge(local.common_tags, { Name = "${local.prefix}-backend-eip" })
}

resource "cloudflare_dns_record" "api" {
  count   = var.backend_enabled ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = local.api_domain
  type    = "A"
  content = aws_eip.backend_api[0].public_ip
  ttl     = 1
  proxied = true # như api.zelostech.site: đi qua Cloudflare, SG chỉ nhận dải Cloudflare
  comment = "Staging API (Terraform, xoa khi tat staging)"
}
