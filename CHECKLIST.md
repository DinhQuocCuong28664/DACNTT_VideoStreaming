# 🎯 CHECKLIST TỔNG HỢP TIẾN ĐỘ DỰ ÁN
## DACNTT — Cloud-Native Video Sharing Platform with HLS Transcoding Pipeline
### Tuân thủ 100% 15 Mục Yêu cầu của Thầy ThS. Mai Văn Mạnh

---

## 🚀 CHI TIẾT TIẾN ĐỘ CHÍNH XÁC THEO 15 MỤC QUY ĐỊNH

### 1. Tên đề tài
- [x] Tiếng Việt: *Xây dựng nền tảng chia sẻ video trực tuyến với hệ thống chuyển mã HLS tự động trên kiến trúc Serverless Container và Event-Driven*.
- [x] Tiếng Anh: *Building a Video Sharing Platform with Automated HLS Transcoding Pipeline on Serverless Container and Event-Driven Architecture*.

### 2. Thông tin thực hiện
- [x] Sinh viên: Đinh Quốc Cường (MSSV: 523H0008) & Võ Huỳnh Minh Đức (MSSV: 523H0014).
- [x] Giảng viên hướng dẫn: ThS. Mai Văn Mạnh (TDTU).

### 3. Bối cảnh và vấn đề
- [x] Phân tích bài toán idle cost của EC2 24/7 so với kiến trúc Serverless Container (AWS Batch/Fargate).
- [x] Định hình giải pháp Event-Driven Architecture xử lý video song song.

### 4. Mục tiêu của đề tài
- [x] Xây dựng nền tảng web chia sẻ video hoàn chỉnh cho người dùng cuối.
- [x] Tự động hóa quy trình transcoding HLS, tự động hạ tầng (IaC) và CI/CD.

### 5. Các chức năng chính
- [x] **Xác thực JWT:** Đăng ký, Đăng nhập, Quên/Đổi mật khẩu (`authRoutes.js`).
- [x] **Direct S3 Upload:** Pre-signed PUT URL (`POST /api/videos/initiate-upload`) tạo bản ghi DB trước tránh race condition.
- [x] **Xem video HLS & ABR:** Phát `.m3u8` qua `HLS.js`, chuyển đổi linh hoạt 360p / 720p / 1080p.
- [x] **Chia sẻ video:** Chia sẻ link công khai hoặc riêng tư.
- [x] **Trang cá nhân Channel:** Quản lý video, đếm lượt xem, xóa video (xóa sạch DB & S3 raw/HLS).
- [x] **Search & Filter:** Tìm kiếm video theo từ khóa tiêu đề, mô tả, tags (Escape Regex an toàn).
- [x] **Video Categories:** Lọc và Upload theo các danh mục: Công nghệ, Giáo dục, Giải trí, Âm nhạc, Game, Khác.
- [x] **Tương tác Người dùng:** Nút Like / Dislike tương tác tức thì.
- [x] **Hệ thống Bình luận (Comments):** Viết, đọc và xóa bình luận (cho phép tác giả bình luận OR chủ video xóa).

### 6. Quy trình chuyển mã video
- [x] S3 Event Notification (`s3:ObjectCreated`) → Amazon SQS Message Queue.
- [x] SQS Trigger Lambda Job Submitter gửi `SubmitJob` sang AWS Batch trên Fargate.
- [x] FFmpeg chuyển mã HLS 360p (400k), 720p (1.5M), 1080p (4M), segment 6s + `master.m3u8` + `thumbnail.jpg`.
- [x] Cập nhật metadata `READY` trên MongoDB Atlas & thu hồi container (Fargate scale to 0).

### 7. Phân phối nội dung video
- [x] Phân phối qua Amazon CloudFront CDN.
- [x] Bảo mật S3 Bucket hoàn toàn riêng tư bằng Origin Access Control (OAC).

### 8. Hạ tầng Cloud-Native và Containerization
- [x] Multi-stage Build Docker Image (`node:18-slim` + FFmpeg).
- [x] Amazon ECR lưu trữ image với chế độ Image Scan on Push.
- [x] AWS Batch Fargate (`FARGATE_SPOT` tiết kiệm 70% chi phí).

### 9. CI/CD Pipeline & DevSecOps
- [x] `ci-backend.yml`: Jest Unit Tests (13/13 pass) + ESLint (0 errors) + Gitleaks + Trivy SCA Scan.
- [x] `ci-transcoder.yml`: ESLint + Gitleaks + Build Docker Image + Trivy Scan + ECR Push + Update Job Definition.
- [x] `security-scan.yml` & `cd-deploy.yml`: Quality Gate nghiêm ngặt (chặn `--audit-level=critical`), tự động block PR có lỗi.

### 10. Infrastructure as Code
- [x] 11 Terraform Modules: `s3`, `sqs`, `ecr`, `iam`, `vpc`, `secrets`, `sns`, `monitoring`, `batch`, `lambda`, `cloudfront`.
- [x] Môi trường `dev` & `prod` validate thành công 100% (`Success! The configuration is valid.`).

### 11. Công nghệ dự kiến
- [x] React.js, HLS.js, Node.js, Express, MongoDB Atlas, Docker, AWS (S3, SQS, Batch, Fargate, ECR, CloudFront, Secrets Manager, CloudWatch), Terraform, GitHub Actions.

### 12. Phương pháp đánh giá & Hiệu năng
- [x] **Node.js Stress Test Script:** Script `scripts/node-load-test.js` chạy native trên Node.js 18+ (Fail-fast JWT token validation, Exit code 1 khi có lỗi, hỗ trợ CLI arg 0).
- [x] **k6 Stress Test:** Script `scripts/k6-load-test.js` thử nghiệm 50-100 virtual users nộp video đồng thời (hỗ trợ Docker run 1-line).
- [x] **QoE Benchmark:** Script `scripts/benchmark-qoe.js` (dùng Node 18 native fetch) đo Time-to-First-Frame (TTFF) và SLA nén file 100MB/500MB/1GB.
- [x] **FinOps Cost Report:** Document `docs/FINOPS_COST_ANALYSIS.md` chứng minh tiết kiệm 98.86% chi phí so với EC2 24/7.
- [x] **Frontend Code Splitting:** Cấu hình `manualChunks` trong `vite.config.js` giảm bundle size ứng dụng từ 833 kB xuống **82.13 kB** (0 warnings).

### 13. Đóng góp kỹ thuật dự kiến
- [x] Chuẩn hóa kiến trúc Event-Driven Serverless Video Transcoding công nghiệp.

### 14. Sản phẩm dự kiến
- [x] Mã nguồn Monorepo hoàn chỉnh, 11 Terraform modules, 4 CI/CD workflows, Dockerfile, k6/Node.js stress scripts, Báo cáo FinOps.

### 15. Kết quả dự kiến
- [x] Sản phẩm chạy thực tế với domain `zelostech.site`, sẵn sàng cho bảo vệ đồ án cuối kỳ.

---
> 📌 **Trạng thái:** Toàn bộ 15 mục kỹ thuật đã sẵn sàng và được kiểm thử thành công.
