# AWS Batch on Fargate for one environment.
#
# Two compute environments, Fargate Spot first and Fargate On-Demand as overflow, serve two
# queues: "main" (analyse, encode, audio; priority 10) and "bulk" (chunk arrays; priority 1),
# so short videos overtake the chunks of long ones. Both scale to zero when idle.
#
# One image, one job definition per role. Containers read raw sources and keys, write HLS
# output and work files, publish progress events and call Rekognition. They have no database
# credentials (ADR-02).

data "aws_region" "current" {}

# ── Network ───────────────────────────────────────────────────────────

resource "aws_security_group" "tasks" {
  name        = "${var.name}-batch-tasks"
  description = "Transcoding tasks: outbound only"
  vpc_id      = var.vpc_id

  # Tasks reach ECR, CloudWatch Logs, EventBridge and Rekognition over their public HTTPS
  # endpoints. Interface VPC endpoints would remove this rule but cost about 7 USD per month
  # each while idle, which the no-idle-cost rule of the project rejects. No inbound rule exists.
  #trivy:ignore:AWS-0104
  egress {
    description = "HTTPS to AWS APIs, S3 and ECR"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name}-batch-tasks" }
}

# ── Compute environments and queues ───────────────────────────────────

locals {
  compute = {
    spot     = { type = "FARGATE_SPOT", max_vcpus = var.spot_max_vcpus }
    ondemand = { type = "FARGATE", max_vcpus = var.ondemand_max_vcpus }
  }
}

resource "aws_batch_compute_environment" "this" {
  for_each                 = local.compute
  compute_environment_name = "${var.name}-${each.key}"
  type                     = "MANAGED"
  state                    = "ENABLED"

  compute_resources {
    type               = each.value.type
    max_vcpus          = each.value.max_vcpus
    subnets            = var.subnet_ids
    security_group_ids = [aws_security_group.tasks.id]
  }
}

locals {
  queues = {
    main = 10
    bulk = 1
  }
}

resource "aws_batch_job_queue" "this" {
  for_each = local.queues
  name     = "${var.name}-${each.key}"
  state    = "ENABLED"
  priority = each.value

  compute_environment_order {
    order               = 1
    compute_environment = aws_batch_compute_environment.this["spot"].arn
  }

  compute_environment_order {
    order               = 2
    compute_environment = aws_batch_compute_environment.this["ondemand"].arn
  }
}

# ── IAM ───────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name}-batch-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "job" {
  name               = "${var.name}-batch-job"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "job" {
  statement {
    sid       = "ReadSources"
    actions   = ["s3:GetObject"]
    resources = ["${var.bucket_arns.raw}/raw/*"]
  }

  statement {
    sid       = "ReadKeys"
    actions   = ["s3:GetObject"]
    resources = ["${var.bucket_arns.keys}/*"]
  }

  statement {
    sid       = "WriteOutput"
    actions   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
    resources = ["${var.bucket_arns.processed}/videos/*", "${var.bucket_arns.work}/work/*"]
  }

  # ListBucket lets HeadObject answer 404 (not 403) for the abort marker and missing files.
  statement {
    sid       = "ListOwnPrefixes"
    actions   = ["s3:ListBucket"]
    resources = [var.bucket_arns.processed, var.bucket_arns.work]
  }

  statement {
    sid       = "PublishProgress"
    actions   = ["events:PutEvents"]
    resources = [var.event_bus_arn]
  }

  statement {
    sid       = "Moderation"
    actions   = ["rekognition:DetectModerationLabels"]
    resources = ["*"] # the action does not support resource-level permissions
  }
}

resource "aws_iam_role_policy" "job" {
  name   = "transcoder"
  role   = aws_iam_role.job.id
  policy = data.aws_iam_policy_document.job.json
}

# ── Job definitions ───────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "jobs" {
  name              = "/zelos/${var.name}/transcoder"
  retention_in_days = var.log_retention_days
}

locals {
  roles = {
    analyse = { vcpu = "1", memory = "2048", storage = 30, timeout = 4 * 3600 }
    encode  = { vcpu = "2", memory = "4096", storage = 100, timeout = 8 * 3600 }
    audio   = { vcpu = "1", memory = "2048", storage = 50, timeout = 4 * 3600 }
    chunk   = { vcpu = "4", memory = "8192", storage = 30, timeout = 3600 }
  }

  environment = [for k, v in merge(var.environment, {
    APP_ENV          = var.environment_name
    RAW_BUCKET       = var.bucket_names.raw
    PROCESSED_BUCKET = var.bucket_names.processed
    WORK_BUCKET      = var.bucket_names.work
    KEYS_BUCKET      = var.bucket_names.keys
    EVENT_BUS_NAME   = var.event_bus_name
    }) : { name = k, value = tostring(v) }
  ]
}

resource "aws_batch_job_definition" "role" {
  for_each              = local.roles
  name                  = "${var.name}-${each.key}"
  type                  = "container"
  platform_capabilities = ["FARGATE"]
  propagate_tags        = true

  # A Fargate Spot reclaim must not fail the video, so every attempt is retried; the
  # workflow decides what an application error means.
  retry_strategy {
    attempts = 3
  }

  timeout {
    attempt_duration_seconds = each.value.timeout
  }

  container_properties = jsonencode({
    image            = "${var.image_repository_url}:${var.image_tag}"
    command          = ["node", "dist/main.js", each.key]
    jobRoleArn       = aws_iam_role.job.arn
    executionRoleArn = aws_iam_role.execution.arn
    resourceRequirements = [
      { type = "VCPU", value = each.value.vcpu },
      { type = "MEMORY", value = each.value.memory },
    ]
    ephemeralStorage             = { sizeInGiB = each.value.storage }
    networkConfiguration         = { assignPublicIp = "ENABLED" }
    fargatePlatformConfiguration = { platformVersion = "LATEST" }
    runtimePlatform              = { operatingSystemFamily = "LINUX", cpuArchitecture = "X86_64" }
    environment                  = local.environment
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.jobs.name
        "awslogs-region"        = data.aws_region.current.name
        "awslogs-stream-prefix" = each.key
      }
    }
  })
}
