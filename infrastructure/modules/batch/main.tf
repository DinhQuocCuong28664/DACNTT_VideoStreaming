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

  tags = merge(var.tags, {
    Name = "${var.project_name}-transcoder-job-def"
  })
}
