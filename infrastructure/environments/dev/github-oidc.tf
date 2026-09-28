# ═══════════════════════════════════════════════════
# GitHub Actions → AWS bằng OIDC, thay cho access key tĩnh
#
# Trước đây mọi workflow đọc AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY (và cặp
# _ACCOUNT_A) từ GitHub Secrets: khoá sống vô thời hạn, quyền của IAM user đứng
# sau không nằm trong Terraform, và job nào có secrets là có toàn bộ quyền đó.
# Với OIDC, mỗi job xin một token ngắn hạn do GitHub ký và AWS chỉ đổi nó lấy
# credential tạm của role tương ứng khi claim `sub` khớp trust policy.
#
# Ba role, mỗi role đúng quyền một nhóm job cần:
# - ecr_push:   ci-transcoder/build-scan — đẩy image, chạy trên nhánh.
# - deploy:     các job `environment: production` (cd-deploy, deploy của
#               ci-transcoder và ci-frontend) — Batch, SSM, S3 frontend.
# - cloudfront: ci-frontend/deploy, ở account A — invalidate CDN frontend.
#
# Sau `terraform apply`: đặt các biến repository AWS_ECR_PUSH_ROLE_ARN,
# AWS_DEPLOY_ROLE_ARN, AWS_CLOUDFRONT_ROLE_ARN (xem output bên dưới). Workflow
# tự chuyển sang OIDC khi biến có giá trị; sau đó xoá bốn secret khoá tĩnh và
# vô hiệu hoá access key của IAM user cũ.
# ═══════════════════════════════════════════════════

locals {
  # Repository này dùng "immutable subject" của GitHub (repo tạo sau
  # 15/07/2026): claim `sub` mang cả ID bất biến của owner và repo, dạng
  # repo:OWNER@OWNER_ID/REPO@REPO_ID:... — KHÔNG phải repo:OWNER/REPO:... như
  # đa số hướng dẫn. Trust policy viết theo dạng cũ sẽ không bao giờ khớp.
  # Giá trị đọc từ GET /repos/{owner}/{repo}/actions/oidc/customization/sub.
  # Đổi tên repo không làm hỏng nó (ID không đổi), đó cũng là mục đích của dạng này.
  github_oidc_subject = "repo:DinhQuocCuong28664@205408576/DACNTT_VideoStreaming@1307254369"

  github_oidc_url = "https://token.actions.githubusercontent.com"

  # Chỉ các job gắn environment `production` mới nhận được claim này.
  github_production_subjects = ["${local.github_oidc_subject}:environment:production"]

  # build-scan chạy trên push vào các nhánh này (ci-transcoder.yml).
  github_branch_subjects = [
    for branch in ["main", "master", "develop"] : "${local.github_oidc_subject}:ref:refs/heads/${branch}"
  ]
}

data "aws_caller_identity" "current" {}

# ── Account chính: ECR, Batch, EC2/SSM, S3 frontend ──────────────
resource "aws_iam_openid_connect_provider" "github" {
  url            = local.github_oidc_url
  client_id_list = ["sts.amazonaws.com"]
  # thumbprint_list bỏ trống: AWS tự xác thực chứng chỉ của GitHub bằng kho CA
  # tin cậy của nó cho nhà cung cấp OIDC này.

  tags = merge(local.common_tags, { Name = "${var.project_name}-github-oidc" })
}

data "aws_iam_policy_document" "github_trust_branches" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.github_branch_subjects
    }
  }
}

data "aws_iam_policy_document" "github_trust_production" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.github_production_subjects
    }
  }
}

# ── Role 1: đẩy image transcoder lên ECR ──────────────────────────
resource "aws_iam_role" "github_ecr_push" {
  name               = "${var.project_name}-${var.environment}-github-ecr-push"
  assume_role_policy = data.aws_iam_policy_document.github_trust_branches.json
  tags               = local.common_tags
}

data "aws_iam_policy_document" "github_ecr_push" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"] # không hỗ trợ giới hạn theo tài nguyên
  }

  statement {
    sid = "PushTranscoderImage"
    actions = [
      "ecr:DescribeRepositories",
      "ecr:CreateRepository", # workflow tự tạo repo nếu chưa có
      "ecr:BatchCheckLayerAvailability",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [module.ecr.repository_arn]
  }
}

resource "aws_iam_role_policy" "github_ecr_push" {
  name   = "ecr-push-transcoder"
  role   = aws_iam_role.github_ecr_push.id
  policy = data.aws_iam_policy_document.github_ecr_push.json
}

# ── Role 2: triển khai production ─────────────────────────────────
resource "aws_iam_role" "github_deploy" {
  name               = "${var.project_name}-${var.environment}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_trust_production.json
  tags               = local.common_tags
}

data "aws_iam_policy_document" "github_deploy" {
  # ci-transcoder/deploy: đăng nhập ECR chỉ để lấy địa chỉ registry, rồi đăng
  # ký revision mới của job definition trỏ tới image vừa đẩy.
  statement {
    sid       = "EcrRegistryAddress"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid       = "ReadJobDefinitions"
    actions   = ["batch:DescribeJobDefinitions"]
    resources = ["*"] # không hỗ trợ giới hạn theo tài nguyên
  }

  statement {
    sid     = "RegisterTranscoderJobDefinition"
    actions = ["batch:RegisterJobDefinition"]
    resources = [
      "arn:aws:batch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:job-definition/${module.batch.job_definition_name}",
      "arn:aws:batch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:job-definition/${module.batch.job_definition_name}:*",
    ]
  }

  # Job definition mang jobRoleArn và executionRoleArn, nên đăng ký nó cần
  # quyền "trao" đúng hai role đó — không role nào khác.
  statement {
    sid       = "PassTranscoderRoles"
    actions   = ["iam:PassRole"]
    resources = [module.iam.transcoder_task_role_arn, module.iam.ecs_task_execution_role_arn]
  }

  # cd-deploy: tìm máy theo tag rồi chạy lệnh deploy qua SSM.
  statement {
    sid       = "FindBackendInstance"
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"] # không hỗ trợ giới hạn theo tài nguyên
  }

  statement {
    sid     = "RunDeployOnBackendOnly"
    actions = ["ssm:SendCommand"]
    resources = [
      aws_instance.backend_api.arn,
      "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript",
    ]
  }

  statement {
    sid       = "ReadDeployResult"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
    resources = ["*"] # không hỗ trợ giới hạn theo tài nguyên
  }

  # ci-frontend/deploy: đồng bộ dist/ lên bucket host frontend.
  statement {
    sid       = "ListFrontendBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.frontend.arn]
  }

  statement {
    sid       = "WriteFrontendFiles"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]
  }

  # Chặn cứng ở tầng IAM, không chỉ dựa vào --exclude trong workflow: ảnh đại
  # diện người dùng nằm chung bucket, và một lần `s3 sync --delete` thiếu
  # filter từng xoá sạch chúng ở mỗi lần deploy.
  statement {
    sid       = "NeverTouchUserAvatars"
    effect    = "Deny"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/avatars/*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "deploy-production"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}

# ── Account A: CloudFront của frontend ───────────────────────────
resource "aws_iam_openid_connect_provider" "github_account_a" {
  provider       = aws.account_a
  url            = local.github_oidc_url
  client_id_list = ["sts.amazonaws.com"]

  tags = merge(local.common_tags, { Name = "${var.project_name}-github-oidc" })
}

data "aws_iam_policy_document" "github_trust_production_account_a" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_account_a.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.github_production_subjects
    }
  }
}

resource "aws_iam_role" "github_cloudfront" {
  provider           = aws.account_a
  name               = "${var.project_name}-${var.environment}-github-cloudfront"
  assume_role_policy = data.aws_iam_policy_document.github_trust_production_account_a.json
  tags               = local.common_tags
}

data "aws_iam_policy_document" "github_cloudfront" {
  statement {
    sid       = "FindFrontendDistribution"
    actions   = ["cloudfront:ListDistributions"]
    resources = ["*"] # không hỗ trợ giới hạn theo tài nguyên
  }

  statement {
    sid       = "InvalidateFrontendOnly"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.frontend.arn]
  }
}

resource "aws_iam_role_policy" "github_cloudfront" {
  provider = aws.account_a
  name     = "invalidate-frontend"
  role     = aws_iam_role.github_cloudfront.id
  policy   = data.aws_iam_policy_document.github_cloudfront.json
}

output "github_ecr_push_role_arn" {
  description = "Dat vao bien repository AWS_ECR_PUSH_ROLE_ARN"
  value       = aws_iam_role.github_ecr_push.arn
}

output "github_deploy_role_arn" {
  description = "Dat vao bien repository AWS_DEPLOY_ROLE_ARN"
  value       = aws_iam_role.github_deploy.arn
}

output "github_cloudfront_role_arn" {
  description = "Dat vao bien repository AWS_CLOUDFRONT_ROLE_ARN (account A)"
  value       = aws_iam_role.github_cloudfront.arn
}
