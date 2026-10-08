# ═══════════════════════════════════════════════════
# Module: IAM — Roles & Policies
# ═══════════════════════════════════════════════════

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  own_secrets = "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:${var.project_name}/*"

  # Giữ đúng dạng chuỗi khi không có secret dùng chung, để policy của các môi
  # trường không dùng biến này không đổi một byte nào. Hai nhánh của biểu thức
  # điều kiện phải cùng kiểu, nên cả hai đều là chuỗi JSON rồi mới giải mã lại
  # (một chuỗi, hoặc một danh sách).
  readable_secrets = jsondecode(length(var.extra_secret_arns) == 0 ? jsonencode(local.own_secrets) : jsonencode(concat([local.own_secrets], var.extra_secret_arns)))
}

# ── Batch Service Role ─────────────────────────────
resource "aws_iam_role" "batch_service" {
  name = "${var.project_name}-batch-service-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "batch.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.tags, { Name = "${var.project_name}-batch-service-role" })
}

resource "aws_iam_role_policy_attachment" "batch_service" {
  role       = aws_iam_role.batch_service.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBatchServiceRole"
}

# ── ECS Task Execution Role (Fargate pull ECR + CloudWatch Logs + Secrets) ──
resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.project_name}-ecs-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.tags, { Name = "${var.project_name}-ecs-task-execution-role" })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow task execution role to read secrets from Secrets Manager
resource "aws_iam_role_policy" "ecs_task_execution_secrets" {
  name = "${var.project_name}-ecs-secrets-policy"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = local.readable_secrets
      }
    ]
  })
}

# ── Transcoder Task Role (S3 + SQS access) ────────
resource "aws_iam_role" "transcoder_task" {
  name = "${var.project_name}-transcoder-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.tags, { Name = "${var.project_name}-transcoder-task-role" })
}

resource "aws_iam_role_policy" "transcoder_s3" {
  name = "${var.project_name}-transcoder-s3-policy"
  role = aws_iam_role.transcoder_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:HeadObject"
        ]
        Resource = "${var.raw_bucket_arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = "${var.processed_bucket_arn}/*"
      },
      {
        # Tệp tạm của pipeline chia đoạn (transcoder/src/chunked): kế hoạch, âm thanh đã mã
        # hoá một lần, kết quả từng đoạn, dưới work/<videoId>/ của bucket RAW. Bucket raw riêng
        # tư và không có CloudFront, nên âm thanh gốc của video riêng tư không có URL công khai;
        # event S3 -> SQS chỉ lọc tiền tố videos/ nên ghi vào work/ không kích hoạt job nào.
        # Chỉ ghi và xoá trong work/, không đụng videos/ (nguồn do người dùng tải lên).
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${var.raw_bucket_arn}/work/*"
      },
      {
        # Không có ListBucket thì S3 trả 403 (AccessDenied) thay vì 404 (NoSuchKey) cho khoá
        # chưa tồn tại, và pipeline không phân biệt được "chưa có" với "không có quyền": lần chạy
        # đầu tiên của mọi video dài sẽ đọc submitted.json chưa có và bị coi là lỗi quyền.
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = var.raw_bucket_arn
      }
    ]
  })
}

# Pipeline chia đoạn: job lập kế hoạch (cũng là job Lambda đã nộp) nộp tiếp job con vào hàng đợi
# chính và hàng đợi "bulk" (các đoạn), dùng cùng job definition. Thu hẹp đúng về các tài nguyên đó, như chính sách của Lambda
# bên dưới; ARN dựng theo quy tắc đặt tên của module batch vì batch phụ thuộc vào module này để
# lấy role (tham chiếu ngược sẽ thành phụ thuộc vòng), nên đổi tên bên batch thì phải sửa ở đây.
resource "aws_iam_role_policy" "transcoder_batch_submit" {
  name = "${var.project_name}-transcoder-batch-submit-policy"
  role = aws_iam_role.transcoder_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "batch:SubmitJob"
        Resource = [
          "arn:aws:batch:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:job-queue/${var.project_name}-transcode-queue",
          "arn:aws:batch:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:job-queue/${var.project_name}-transcode-bulk-queue",
          "arn:aws:batch:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:job-definition/${var.project_name}-transcoder-job",
          "arn:aws:batch:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:job-definition/${var.project_name}-transcoder-job:*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "transcoder_sqs" {
  name = "${var.project_name}-transcoder-sqs-policy"
  role = aws_iam_role.transcoder_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:ChangeMessageVisibility",
          "sqs:GetQueueAttributes"
        ]
        Resource = var.sqs_queue_arn
      }
    ]
  })
}

# Kiểm duyệt nội dung: transcoder gửi khung hình trích từ video tới Amazon
# Rekognition (transcoder/src/moderation.js). DetectModerationLabels với mô
# hình gốc không gắn với tài nguyên cụ thể nào — tài liệu IAM của Rekognition
# chỉ cho giới hạn theo ARN khi dùng custom adapter — nên Resource là "*";
# quyền vẫn hẹp vì chỉ gồm đúng một hành động chỉ-đọc, không tạo tài nguyên.
resource "aws_iam_role_policy" "transcoder_rekognition" {
  name = "${var.project_name}-transcoder-rekognition-policy"
  role = aws_iam_role.transcoder_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["rekognition:DetectModerationLabels"]
        Resource = "*"
      }
    ]
  })
}

# ── Lambda Job Submitter Role ─────────────────────
resource "aws_iam_role" "lambda_job_submitter" {
  name = "${var.project_name}-lambda-job-submitter-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.tags, { Name = "${var.project_name}-lambda-job-submitter-role" })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_job_submitter.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}


# ── EC2 Backend API Instance Role (read secrets from Secrets Manager) ──
# Attach this role's instance profile to the EC2 instance running the
# Express backend so scripts/ec2-userdata.sh can fetch MONGODB_URI and
# JWT_SECRET at boot time instead of hardcoding them in the script.
resource "aws_iam_role" "ec2_backend" {
  name = "${var.project_name}-ec2-backend-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.tags, { Name = "${var.project_name}-ec2-backend-role" })
}

resource "aws_iam_role_policy" "ec2_backend_secrets" {
  name = "${var.project_name}-ec2-backend-secrets-policy"
  role = aws_iam_role.ec2_backend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = local.readable_secrets
      }
    ]
  })
}

# Quyền S3 cho Backend API.
#
# Backend không tự tải tệp lên: nó ký sẵn pre-signed URL để trình duyệt PUT
# thẳng lên S3 (kiến trúc mô tả ở Mục 5 của đề tài). Nhưng để ký được URL,
# tiến trình vẫn phải có quyền s3:PutObject trên đúng đối tượng đó — chữ ký chỉ
# hợp lệ trong phạm vi quyền của thực thể đã ký. Thiếu policy này, mọi yêu cầu
# initiate-upload trả về lỗi quyền dù mã nguồn hoàn toàn đúng.
#
# DeleteObject cần cho chức năng xoá video (xoá cả tệp gốc lẫn các tệp HLS đã
# chuyển mã); ListBucket cần để liệt kê rồi xoá theo tiền tố thư mục.
#
# Tải lên multipart (tệp lớn): CreateMultipartUpload, UploadPart và
# CompleteMultipartUpload đều được cấp bởi s3:PutObject. Hai quyền riêng cần thêm,
# chỉ trên bucket video gốc: s3:ListMultipartUploadParts để máy chủ tự liệt kê các
# phần đã lên S3 trước khi ghép (không tin ETag do trình duyệt gửi), và
# s3:AbortMultipartUpload để huỷ lượt tải dở khi người dùng bỏ giữa chừng. Phần đã
# tải của một lượt chưa hoàn tất vẫn bị tính phí lưu trữ cho tới khi bị huỷ.
resource "aws_iam_role_policy" "ec2_backend_s3" {
  name = "${var.project_name}-ec2-backend-s3-policy"
  role = aws_iam_role.ec2_backend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        Resource = [
          "${var.raw_bucket_arn}/*",
          "${var.processed_bucket_arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = [
          var.raw_bucket_arn,
          var.processed_bucket_arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListMultipartUploadParts",
          "s3:AbortMultipartUpload"
        ]
        Resource = ["${var.raw_bucket_arn}/*"]
      }
      ], var.static_bucket_arn == "" ? [] : [
      # Ảnh đại diện: backend chỉ ký presigned POST vào avatars/, không cần
      # đọc, xoá hay liệt kê gì trong bucket host frontend.
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = ["${var.static_bucket_arn}/avatars/*"]
      }
    ])
  })
}

# Cho phép quản trị máy chủ qua AWS Systems Manager (Session Manager) thay vì
# SSH bằng khoá riêng.
#
# Lý do thêm: khi máy chủ backend không phản hồi, cách duy nhất để đọc
# /var/log/user-data.log là vào được máy. Instance trước đây không gắn key pair
# nào nên không SSH được, phải phụ thuộc EC2 Instance Connect thao tác tay trên
# Console. Có SSM thì đọc log và chạy lệnh chẩn đoán được từ dòng lệnh, không
# cần mở thêm cổng hay quản lý khoá SSH.
resource "aws_iam_role_policy_attachment" "ec2_backend_ssm" {
  role       = aws_iam_role.ec2_backend.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2_backend" {
  name = "${var.project_name}-ec2-backend-profile"
  role = aws_iam_role.ec2_backend.name
}

resource "aws_iam_role_policy" "lambda_sqs_batch" {
  name = "${var.project_name}-lambda-sqs-batch-policy"
  role = aws_iam_role.lambda_job_submitter.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = var.sqs_queue_arn
      },
      {
        # SubmitJob co ho tro gioi han theo tai nguyen, nen thu hep dung ve hang
        # doi va job definition cua du an. Truoc day ca hai hanh dong dung chung
        # Resource = "*", nghia la ham nay nop duoc job vao BAT KY hang doi nao
        # trong tai khoan — rong hon nhieu so voi viec no thuc su lam.
        Effect = "Allow"
        Action = "batch:SubmitJob"
        # ARN dung theo quy tac dat ten cua module batch thay vi tham chieu
        # module.batch: batch phu thuoc vao module nay de lay role, nen tham
        # chieu nguoc lai se tao phu thuoc vong. Doi lai, neu ten tai nguyen ben
        # batch doi thi phai sua o day — rang buoc do duoc ghi ro o ca hai noi.
        Resource = [
          "arn:aws:batch:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:job-queue/${var.project_name}-transcode-queue",
          "arn:aws:batch:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:job-definition/${var.project_name}-transcoder-job",
          "arn:aws:batch:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:job-definition/${var.project_name}-transcoder-job:*"
        ]
      },
      {
        # DescribeJobs thi khong ho tro gioi han theo tai nguyen — no nhan job ID
        # tuy y — nen "*" o day la bat buoc chu khong phai buong long.
        Effect   = "Allow"
        Action   = "batch:DescribeJobs"
        Resource = "*"
      }
    ]
  })
}
