output "mongodb_uri_secret_arn" {
  value = aws_secretsmanager_secret.mongodb_uri.arn
}

output "jwt_secret_arn" {
  value = aws_secretsmanager_secret.jwt_secret.arn
}

# Trả về chuỗi rỗng khi chưa cấu hình email. Module batch dựa đúng vào điều
# kiện "ARN khác rỗng" để quyết định có gắn EMAIL_APP_PASSWORD vào Job
# Definition hay không, nên ARN rỗng ở đây là tín hiệu bắt buộc phải đúng.
output "email_app_password_secret_arn" {
  value = length(aws_secretsmanager_secret.email_app_password) > 0 ? aws_secretsmanager_secret.email_app_password[0].arn : ""
}
