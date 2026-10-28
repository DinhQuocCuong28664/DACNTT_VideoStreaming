# Transcode workflow of one environment (docs/ARCHITECTURE.md §4):
#   SQS ingest -> starter -> Step Functions -> probe -> Parallel(analyse | encode or audio+chunks+stitch)
#   -> publish; any failure -> MarkFailed. Container progress events reach status via EventBridge.
# Each function has its own least-privilege role. Lambda code is built by `npm run build` in
# functions/ before plan or apply (dist/<name>/index.mjs).

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  account = data.aws_caller_identity.current.account_id
  region  = data.aws_region.current.name

  # Built from the name, because the starter needs it and the state machine needs the other
  # functions: referencing the resource would make a dependency cycle.
  state_machine_name = "${var.name}-transcode"
  state_machine_arn  = "arn:aws:states:${local.region}:${local.account}:stateMachine:${local.state_machine_name}"

  functions = {
    starter = { memory = 256, timeout = 30, reserved = null }
    probe   = { memory = 1024, timeout = 120, reserved = null }
    status  = { memory = 512, timeout = 30, reserved = var.status_reserved_concurrency }
    stitch  = { memory = 1024, timeout = 300, reserved = null }
  }
}

# ── Secret: MongoDB connection string (value written once, outside Terraform) ──

resource "aws_secretsmanager_secret" "mongodb_uri" {
  name                    = "${var.name}/mongodb-uri"
  description             = "MongoDB Atlas connection string of ${var.name}; the database name comes from DB_NAME"
  recovery_window_in_days = var.secret_recovery_days
}

# ── ffprobe layer for the probe function ───────────────────────────────

data "archive_file" "ffprobe_layer" {
  type             = "zip"
  source_dir       = "${var.functions_dist_dir}/layers/ffprobe"
  output_path      = "${path.module}/.build/ffprobe-layer.zip"
  output_file_mode = "0755"
}

resource "aws_s3_object" "ffprobe_layer" {
  bucket = var.artifacts_bucket
  key    = "layers/${var.name}/ffprobe-${data.archive_file.ffprobe_layer.output_sha256}.zip"
  source = data.archive_file.ffprobe_layer.output_path
}

resource "aws_lambda_layer_version" "ffprobe" {
  layer_name               = "${var.name}-ffprobe"
  description              = "Static ffprobe 8.1.2 at /opt/bin/ffprobe"
  s3_bucket                = var.artifacts_bucket
  s3_key                   = aws_s3_object.ffprobe_layer.key
  source_code_hash         = data.archive_file.ffprobe_layer.output_base64sha256
  compatible_runtimes      = ["nodejs22.x"]
  compatible_architectures = ["x86_64"]
}

# ── Functions ─────────────────────────────────────────────────────────

data "archive_file" "fn" {
  for_each    = local.functions
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

resource "aws_iam_role" "fn" {
  for_each           = local.functions
  name               = "${var.name}-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "fn_logs" {
  for_each   = local.functions
  role       = aws_iam_role.fn[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "fn_xray" {
  for_each   = local.functions
  role       = aws_iam_role.fn[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/AWSXrayWriteOnlyAccess"
}

resource "aws_cloudwatch_log_group" "fn" {
  for_each          = local.functions
  name              = "/aws/lambda/${var.name}-${each.key}"
  retention_in_days = var.log_retention_days
}

locals {
  fn_env = {
    starter = { STATE_MACHINE_ARN = local.state_machine_arn }
    probe   = { WORK_BUCKET = var.bucket_names.work, CHUNK_PARALLEL_SLOTS = tostring(var.chunk_parallel_slots), FFPROBE_PATH = "/opt/bin/ffprobe" }
    status = {
      KEYS_BUCKET        = var.bucket_names.keys
      WORK_BUCKET        = var.bucket_names.work
      EVENT_BUS_NAME     = var.event_bus_name
      ALERT_TOPIC_ARN    = var.alert_topic_arn
      MONGODB_SECRET_ARN = aws_secretsmanager_secret.mongodb_uri.arn
      DB_NAME            = var.db_name
    }
    stitch = {
      WORK_BUCKET      = var.bucket_names.work
      PROCESSED_BUCKET = var.bucket_names.processed
      KEYS_BUCKET      = var.bucket_names.keys
      API_BASE_URL     = var.api_base_url
    }
  }
}

resource "aws_lambda_function" "fn" {
  for_each                       = local.functions
  function_name                  = "${var.name}-${each.key}"
  role                           = aws_iam_role.fn[each.key].arn
  runtime                        = "nodejs22.x"
  architectures                  = ["x86_64"]
  handler                        = "index.handler"
  filename                       = data.archive_file.fn[each.key].output_path
  source_code_hash               = data.archive_file.fn[each.key].output_base64sha256
  memory_size                    = each.value.memory
  timeout                        = each.value.timeout
  reserved_concurrent_executions = each.value.reserved
  layers                         = each.key == "probe" ? [aws_lambda_layer_version.ffprobe.arn] : []

  environment {
    variables = merge({ NODE_OPTIONS = "--enable-source-maps", APP_ENV = var.environment_name }, lookup(local.fn_env, each.key, {}))
  }

  tracing_config {
    mode = "Active"
  }

  depends_on = [aws_cloudwatch_log_group.fn]
}

# ── Function permissions ──────────────────────────────────────────────

data "aws_iam_policy_document" "starter" {
  statement {
    sid       = "ReadUploadMetadata"
    actions   = ["s3:GetObject"]
    resources = ["${var.bucket_arns.raw}/raw/*"]
  }
  statement {
    sid       = "ConsumeIngestQueue"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [var.ingest_queue_arn]
  }
  statement {
    sid       = "StartWorkflow"
    actions   = ["states:StartExecution"]
    resources = [local.state_machine_arn]
  }
}

data "aws_iam_policy_document" "probe" {
  statement {
    sid       = "ReadSource"
    actions   = ["s3:GetObject"]
    resources = ["${var.bucket_arns.raw}/raw/*"]
  }
  statement {
    sid       = "WritePlan"
    actions   = ["s3:PutObject"]
    resources = ["${var.bucket_arns.work}/work/*"]
  }
}

data "aws_iam_policy_document" "status" {
  statement {
    sid       = "ReadDatabaseSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.mongodb_uri.arn]
  }
  statement {
    sid       = "CreateKeys"
    actions   = ["s3:PutObject"]
    resources = ["${var.bucket_arns.keys}/keys/*"]
  }
  statement {
    sid       = "ReadResults"
    actions   = ["s3:GetObject"]
    resources = ["${var.bucket_arns.work}/work/*"]
  }
  statement {
    sid       = "ListWorkForNotFound"
    actions   = ["s3:ListBucket"]
    resources = [var.bucket_arns.work]
  }
  statement {
    sid       = "AnnouncePublished"
    actions   = ["events:PutEvents"]
    resources = [var.event_bus_arn]
  }
  statement {
    sid       = "AlertOperators"
    actions   = ["sns:Publish"]
    resources = [var.alert_topic_arn]
  }
}

data "aws_iam_policy_document" "stitch" {
  statement {
    sid       = "ReadPlanAndChunks"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${var.bucket_arns.work}/work/*"]
  }
  statement {
    sid       = "ListChunks"
    actions   = ["s3:ListBucket"]
    resources = [var.bucket_arns.work]
  }
  statement {
    sid       = "ReadKey"
    actions   = ["s3:GetObject"]
    resources = ["${var.bucket_arns.keys}/keys/*"]
  }
  statement {
    sid       = "WritePlaylists"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${var.bucket_arns.processed}/videos/*"]
  }
}

locals {
  fn_policies = {
    starter = data.aws_iam_policy_document.starter.json
    probe   = data.aws_iam_policy_document.probe.json
    status  = data.aws_iam_policy_document.status.json
    stitch  = data.aws_iam_policy_document.stitch.json
  }
}

resource "aws_iam_role_policy" "fn" {
  for_each = local.functions
  name     = "workflow"
  role     = aws_iam_role.fn[each.key].id
  policy   = local.fn_policies[each.key]
}

# ── Triggers ──────────────────────────────────────────────────────────

resource "aws_lambda_event_source_mapping" "ingest" {
  event_source_arn                   = var.ingest_queue_arn
  function_name                      = aws_lambda_function.fn["starter"].arn
  batch_size                         = 10
  maximum_batching_window_in_seconds = 1
  function_response_types            = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = 5
  }
}

resource "aws_cloudwatch_event_rule" "progress" {
  name           = "${var.name}-transcode-progress"
  description    = "Progress events of transcoder containers"
  event_bus_name = var.event_bus_name
  event_pattern = jsonencode({
    source        = ["zelos.transcoder"]
    "detail-type" = ["TranscodeProgress"]
  })
}

resource "aws_cloudwatch_event_target" "progress" {
  rule           = aws_cloudwatch_event_rule.progress.name
  event_bus_name = var.event_bus_name
  arn            = aws_lambda_function.fn["status"].arn
}

resource "aws_lambda_permission" "progress" {
  statement_id  = "AllowProgressEvents"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.fn["status"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.progress.arn
}

# ── State machine ─────────────────────────────────────────────────────

data "aws_iam_policy_document" "sfn_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account]
    }
  }
}

resource "aws_iam_role" "sfn" {
  name               = "${var.name}-transcode-workflow"
  assume_role_policy = data.aws_iam_policy_document.sfn_assume.json
}

data "aws_iam_policy_document" "sfn" {
  statement {
    sid       = "InvokeSteps"
    actions   = ["lambda:InvokeFunction"]
    resources = [for k in ["probe", "status", "stitch"] : aws_lambda_function.fn[k].arn]
  }
  statement {
    sid       = "RunBatchJobs"
    actions   = ["batch:SubmitJob"]
    resources = concat(values(var.job_queue_arns), [for arn in values(var.job_definition_arns) : arn])
  }
  statement {
    sid       = "TrackBatchJobs"
    actions   = ["batch:DescribeJobs", "batch:TerminateJob"]
    resources = ["*"] # these actions do not support resource-level permissions
  }
  # .sync integrations wait for Batch through a managed EventBridge rule.
  statement {
    sid       = "ManagedSyncRule"
    actions   = ["events:PutTargets", "events:PutRule", "events:DescribeRule"]
    resources = ["arn:aws:events:${local.region}:${local.account}:rule/StepFunctionsGetEventsForBatchJobsRule"]
  }
  statement {
    sid = "TracesAndLogs"
    actions = [
      "xray:PutTraceSegments", "xray:PutTelemetryRecords", "xray:GetSamplingRules", "xray:GetSamplingTargets",
      "logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery", "logs:DeleteLogDelivery",
      "logs:ListLogDeliveries", "logs:PutResourcePolicy", "logs:DescribeResourcePolicies", "logs:DescribeLogGroups",
    ]
    resources = ["*"] # log delivery and X-Ray APIs are not resource-scoped
  }
}

resource "aws_iam_role_policy" "sfn" {
  name   = "workflow"
  role   = aws_iam_role.sfn.id
  policy = data.aws_iam_policy_document.sfn.json
}

resource "aws_cloudwatch_log_group" "sfn" {
  name              = "/aws/vendedlogs/states/${var.name}-transcode"
  retention_in_days = var.log_retention_days
}

locals {
  lambda_retry = [{
    ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException"]
    IntervalSeconds = 2
    MaxAttempts     = 6
    BackoffRate     = 2
    JitterStrategy  = "FULL"
  }]
  batch_retry = [{
    ErrorEquals     = ["Batch.AWSBatchException", "Batch.TooManyRequestsException"]
    IntervalSeconds = 5
    MaxAttempts     = 5
    BackoffRate     = 2
    JitterStrategy  = "FULL"
  }]
  to_failed = [{ ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "MarkFailed" }]

  # Per-job environment: the video, its upload version and its source key.
  job_env = [
    { Name = "VIDEO_ID", "Value.$" = "$.videoId" },
    { Name = "UPLOAD_VERSION", "Value.$" = "States.Format('{}', $.uploadVersion)" },
    { Name = "RAW_KEY", "Value.$" = "$.key" },
  ]

  batch_job = { for role in ["analyse", "encode", "audio", "chunk"] : role => {
    Type     = "Task"
    Resource = "arn:aws:states:::batch:submitJob.sync"
    Parameters = merge({
      "JobName.$"   = "States.Format('${role}-{}-{}', $.videoId, $.uploadVersion)"
      JobQueue      = role == "chunk" ? var.job_queue_arns["bulk"] : var.job_queue_arns["main"]
      JobDefinition = var.job_definition_arns[role]
      ContainerOverrides = merge({ Environment = local.job_env }, role == "encode" ? {
        ResourceRequirements = [
          { Type = "VCPU", "Value.$" = "$.probe.encode.vcpu" },
          { Type = "MEMORY", "Value.$" = "$.probe.encode.memory" },
        ]
      } : {})
      }, role == "chunk" ? {
      ArrayProperties = { "Size.$" = "$.probe.chunkCount" }
    } : {})
    ResultPath = null
    Retry      = local.batch_retry
  } }

  definition = {
    Comment        = "Transcode one upload version (docs/ARCHITECTURE.md §4.2)"
    StartAt        = "MarkProcessing"
    TimeoutSeconds = var.workflow_timeout_seconds
    States = {
      MarkProcessing = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.fn["status"].arn
          Payload = {
            action            = "start"
            "videoId.$"       = "$.videoId"
            "uploadVersion.$" = "$.uploadVersion"
          }
        }
        ResultSelector = { "found.$" = "$.Payload.found" }
        ResultPath     = "$.start"
        Retry          = local.lambda_retry
        Catch          = local.to_failed
        Next           = "StillThere"
      }
      StillThere = {
        Type    = "Choice"
        Choices = [{ Variable = "$.start.found", BooleanEquals = false, Next = "Gone" }]
        Default = "Probe"
      }
      Gone = { Type = "Succeed", Comment = "The video was deleted or replaced before processing" }
      Probe = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.fn["probe"].arn
          "Payload.$"  = "$"
        }
        ResultSelector = {
          "mode.$"       = "$.Payload.mode"
          "chunkCount.$" = "$.Payload.chunkCount"
          "hasAudio.$"   = "$.Payload.hasAudio"
          "encode.$"     = "$.Payload.encode"
        }
        ResultPath = "$.probe"
        Retry      = local.lambda_retry
        Catch      = local.to_failed
        Next       = "Process"
      }
      Process = {
        Type = "Parallel"
        Branches = [
          {
            StartAt = "Analyse"
            States  = { Analyse = merge(local.batch_job["analyse"], { End = true }) }
          },
          {
            StartAt = "Path"
            States = {
              Path = {
                Type    = "Choice"
                Choices = [{ Variable = "$.probe.mode", StringEquals = "chunked", Next = "HasAudio" }]
                Default = "Encode"
              }
              Encode = merge(local.batch_job["encode"], { End = true })
              HasAudio = {
                Type    = "Choice"
                Choices = [{ Variable = "$.probe.hasAudio", BooleanEquals = true, Next = "Audio" }]
                Default = "Chunks"
              }
              Audio  = merge(local.batch_job["audio"], { Next = "Chunks" })
              Chunks = merge(local.batch_job["chunk"], { Next = "Stitch" })
              Stitch = {
                Type     = "Task"
                Resource = "arn:aws:states:::lambda:invoke"
                Parameters = {
                  FunctionName = aws_lambda_function.fn["stitch"].arn
                  Payload = {
                    "videoId.$"       = "$.videoId"
                    "uploadVersion.$" = "$.uploadVersion"
                  }
                }
                ResultPath = null
                Retry      = local.lambda_retry
                End        = true
              }
            }
          },
        ]
        ResultPath = null
        Catch      = local.to_failed
        Next       = "Publish"
      }
      Publish = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.fn["status"].arn
          Payload = {
            action            = "publish"
            "videoId.$"       = "$.videoId"
            "uploadVersion.$" = "$.uploadVersion"
          }
        }
        ResultPath = null
        Retry      = local.lambda_retry
        Catch      = local.to_failed
        Next       = "Done"
      }
      Done = { Type = "Succeed" }
      MarkFailed = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.fn["status"].arn
          Payload = {
            action            = "fail"
            "videoId.$"       = "$.videoId"
            "uploadVersion.$" = "$.uploadVersion"
            "error.$"         = "$.error"
          }
        }
        ResultPath = null
        Retry      = local.lambda_retry
        Next       = "Failed"
      }
      Failed = { Type = "Fail", Error = "TranscodeFailed", Cause = "See the MarkFailed input and the video error field" }
    }
  }
}

resource "aws_sfn_state_machine" "transcode" {
  name       = local.state_machine_name
  role_arn   = aws_iam_role.sfn.arn
  type       = "STANDARD"
  definition = jsonencode(local.definition)

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.sfn.arn}:*"
    include_execution_data = false # keep inputs out of logs
    level                  = "ERROR"
  }

  tracing_configuration {
    enabled = true
  }
}

# ── Alarms ────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "executions_failed" {
  alarm_name          = "${var.name}-transcode-failed"
  alarm_description   = "A transcode workflow execution failed"
  namespace           = "AWS/States"
  metric_name         = "ExecutionsFailed"
  dimensions          = { StateMachineArn = aws_sfn_state_machine.transcode.arn }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alert_topic_arn]
}
