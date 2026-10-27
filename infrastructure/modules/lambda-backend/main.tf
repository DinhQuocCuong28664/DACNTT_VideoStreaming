# ═══════════════════════════════════════════════════
# Module: Lambda Backend — Serverless Express API
# ═══════════════════════════════════════════════════

# Create placeholder zip if no custom package is provided
data "archive_file" "placeholder_zip" {
  type        = "zip"
  output_path = "${path.module}/dist/placeholder_backend.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'Placeholder' }) });"
    filename = "src/lambda.js"
  }
}

locals {
  effective_zip_path = var.lambda_zip_path != "" ? var.lambda_zip_path : data.archive_file.placeholder_zip.output_path

  # Same sender the EC2 backend used (scripts/ec2-userdata.sh). Empty lets
  # backend/src/services/emailService.js fall back to its default.
  email_from = var.email_user != "" ? "DACNTT Video Platform <${var.email_user}>" : ""
}

resource "aws_cloudwatch_log_group" "backend_api" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-backend-api"
  retention_in_days = var.log_retention_days

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-backend-api-logs"
  })
}

resource "aws_lambda_function" "backend_api" {
  function_name = "${var.project_name}-${var.environment}-backend-api"
  description   = "Serverless Express Backend API (Multi-AZ, 0-cost idle)"
  role          = var.lambda_role_arn
  handler       = "src/lambda.handler"
  runtime       = "nodejs22.x"
  memory_size   = var.lambda_memory_size
  timeout       = var.lambda_timeout

  filename         = local.effective_zip_path
  source_code_hash = fileexists(local.effective_zip_path) ? filebase64sha256(local.effective_zip_path) : data.archive_file.placeholder_zip.output_base64sha256

  environment {
    variables = {
      NODE_ENV                 = var.node_env
      COOKIE_DOMAIN            = var.cookie_domain
      S3_RAW_BUCKET_NAME       = var.raw_bucket_name
      S3_PROCESSED_BUCKET_NAME = var.processed_bucket_name
      S3_STATIC_BUCKET_NAME    = var.static_bucket_name
      GOOGLE_CLIENT_ID         = var.google_client_id
      CLOUDFRONT_DOMAIN        = var.cloudfront_domain
      CLOUDFRONT_KEY_PAIR_ID   = var.cloudfront_key_pair_id
      CORS_ORIGINS             = var.cors_origins
      FRONTEND_URL             = var.frontend_url
      EMAIL_HOST               = var.email_host
      EMAIL_PORT               = var.email_port
      EMAIL_FROM               = local.email_from
      EMAIL_USER               = var.email_user
      # Secrets by reference only (variables.tf). An empty ARN is skipped.
      MONGODB_URI_SECRET_ARN            = var.mongodb_uri_secret_arn
      JWT_SECRET_SECRET_ARN             = var.jwt_secret_arn
      CLOUDFRONT_PRIVATE_KEY_SECRET_ARN = var.cloudfront_private_key_secret_arn
      EMAIL_APP_PASSWORD_SECRET_ARN     = var.email_app_password_secret_arn
      ORIGIN_VERIFY_SECRET_SECRET_ARN   = var.origin_verify_secret_arn
      MAX_VIDEO_SIZE_GB                 = tostring(var.max_video_size_gb)
    }
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-backend-api"
    Role = "Serverless Express API"
  })

  # Terraform creates the function; .github/workflows/cd-deploy.yml owns its
  # code. Without this, an apply uploads whatever zip sits in dist/ on the
  # machine running Terraform and silently rolls production back to it.
  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.backend_api]
}

# Public HTTPS Endpoint with built-in CORS for Web Clients & Cloudflare Proxy
resource "aws_lambda_function_url" "backend_api" {
  function_name      = aws_lambda_function.backend_api.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = true
    allow_origins     = split(",", var.cors_origins)
    allow_methods     = ["*"]
    allow_headers     = ["*"]
    expose_headers    = ["*"]
    max_age           = 86400
  }
}

resource "aws_lambda_permission" "backend_api_url_public" {
  statement_id           = "FunctionURLAllowPublicAccess"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.backend_api.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

# Function URLs created since October 2025 also need lambda:InvokeFunction.
# Granted to "*" without a condition it lets any AWS account call the Invoke
# API directly with a hand-made event, bypassing Cloudflare and spoofing the
# source IP the rate limiters key on. The lambda:InvokedViaFunctionUrl
# condition limits it to requests that arrive through the function URL
# (https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html).
#
# aws_lambda_permission only gained `invoked_via_function_url` in provider
# 6.28.0 and this stack pins ~> 5.0, so the statement is added with the AWS
# CLI. After moving to provider >= 6.28, replace this with an
# aws_lambda_permission that sets invoked_via_function_url = true.
data "aws_region" "current" {}

resource "terraform_data" "backend_api_invoke_via_url" {
  triggers_replace = [aws_lambda_function.backend_api.arn]

  input = {
    function_name = aws_lambda_function.backend_api.function_name
    region        = data.aws_region.current.name
    statement_id  = "FunctionURLInvokeAllowPublicAccess"
  }

  # `interpreter` runs aws directly, without cmd or sh, so the "*" principal
  # reaches the CLI as is: cmd /C passed it on with its quotes, and sh would
  # expand an unquoted * to file names. local-exec appends `command` as the
  # last argument.
  provisioner "local-exec" {
    interpreter = [
      "aws", "lambda", "add-permission",
      "--region", self.input.region,
      "--function-name", self.input.function_name,
      "--statement-id", self.input.statement_id,
      "--action", "lambda:InvokeFunction",
      "--principal", "*",
      "--invoked-via-function-url",
      "--output", "text",
      "--query",
    ]
    command     = "Statement"
    environment = { AWS_PAGER = "" }
  }

  # A missing statement (never added, or removed by hand) must not block the
  # replace or destroy of this resource.
  provisioner "local-exec" {
    when = destroy
    interpreter = [
      "aws", "lambda", "remove-permission",
      "--region", self.input.region,
      "--function-name", self.input.function_name,
      "--statement-id",
    ]
    command     = self.input.statement_id
    environment = { AWS_PAGER = "" }
    on_failure  = continue
  }
}

# ── Scheduled Video Reconciler (EventBridge) ──────────────────
# Periodic execution of reconcilerHandler (dọn video kẹt ở PROCESSING/UPLOADING)
resource "aws_cloudwatch_event_rule" "reconciler_schedule" {
  name                = "${var.project_name}-${var.environment}-reconciler-schedule"
  description         = "Periodic trigger for video reconciler (runs every hour)"
  schedule_expression = "rate(1 hour)"

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-reconciler-schedule"
  })
}

resource "aws_cloudwatch_event_target" "reconciler_target" {
  rule      = aws_cloudwatch_event_rule.reconciler_schedule.name
  target_id = "VideoReconcilerLambda"
  arn       = aws_lambda_function.backend_api.arn

  # The function's handler (src/lambda.handler) recognises the scheduled event
  # and runs the reconciler instead of passing it to Express.
}

resource "aws_lambda_permission" "allow_eventbridge_reconciler" {
  statement_id  = "AllowExecutionFromEventBridgeReconciler"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.backend_api.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.reconciler_schedule.arn
}
