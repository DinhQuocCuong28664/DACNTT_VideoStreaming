# The API Lambda (Express behind a Function URL, fronted by the Cloudflare Worker) and the
# background functions that serve it: notifier (VideoPublished), hourly analytics roll-up,
# daily draft reconciler, plus the EventBridge Scheduler group for scheduled publishing.
# Code is built before plan or apply: `npm run build` in api/ and functions/.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  account = data.aws_caller_identity.current.account_id
  region  = data.aws_region.current.name

  background = {
    notifier   = { memory = 512, timeout = 300, reserved = 2 }
    rollup     = { memory = 256, timeout = 300, reserved = 1 }
    reconciler = { memory = 256, timeout = 300, reserved = 1 }
  }

  schedule_group = "${var.name}-publish"

  api_env = {
    NODE_OPTIONS         = "--enable-source-maps"
    APP_ENV              = var.environment_name
    API_SECRET_ARN       = aws_secretsmanager_secret.api.arn
    DB_NAME              = var.db_name
    WEB_ORIGINS          = join(",", var.web_origins)
    WEB_BASE_URL         = var.web_base_url
    API_BASE_URL         = var.api_base_url
    CDN_BASE_URL         = var.cdn_base_url
    RAW_BUCKET           = var.bucket_names.raw
    PROCESSED_BUCKET     = var.bucket_names.processed
    KEYS_BUCKET          = var.bucket_names.keys
    TABLE_RATE_LIMITS    = var.table_names.rate_limits
    TABLE_VIEW_MARKS     = var.table_names.view_marks
    TABLE_WATCH_PROGRESS = var.table_names.watch_progress
    TABLE_HEARTBEATS     = var.table_names.heartbeats
    TABLE_NOTIFICATIONS  = var.table_names.notifications
    MONGO_POOL_SIZE      = "3"
    SCHEDULE_GROUP       = local.schedule_group
    SCHEDULE_TARGET_ARN  = var.status_function_arn
    SCHEDULE_ROLE_ARN    = aws_iam_role.scheduler.arn
  }

  background_env = {
    notifier = {
      API_SECRET_ARN      = aws_secretsmanager_secret.api.arn
      DB_NAME             = var.db_name
      TABLE_NOTIFICATIONS = var.table_names.notifications
      TABLE_RATE_LIMITS   = var.table_names.rate_limits
      WEB_BASE_URL        = var.web_base_url
    }
    rollup = {
      API_SECRET_ARN   = aws_secretsmanager_secret.api.arn
      DB_NAME          = var.db_name
      TABLE_HEARTBEATS = var.table_names.heartbeats
    }
    reconciler = {
      API_SECRET_ARN = aws_secretsmanager_secret.api.arn
      DB_NAME        = var.db_name
      RAW_BUCKET     = var.bucket_names.raw
    }
  }
}

# ── Secret: JSON with mongodbUri, jwtSecret, originSecret, Google, CloudFront key, SMTP ──
# The value is written once outside Terraform, so it never lands in state.

resource "aws_secretsmanager_secret" "api" {
  #trivy:ignore:AVD-AWS-0098 -- the default AWS-managed key is enough for this project; no cross-account use
  name                    = "${var.name}/api"
  recovery_window_in_days = var.secret_recovery_days
}

# ── Packages ──────────────────────────────────────────────────────────

data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${var.api_dist_dir}/api"
  output_path = "${path.module}/.build/api.zip"
}

data "archive_file" "background" {
  for_each    = local.background
  type        = "zip"
  source_dir  = "${var.functions_dist_dir}/${each.key}"
  output_path = "${path.module}/.build/${each.key}.zip"
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ── API function ──────────────────────────────────────────────────────

resource "aws_iam_role" "api" {
  name               = "${var.name}-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "api_xray" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXrayWriteOnlyAccess"
}

data "aws_iam_policy_document" "api" {
  statement {
    sid       = "ReadSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.api.arn]
  }
  # Presigned POST and multipart grants are signed with this role, so it needs the upload
  # actions themselves; the policy of each grant pins key, size and type.
  statement {
    sid = "RawUploads"
    actions = [
      "s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts",
    ]
    resources = ["${var.bucket_arns.raw}/raw/*", "${var.bucket_arns.raw}/images/*"]
  }
  statement {
    sid       = "ListRaw"
    actions   = ["s3:ListBucket"]
    resources = [var.bucket_arns.raw]
  }
  statement {
    sid       = "ProcessedFiles"
    actions   = ["s3:PutObject", "s3:DeleteObject", "s3:GetObject"]
    resources = ["${var.bucket_arns.processed}/videos/*", "${var.bucket_arns.processed}/images/*"]
  }
  statement {
    sid       = "ListProcessedAndKeys"
    actions   = ["s3:ListBucket"]
    resources = [var.bucket_arns.processed, var.bucket_arns.keys]
  }
  statement {
    sid       = "Keys"
    actions   = ["s3:GetObject", "s3:DeleteObject"]
    resources = ["${var.bucket_arns.keys}/keys/*"]
  }
  statement {
    sid = "Tables"
    actions = [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem",
      "dynamodb:Query", "dynamodb:BatchWriteItem",
    ]
    resources = var.table_arns
  }
  statement {
    sid       = "ScreenImages"
    actions   = ["rekognition:DetectModerationLabels"]
    resources = ["*"] # the action does not support resource-level permissions
  }
  statement {
    sid       = "PublishSchedules"
    actions   = ["scheduler:CreateSchedule", "scheduler:UpdateSchedule", "scheduler:DeleteSchedule"]
    resources = ["arn:aws:scheduler:${local.region}:${local.account}:schedule/${local.schedule_group}/*"]
  }
  statement {
    sid       = "PassSchedulerRole"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.scheduler.arn]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "api"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.name}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name                  = "${var.name}-api"
  role                           = aws_iam_role.api.arn
  runtime                        = "nodejs22.x"
  architectures                  = ["x86_64"]
  handler                        = "index.handler"
  filename                       = data.archive_file.api.output_path
  source_code_hash               = data.archive_file.api.output_base64sha256
  memory_size                    = 512
  timeout                        = 30
  reserved_concurrent_executions = var.api_reserved_concurrency

  environment {
    variables = local.api_env
  }

  tracing_config {
    mode = "Active"
  }

  depends_on = [aws_cloudwatch_log_group.api]
}

# Public on purpose: the app refuses every request without the Worker's origin secret
# (constant-time check), so a direct call to this URL gets 403.
resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"
}

# ── Scheduled publishing ──────────────────────────────────────────────

resource "aws_scheduler_schedule_group" "publish" {
  name = local.schedule_group
}

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.name}-publish-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    sid       = "InvokeStatus"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.status_function_arn]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "invoke-status"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}

# ── Background functions ──────────────────────────────────────────────

resource "aws_iam_role" "background" {
  for_each           = local.background
  name               = "${var.name}-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "background_logs" {
  for_each   = local.background
  role       = aws_iam_role.background[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "notifier" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.api.arn]
  }
  statement {
    sid       = "WriteNotificationsAndMailCap"
    actions   = ["dynamodb:PutItem", "dynamodb:UpdateItem"]
    resources = var.table_arns
  }
}

data "aws_iam_policy_document" "rollup" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.api.arn]
  }
  statement {
    sid       = "ReadHeartbeats"
    actions   = ["dynamodb:Query"]
    resources = var.table_arns
  }
}

data "aws_iam_policy_document" "reconciler" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.api.arn]
  }
  statement {
    sid       = "RemoveAbandonedUploads"
    actions   = ["s3:DeleteObject", "s3:AbortMultipartUpload"]
    resources = ["${var.bucket_arns.raw}/raw/*"]
  }
  statement {
    sid       = "ListRaw"
    actions   = ["s3:ListBucket"]
    resources = [var.bucket_arns.raw]
  }
}

locals {
  background_policies = {
    notifier   = data.aws_iam_policy_document.notifier.json
    rollup     = data.aws_iam_policy_document.rollup.json
    reconciler = data.aws_iam_policy_document.reconciler.json
  }
}

resource "aws_iam_role_policy" "background" {
  for_each = local.background
  name     = each.key
  role     = aws_iam_role.background[each.key].id
  policy   = local.background_policies[each.key]
}

resource "aws_cloudwatch_log_group" "background" {
  for_each          = local.background
  name              = "/aws/lambda/${var.name}-${each.key}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "background" {
  for_each                       = local.background
  function_name                  = "${var.name}-${each.key}"
  role                           = aws_iam_role.background[each.key].arn
  runtime                        = "nodejs22.x"
  architectures                  = ["x86_64"]
  handler                        = "index.handler"
  filename                       = data.archive_file.background[each.key].output_path
  source_code_hash               = data.archive_file.background[each.key].output_base64sha256
  memory_size                    = each.value.memory
  timeout                        = each.value.timeout
  reserved_concurrent_executions = each.value.reserved

  environment {
    variables = merge({ NODE_OPTIONS = "--enable-source-maps", APP_ENV = var.environment_name }, local.background_env[each.key])
  }

  depends_on = [aws_cloudwatch_log_group.background]
}

# Notifier: one invocation per published video.
resource "aws_cloudwatch_event_rule" "published" {
  name           = "${var.name}-video-published"
  description    = "Videos that became public"
  event_bus_name = var.event_bus_name
  event_pattern = jsonencode({
    source        = ["zelos.transcoder"]
    "detail-type" = ["VideoPublished"]
  })
}

resource "aws_cloudwatch_event_target" "published" {
  rule           = aws_cloudwatch_event_rule.published.name
  event_bus_name = var.event_bus_name
  arn            = aws_lambda_function.background["notifier"].arn
  retry_policy {
    maximum_retry_attempts       = 10
    maximum_event_age_in_seconds = 3600
  }
}

resource "aws_lambda_permission" "published" {
  statement_id  = "AllowVideoPublished"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.background["notifier"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.published.arn
}

# Roll-up at five past every hour; reconciler once a day at 03:30 UTC.
locals {
  crons = {
    rollup     = "cron(5 * * * ? *)"
    reconciler = "cron(30 3 * * ? *)"
  }
}

resource "aws_cloudwatch_event_rule" "cron" {
  for_each            = local.crons
  name                = "${var.name}-${each.key}"
  schedule_expression = each.value
}

resource "aws_cloudwatch_event_target" "cron" {
  for_each = local.crons
  rule     = aws_cloudwatch_event_rule.cron[each.key].name
  arn      = aws_lambda_function.background[each.key].arn
}

resource "aws_lambda_permission" "cron" {
  for_each      = local.crons
  statement_id  = "AllowSchedule"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.background[each.key].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.cron[each.key].arn
}

# ── Alarms ────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "${var.name}-api-errors"
  alarm_description   = "The API function failed (unhandled errors or timeouts)"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alert_topic_arn]
}
