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
      MONGODB_URI              = var.mongodb_uri
      JWT_SECRET               = var.jwt_secret
      S3_RAW_BUCKET_NAME       = var.raw_bucket_name
      S3_PROCESSED_BUCKET_NAME = var.processed_bucket_name
      CLOUDFRONT_DOMAIN        = var.cloudfront_domain
      CLOUDFRONT_KEY_PAIR_ID   = var.cloudfront_key_pair_id
      CLOUDFRONT_PRIVATE_KEY   = var.cloudfront_private_key
      CORS_ORIGINS             = var.cors_origins
      FRONTEND_URL             = var.frontend_url
      EMAIL_USER               = var.email_user
      EMAIL_APP_PASSWORD       = var.email_app_password
    }
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-backend-api"
    Role = "Serverless Express API"
  })

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

resource "aws_lambda_permission" "backend_api_invoke_public" {
  statement_id  = "AllowPublicInvokeFunction"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.backend_api.function_name
  principal     = "*"
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
