output "mongodb_uri_secret_arn" {
  value = aws_secretsmanager_secret.mongodb_uri.arn
}

output "jwt_secret_arn" {
  value = aws_secretsmanager_secret.jwt_secret.arn
}

output "email_app_password_secret_arn" {
  value = aws_secretsmanager_secret.email_app_password.arn
}
