# ═══════════════════════════════════════════════════
# GitHub Actions → AWS cho staging (OIDC)
#
# OIDC provider là tài nguyên một-mỗi-account, do environments/dev/github-oidc.tf
# tạo; ở đây chỉ đọc lại. Vì vậy dev phải apply trước. Chưa apply dev mà cần
# plan staging thì đặt -var github_oidc_enabled=false.
#
# Hai role, chỉ tin job gắn `environment: staging` (claim dạng immutable
# subject của repo — xem giải thích ở dev/github-oidc.tf):
# - deploy (account chính): đẩy image thử lên repo ECR dùng chung, đăng ký job
#   definition của staging, chạy lệnh deploy trên máy staging qua SSM, đồng bộ
#   bucket frontend staging;
# - cloudfront (account A): invalidate đúng distribution frontend staging.
# ═══════════════════════════════════════════════════

variable "github_oidc_enabled" {
  type    = bool
  default = true
}

locals {
  github_staging_subject = "repo:DinhQuocCuong28664@205408576/DACNTT_VideoStreaming@1307254369:environment:staging"
  github_oidc_url        = "https://token.actions.githubusercontent.com"
  oidc_count             = var.github_oidc_enabled ? 1 : 0
}

data "aws_iam_openid_connect_provider" "github" {
  count = local.oidc_count
  url   = local.github_oidc_url
}

data "aws_iam_openid_connect_provider" "github_account_a" {
  count    = local.oidc_count
  provider = aws.account_a
  url      = local.github_oidc_url
}

data "aws_iam_policy_document" "github_trust_staging" {
  count = local.oidc_count
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github[0].arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.github_staging_subject]
    }
  }
}

resource "aws_iam_role" "github_staging_deploy" {
  count              = local.oidc_count
  name               = "${local.prefix}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_trust_staging[0].json
  tags               = local.common_tags
}

data "aws_iam_policy_document" "github_staging_deploy" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"] # không hỗ trợ giới hạn theo tài nguyên
  }

  statement {
    sid = "PushImageUnderTest"
    actions = [
      "ecr:DescribeRepositories",
      "ecr:BatchCheckLayerAvailability",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [data.aws_ecr_repository.transcoder.arn]
  }

  statement {
    sid       = "ReadJobDefinitions"
    actions   = ["batch:DescribeJobDefinitions"]
    resources = ["*"]
  }

  statement {
    sid     = "RegisterStagingJobDefinition"
    actions = ["batch:RegisterJobDefinition"]
    resources = [
      "arn:aws:batch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:job-definition/${module.batch.job_definition_name}",
      "arn:aws:batch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:job-definition/${module.batch.job_definition_name}:*",
    ]
  }

  statement {
    sid       = "PassStagingTranscoderRoles"
    actions   = ["iam:PassRole"]
    resources = [module.iam.transcoder_task_role_arn, module.iam.ecs_task_execution_role_arn]
  }

  statement {
    sid       = "FindStagingInstance"
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
  }

  # Máy staging bị xoá và dựng lại mỗi lần bật nên không có ARN cố định: giới
  # hạn theo tag Name thay vì theo instance ID.
  statement {
    sid       = "RunDeployOnStagingInstanceOnly"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*"]
    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Name"
      values   = ["${local.prefix}-backend-api"]
    }
  }

  statement {
    sid       = "UseRunShellScriptDocument"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript"]
  }

  statement {
    sid       = "ReadDeployResult"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
    resources = ["*"]
  }

  statement {
    sid       = "ListStagingFrontendBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.frontend.arn]
  }

  statement {
    sid       = "WriteStagingFrontendFiles"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]
  }

  statement {
    sid       = "NeverTouchUserAvatars"
    effect    = "Deny"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/avatars/*"]
  }
}

resource "aws_iam_role_policy" "github_staging_deploy" {
  count  = local.oidc_count
  name   = "deploy-staging"
  role   = aws_iam_role.github_staging_deploy[0].id
  policy = data.aws_iam_policy_document.github_staging_deploy.json
}

# ── Account A: CloudFront của frontend staging ──
data "aws_iam_policy_document" "github_trust_staging_account_a" {
  count = local.oidc_count
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github_account_a[0].arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.github_staging_subject]
    }
  }
}

resource "aws_iam_role" "github_staging_cloudfront" {
  count              = local.oidc_count
  provider           = aws.account_a
  name               = "${local.prefix}-github-cloudfront"
  assume_role_policy = data.aws_iam_policy_document.github_trust_staging_account_a[0].json
  tags               = local.common_tags
}

data "aws_iam_policy_document" "github_staging_cloudfront" {
  statement {
    sid       = "FindDistribution"
    actions   = ["cloudfront:ListDistributions"]
    resources = ["*"]
  }

  statement {
    sid       = "InvalidateStagingFrontendOnly"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.frontend.arn]
  }
}

resource "aws_iam_role_policy" "github_staging_cloudfront" {
  count    = local.oidc_count
  provider = aws.account_a
  name     = "invalidate-staging-frontend"
  role     = aws_iam_role.github_staging_cloudfront[0].id
  policy   = data.aws_iam_policy_document.github_staging_cloudfront.json
}
