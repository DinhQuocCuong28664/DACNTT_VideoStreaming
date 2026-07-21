# AGENTS.md — DACNTT Video Sharing Platform

## Project Overview
Nền tảng Chia sẻ Video Trực tuyến với Hệ thống Transcoding HLS trên Kiến trúc Serverless Container.
- **Môn học:** Dự án Công nghệ Thông tin (DACNTT)
- **Định hướng:** DEVOPS, CONTAINERIZATION & CLOUD SYSTEMS
- **Repo:** https://github.com/DinhQuocCuong28664/CUOC_SONG_MOI

## Architecture
- **Frontend:** React.js + HLS.js (Adaptive Bitrate Video Player)
- **Backend API:** Node.js (Express) + MongoDB Atlas + JWT
- **Transcoder:** FFmpeg trong Docker Container chạy trên AWS Batch/Fargate
- **Cloud:** S3, SQS, ECR, CloudFront, SNS/SES
- **IaC:** Terraform (modules: s3, sqs, ecr, batch, cloudfront, iam, vpc)
- **CI/CD:** GitHub Actions

## Folder Structure
```
DACNTT/
├── frontend/          # React.js SPA
├── backend/           # Node.js Express API
├── transcoder/        # FFmpeg Docker Container
├── infrastructure/    # Terraform IaC (modules/)
├── .github/workflows/ # CI/CD Pipelines
├── scripts/           # Utility/testing scripts
└── docs/              # Architecture diagrams, reports
```

## Coding Rules

### General
- Ngôn ngữ code: English (biến, hàm, comment). Ngôn ngữ tài liệu/README: Tiếng Việt.
- Luôn viết `.env.example` khi thêm biến môi trường mới. KHÔNG commit file `.env`.
- Mỗi commit message phải theo format: `type(scope): description` (VD: `feat(backend): add pre-signed URL endpoint`)
- Không hardcode AWS credentials. Sử dụng IAM Roles hoặc environment variables.

### Frontend (React.js)
- Sử dụng functional components + hooks. Không dùng class components.
- State management: React Context (không cần Redux cho scope này).
- Video Player BẮT BUỘC dùng HLS.js để phát `.m3u8`. Không dùng native `<video>` tag với src trực tiếp.
- Upload video qua Pre-signed URL (không qua Backend server).

### Backend (Node.js)
- Cấu trúc: `routes/ → controllers/ → services/`. Không viết logic trực tiếp trong route handler.
- Xác thực: JWT (access token). Middleware `auth.js` verify token cho mọi protected route.
- Video model status: `UPLOADING | PROCESSING | READY | ERROR`
- Pre-signed URL expiry: 15 phút.

### Transcoder (Docker)
- Dockerfile BẮT BUỘC dùng Multi-stage Build.
- Base image: `node:18-slim` (KHÔNG dùng `alpine` vì FFmpeg cần `glibc`).
- FFmpeg output: HLS với 3 renditions (360p/720p/1080p), segment duration 6s.
- Implement Heartbeat Pattern cho SQS Visibility Timeout.
- Sau khi transcode xong: cập nhật MongoDB status → READY, lưu CloudFront HLS URL.

### Terraform
- Tổ chức theo modules: `modules/s3`, `modules/sqs`, `modules/batch`, `modules/cloudfront`, `modules/iam`, `modules/vpc`, `modules/ecr`.
- Sử dụng `variables.tf` + `terraform.tfvars` cho mỗi environment (dev/prod).
- Mọi resource phải có tags: `Project = "DACNTT"`, `Environment = "dev|prod"`.
- S3 bucket names phải unique globally — dùng prefix với project name.

### CI/CD (GitHub Actions)
- Workflow `ci-transcoder.yml`: Build Docker → Push ECR → Update Batch Job Definition.
- Workflow `ci-backend.yml`: Lint → Test → Build check.
- Secrets cần thiết: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `ECR_REPOSITORY`.

## Key Design Decisions
1. **AWS Batch on Fargate** thay vì ECS Service: Batch tự quản lý job queue, tự scale, tự terminate. Phù hợp hơn ECS cho workload batch processing.
2. **Pre-signed URL** cho upload: Giảm tải Backend, client upload thẳng S3.
3. **CloudFront + OAC**: S3 Processed Bucket hoàn toàn private, chỉ CloudFront truy cập được.
4. **SQS + Heartbeat Pattern**: Tránh duplicate processing, tránh stuck job.

## User Notes
<!-- Bạn có thể thêm notes cá nhân ở đây -->

