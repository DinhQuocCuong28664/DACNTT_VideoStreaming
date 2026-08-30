# ═══════════════════════════════════════════════════
# Module: VPC — Network (Public Subnets for Dev cost optimization)
# ═══════════════════════════════════════════════════

data "aws_availability_zones" "available" {
  state = "available"
}

# ── VPC ────────────────────────────────────────────
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(var.tags, {
    Name = "${var.project_name}-vpc"
  })
}

# ── Public Subnets (2 AZs) ────────────────────────
resource "aws_subnet" "public" {
  count = 2

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name = "${var.project_name}-public-${data.aws_availability_zones.available.names[count.index]}"
    Tier = "Public"
  })
}

# ── Internet Gateway ──────────────────────────────
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name = "${var.project_name}-igw"
  })
}

# ── Route Table (Public) ──────────────────────────
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ── Security Group for Batch Containers ───────────
resource "aws_security_group" "batch_containers" {
  name        = "${var.project_name}-batch-sg"
  description = "Security group for Batch/Fargate transcoder containers"
  vpc_id      = aws_vpc.main.id

  # Outbound: Allow HTTPS (S3, ECR, SQS, Secrets Manager)
  # 4 dich vu nay khong co dai IP co dinh de gioi han hep hon; chi S3 co VPC
  # Endpoint (xem duoi), ECR/SQS/Secrets Manager thi khong, nen van can egress
  # 443 ra internet.
  # trivy:ignore:AWS-0104
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS outbound (S3, ECR, SQS, Secrets Manager)"
  }

  # Outbound: Allow MongoDB Atlas driver connections.
  # mongodb+srv:// resolves via DNS/HTTPS, but the actual mongod wire
  # protocol connection happens over TCP 27017 — without this rule the
  # container hangs for the full 30s server-selection timeout and crashes
  # with "Could not connect to any servers in your MongoDB Atlas cluster"
  # before it ever gets a chance to write status=ERROR back to the DB.
  # MongoDB Atlas doi IP node theo cum, khong co dai CIDR co dinh de ghim;
  # gioi han hep hon se gay dut ket noi moi khi Atlas doi node.
  # trivy:ignore:AWS-0104
  egress {
    from_port   = 27017
    to_port     = 27017
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "MongoDB Atlas driver connections"
  }

  # Outbound: Allow DNS
  # Phai phan giai duoc moi ten mien (S3, ECR, SQS, MongoDB SRV record...),
  # khong the ghim truoc IP resolver.
  # trivy:ignore:AWS-0104
  egress {
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "DNS resolution"
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-batch-sg"
  })
}

# ── VPC Endpoint for S3 (Gateway — free, reduces latency) ──
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.region}.s3"

  route_table_ids = [aws_route_table.public.id]

  tags = merge(var.tags, {
    Name = "${var.project_name}-s3-endpoint"
  })
}
