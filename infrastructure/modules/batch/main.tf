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

    environment = [
      { name = "AWS_REGION", value = var.region },
      { name = "S3_RAW_BUCKET_NAME", value = var.raw_bucket_name },
      { name = "S3_PROCESSED_BUCKET_NAME", value = var.processed_bucket_name },
      { name = "SQS_QUEUE_URL", value = var.sqs_queue_url },
      { name = "CLOUDFRONT_DOMAIN", value = var.cloudfront_domain }
    ]

    secrets = [
      {
        name      = "MONGODB_URI"
        valueFrom = var.mongodb_uri_secret_arn
      }
    ]

    command = ["node", "src/index.js", "batch"]
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-transcoder-job-def"
  })
}
