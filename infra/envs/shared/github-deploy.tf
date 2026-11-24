# Continuous deployment from GitHub Actions without stored AWS keys. The deploy workflow
# (.github/workflows/deploy.yml) exchanges its OIDC token for one of the roles below. Each role
# trusts only this repository running in the matching GitHub environment, and the prod
# environment requires an approval before a job can even request the token.

locals {
  # The repository uses GitHub's immutable OIDC subject: owner and repository carry their
  # numeric IDs (owner@id/repo@id), so a renamed or re-created repository with the same name
  # cannot match. Check with: gh api repos/<owner>/<repo>/actions/oidc/customization/sub
  github_subject_prefix = "repo:DinhQuocCuong28664@205408576/DACNTT_VideoStreaming@1307254369"
  deploy_envs           = toset(["staging", "prod"])
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # AWS validates GitHub's certificate against its own trust store; the thumbprint is only
  # kept because the API still requires one.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "github_deploy_trust" {
  for_each = local.deploy_envs

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
      values   = ["${local.github_subject_prefix}:environment:${each.key}"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  for_each             = local.deploy_envs
  name                 = "zelos-${each.key}-github-deploy"
  description          = "Assumed by the GitHub Actions deploy workflow for the ${each.key} environment"
  assume_role_policy   = data.aws_iam_policy_document.github_deploy_trust[each.key].json
  max_session_duration = 3600
}

# Terraform manages Batch, Lambda, Step Functions, CloudFront, S3, DynamoDB, ECR and more, so the
# role needs broad service access. PowerUserAccess grants it without IAM.
resource "aws_iam_role_policy_attachment" "github_deploy_power_user" {
  for_each   = local.deploy_envs
  role       = aws_iam_role.github_deploy[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

# IAM is limited to the environment's own roles (zelos-<env>-*), the AWS managed policies those
# roles attach, and PassRole for the same roles. The deploy roles and the OIDC provider are
# denied explicitly so a workflow cannot widen its own access.
data "aws_iam_policy_document" "github_deploy_iam" {
  for_each = local.deploy_envs

  statement {
    sid = "ReadIam"
    actions = [
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:ListRoleTags",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:ListPolicyVersions",
    ]
    resources = ["*"]
  }

  statement {
    sid = "ManageEnvironmentRoles"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:UpdateRole",
      "iam:UpdateRoleDescription",
      "iam:UpdateAssumeRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:PassRole",
    ]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/zelos-${each.key}-*"]
  }

  statement {
    sid       = "AttachAwsManagedPolicies"
    actions   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/zelos-${each.key}-*"]
    condition {
      test     = "ArnLike"
      variable = "iam:PolicyARN"
      values = [
        "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
        "arn:aws:iam::aws:policy/AWSXrayWriteOnlyAccess",
      ]
    }
  }

  statement {
    sid     = "ProtectDeployAccess"
    effect  = "Deny"
    actions = ["iam:*"]
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/zelos-*-github-deploy",
      aws_iam_openid_connect_provider.github.arn,
    ]
  }
}

resource "aws_iam_role_policy" "github_deploy_iam" {
  for_each = local.deploy_envs
  name     = "zelos-${each.key}-github-deploy-iam"
  role     = aws_iam_role.github_deploy[each.key].id
  policy   = data.aws_iam_policy_document.github_deploy_iam[each.key].json
}

output "github_deploy_role_arns" {
  description = "Role ARNs for the repository variables AWS_DEPLOY_ROLE_STAGING and AWS_DEPLOY_ROLE_PROD"
  value       = { for env, role in aws_iam_role.github_deploy : env => role.arn }
}
