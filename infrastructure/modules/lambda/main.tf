# ═══════════════════════════════════════════════════
# Module: Lambda — Job Submitter (SQS → AWS Batch)
# ═══════════════════════════════════════════════════

data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/src"
  output_path = "${path.module}/dist/job_submitter.zip"
}

resource "aws_lambda_function" "job_submitter" {
  function_name = "${var.project_name}-job-submitter"
  description   = "SQS → AWS Batch Job Submitter for video transcoding"
  role          = var.lambda_role_arn
  handler       = "index.handler"
  # nodejs22.x — nodejs18.x da het vong doi ho tro va khong con nhan ban va bao
  # mat. Chuong 5 ghi lai viec nang transcoder len Node 24 dung vi ly do nay;
  # ham Lambda nay bi bo sot trong lan ra soat do.
  runtime          = "nodejs22.x"
  timeout          = 30
  memory_size      = 128
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  environment {
    variables = {
      BATCH_JOB_QUEUE      = var.batch_job_queue_name
      BATCH_JOB_DEFINITION = var.batch_job_definition_name
    }
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-job-submitter"
  })
}

# SQS Event Source Mapping → Lambda Trigger
resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn = var.sqs_queue_arn
  function_name    = aws_lambda_function.job_submitter.arn
  batch_size       = 1 # Process 1 video at a time
  enabled          = true
}
