# ═══════════════════════════════════════════════════
# Module: Batch — AWS Batch Compute Environment (Fargate)
# ═══════════════════════════════════════════════════

# ── Compute Environment (Fargate Serverless) ──────
resource "aws_batch_compute_environment" "fargate" {
  compute_environment_name = "${var.project_name}-fargate-ce"
  type                     = "MANAGED"
  state                    = "ENABLED"
  service_role             = var.batch_service_role_arn

  compute_resources {
    type      = var.use_spot ? "FARGATE_SPOT" : "FARGATE"
    max_vcpus = var.max_vcpus

    subnets            = var.subnet_ids
    security_group_ids = [var.security_group_id]
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-fargate-ce"
  })
}

# ── Job Queue ─────────────────────────────────────
resource "aws_batch_job_queue" "transcode" {
  # Ten nay duoc chinh sach IAM cua Lambda job submitter dung de dung ARN
  # (modules/iam/main.tf). Doi ten o day ma khong sua ben do se lam Lambda mat
  # quyen nop job.
  name     = "${var.project_name}-transcode-queue"
  state    = "ENABLED"
  priority = 1

  compute_environment_order {
    order               = 1
    compute_environment = aws_batch_compute_environment.fargate.arn
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-transcode-job-queue"
  })
}

# ── Job Definition (Transcoder Container) ─────────
resource "aws_batch_job_definition" "transcoder" {
  name = "${var.project_name}-transcoder-job"
  type = "container"

  platform_capabilities = ["FARGATE"]

  container_properties = jsonencode({
    image            = "${var.ecr_repository_url}:latest"
    jobRoleArn       = var.transcoder_task_role_arn
    executionRoleArn = var.ecs_task_execution_role_arn

    resourceRequirements = [
      { type = "VCPU", value = tostring(var.job_vcpu) },
      { type = "MEMORY", value = tostring(var.job_memory) }
    ]

    networkConfiguration = {
      assignPublicIp = "ENABLED"
    }

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = var.transcoder_log_group
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "transcoder"
      }
    }

    environment = concat(
      [
        { name = "AWS_REGION", value = var.region },
        { name = "S3_RAW_BUCKET_NAME", value = var.raw_bucket_name },
        { name = "S3_PROCESSED_BUCKET_NAME", value = var.processed_bucket_name },
        { name = "SQS_QUEUE_URL", value = var.sqs_queue_url },
        { name = "CLOUDFRONT_DOMAIN", value = var.cloudfront_domain },
        { name = "EMAIL_HOST", value = var.email_host },
        { name = "EMAIL_PORT", value = var.email_port }
      ],
      var.email_user != "" ? [{ name = "EMAIL_USER", value = var.email_user }] : [],
      var.email_from != "" ? [{ name = "EMAIL_FROM", value = var.email_from }] : [],
      var.frontend_url != "" ? [{ name = "FRONTEND_URL", value = var.frontend_url }] : []
    )

    # EMAIL_APP_PASSWORD chỉ được thêm khi đã có secret thật (email_app_password_secret_arn
    # khác rỗng) — tránh đăng ký Job Definition với ARN rỗng khiến AWS Batch từ
    # chối cấu hình. Khi chưa cấu hình email, transcoder vẫn chạy bình thường,
    # chỉ là bước gửi email sẽ tự bỏ qua (xem notifySafely trong index.js).
    secrets = concat(
      [
        {
          name      = "MONGODB_URI"
          valueFrom = var.mongodb_uri_secret_arn
        }
      ],
      var.email_app_password_secret_arn != "" ? [
        {
          name      = "EMAIL_APP_PASSWORD"
          valueFrom = var.email_app_password_secret_arn
        }
      ] : []
    )

    command = ["node", "src/index.js", "batch"]
  })

  # ── Thử lại ────────────────────────────────────────
  #
  # Trước đây job definition không khai báo retry, và điều đó tạo ra một lỗ
  # hổng dễ hiểu nhầm. Kiến trúc triển khai là S3 → SQS → Lambda → Batch, trong
  # đó Lambda nộp job rồi trả về NGAY; SQS vì thế xoá message ngay khi job được
  # nộp, chứ không phải khi transcode xong. Nghĩa là khi container thất bại,
  # message SQS đã biến mất từ lâu và KHÔNG có tầng nào thử lại — không phải
  # SQS (message đã xoá), không phải Batch (không khai báo retry). Một lỗi
  # thoáng qua như mạng chập chờn lúc tải file nguồn là đủ để mất hẳn video.
  #
  # evaluate_on_exit chỉ thử lại các lỗi hạ tầng: Fargate thu hồi Spot capacity,
  # hoặc container không khởi tạo được. Lỗi do chính nội dung video (FFmpeg từ
  # chối file hỏng) thoát với mã khác và dừng ngay, vì thử lại chỉ tốn tiền mà
  # kết quả không đổi.
  retry_strategy {
    attempts = 3

    # Mẫu khớp chỉ được kết thúc bằng dấu sao, không được bắt đầu bằng dấu sao —
    # Terraform từ chối ngay ở bước validate nếu viết sai.
    evaluate_on_exit {
      action           = "RETRY"
      on_status_reason = "Host EC2*"
    }

    # Lỗi khởi tạo container (không kéo được secret, không lấy được image).
    # Fargate báo dạng "Task failed to start: ResourceInitializationError: ...".
    evaluate_on_exit {
      action           = "RETRY"
      on_status_reason = "Task failed to start*"
    }

    evaluate_on_exit {
      action    = "EXIT"
      on_reason = "*"
    }
  }

  # ── Giới hạn thời gian ─────────────────────────────
  #
  # Không có timeout thì một tiến trình FFmpeg bị treo (input dị dạng khiến nó
  # chờ mãi thay vì thoát) sẽ giữ container chạy vô hạn và tính tiền Fargate
  # cho tới khi có người tình cờ phát hiện. Hai giờ rộng hơn nhiều lần so với
  # job dài nhất đo được trong chương đánh giá, nên nó chỉ chạm tới các job
  # thực sự đã hỏng.
  timeout {
    attempt_duration_seconds = 7200
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-transcoder-job-def"
  })
}
