# ═══════════════════════════════════════════════════
# Staging backend API on AWS Lambda, as in production (environments/dev)
# ═══════════════════════════════════════════════════
#
# Staging used to build an EC2 instance on every staging-up.sh and delete it on
# staging-down.sh, so it tested a backend path production no longer runs. It
# now runs the same Lambda module: no instance, no Elastic IP, nothing billed
# while idle, and CD (cd-staging.yml) ships the code with update-function-code.
#
# api-staging.zelostech.site goes through the Cloudflare Worker's staging
# environment (infrastructure/cloudflare-worker, `wrangler deploy --env staging`)
# to this function's URL, which refuses requests without the Worker's
# X-Origin-Verify header (backend/src/middleware/originVerify.js).

module "lambda_backend" {
  source = "../../modules/lambda-backend"

  project_name       = var.project_name
  environment        = var.environment
  lambda_role_arn    = module.iam.lambda_backend_role_arn
  log_retention_days = 7

  # Secrets by ARN, read at start-up (backend/src/config/runtimeSecrets.js).
  # Staging has its own database, JWT key and CloudFront signing key; the Gmail
  # password is production's, read through the shared secret.
  mongodb_uri_secret_arn            = aws_secretsmanager_secret.mongodb_uri.arn
  jwt_secret_arn                    = aws_secretsmanager_secret.jwt_secret.arn
  cloudfront_private_key_secret_arn = aws_secretsmanager_secret.cloudfront_private_key.arn
  email_app_password_secret_arn     = data.aws_secretsmanager_secret.email_app_password.arn
  origin_verify_secret_arn          = aws_secretsmanager_secret.origin_verify.arn

  raw_bucket_name        = module.s3.raw_bucket_name
  processed_bucket_name  = module.s3.processed_bucket_name
  static_bucket_name     = aws_s3_bucket.frontend.bucket
  google_client_id       = var.google_client_id
  cloudfront_domain      = local.cdn_domain
  cloudfront_key_pair_id = module.cloudfront.signing_key_pair_id
  cors_origins           = local.frontend_url
  frontend_url           = local.frontend_url
  email_user             = var.email_user
  tags                   = local.common_tags

  depends_on = [
    aws_secretsmanager_secret_version.mongodb_uri,
    aws_secretsmanager_secret_version.jwt_secret,
    aws_secretsmanager_secret_version.cloudfront_private_key,
  ]
}

# X-Origin-Verify value shared with the staging Worker. Terraform owns the
# secret, not its value: put one in, and into the Worker (wrangler secret put
# ORIGIN_VERIFY_SECRET --env staging), before the function starts, because it
# fails to start on a secret without a value.
resource "aws_secretsmanager_secret" "origin_verify" {
  name                    = "${local.prefix}/origin-verify-secret"
  description             = "X-Origin-Verify value shared by the staging Cloudflare Worker and the staging Lambda backend"
  recovery_window_in_days = 0
  tags                    = local.common_tags
}

# A Worker route needs a proxied DNS record on its host; requests never reach
# this address because the Worker answers them (Cloudflare's "originless"
# record, AAAA 100::).
resource "cloudflare_dns_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = local.api_domain
  type    = "AAAA"
  content = "100::"
  ttl     = 1
  proxied = true
  comment = "Staging API: served by the zelostech-api-gateway-staging Worker (Terraform)"
}
