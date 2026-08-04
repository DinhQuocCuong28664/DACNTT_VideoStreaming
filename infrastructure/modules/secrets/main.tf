# ═══════════════════════════════════════════════════
# Module: Secrets Manager — Secure Credentials Storage
# ═══════════════════════════════════════════════════

resource "aws_secretsmanager_secret" "mongodb_uri" {
  name                    = "${var.project_name}/mongodb-uri"
  description             = "MongoDB Atlas connection URI for Transcoder Container"
  recovery_window_in_days = var.recovery_window_in_days

  tags = merge(var.tags, {
    Name = "${var.project_name}-mongodb-uri"
  })
}

resource "aws_secretsmanager_secret_version" "mongodb_uri" {
  secret_id     = aws_secretsmanager_secret.mongodb_uri.id
  secret_string = var.mongodb_uri
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${var.project_name}/jwt-secret"
  description             = "JWT signing secret for Backend API"
  recovery_window_in_days = var.recovery_window_in_days

  tags = merge(var.tags, {
    Name = "${var.project_name}-jwt-secret"
  })
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = var.jwt_secret
}
