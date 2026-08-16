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

# Gmail App Password dùng để Transcoder gửi email thông báo video sẵn
# sàng/thất bại. Tách khỏi các biến môi trường thường (không nhạy cảm) của
# Batch Job Definition, theo đúng mẫu đã áp dụng cho mongodb_uri.
#
# Cả vỏ secret lẫn giá trị đều chỉ được tạo khi email_app_password có giá trị
# thật. Trước đây chỉ giá trị (secret_version) mới có điều kiện, còn vỏ secret
# thì luôn được tạo — dẫn tới một lỗi làm sập toàn bộ pipeline: vỏ secret tồn
# tại nên ARN khác rỗng, module batch vì thế vẫn gắn EMAIL_APP_PASSWORD vào Job
# Definition, nhưng secret lại không có giá trị nào ứng với nhãn AWSCURRENT.
# Mọi container do đó chết ngay ở bước khởi tạo với lỗi
# "ResourceInitializationError: unable to pull secrets", chưa kịp chạy FFmpeg.
# Giữ hai điều kiện đồng bộ để trạng thái "chưa cấu hình email" là nhất quán:
# không secret, ARN rỗng, Job Definition không tham chiếu.
#
resource "aws_secretsmanager_secret" "email_app_password" {
  count = var.email_app_password != "" ? 1 : 0

  name                    = "${var.project_name}/email-app-password"
  description             = "Gmail App Password for Transcoder video status notification emails"
  recovery_window_in_days = var.recovery_window_in_days

  tags = merge(var.tags, {
    Name = "${var.project_name}-email-app-password"
  })
}

resource "aws_secretsmanager_secret_version" "email_app_password" {
  count = var.email_app_password != "" ? 1 : 0

  secret_id     = aws_secretsmanager_secret.email_app_password[0].id
  secret_string = var.email_app_password
}
