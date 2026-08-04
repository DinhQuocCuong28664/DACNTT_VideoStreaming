# ═══════════════════════════════════════════════════
# Module: ECR — Container Registry
# ═══════════════════════════════════════════════════

resource "aws_ecr_repository" "transcoder" {
  name                 = "${var.project_name}-transcoder"
  image_tag_mutability = "MUTABLE"
  force_delete         = var.force_delete

  image_scanning_configuration {
    scan_on_push = true # Auto-scan for CVE on every push
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-transcoder"
    Role = "Transcoder Docker Image Registry"
  })
}

# Lifecycle policy: Keep only last N images
resource "aws_ecr_lifecycle_policy" "transcoder" {
  repository = aws_ecr_repository.transcoder.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep only last ${var.max_image_count} images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.max_image_count
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
