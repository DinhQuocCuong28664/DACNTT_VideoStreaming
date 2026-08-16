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
- [x] **Chia sẻ video:** Chia sẻ link công khai hoặc riêng tư, có nút đổi chế độ hiển thị ngay trên trang kênh cá nhân. Quyền riêng tư được thực thi ở cả tầng API lẫn tầng CDN.
- [x] **Trang cá nhân Channel:** Quản lý video, đếm lượt xem, xóa video (xóa sạch DB & S3 raw/HLS).
- [x] **Search & Filter:** Tìm kiếm video theo từ khóa tiêu đề, mô tả, tags (Escape Regex an toàn).
- [x] **Video Categories:** Lọc và Upload theo các danh mục: Công nghệ, Giáo dục, Giải trí, Âm nhạc, Game, Khác.
- [x] **Tương tác Người dùng:** Nút Like / Dislike tương tác tức thì.
- [x] **Hệ thống Bình luận (Comments):** Viết, đọc và xóa bình luận (cho phép tác giả bình luận OR chủ video xóa).
- [x] **Email thông báo trạng thái video:** Transcoder tự gửi email (Gmail SMTP, tái dùng pattern `emailService.js` sẵn có ở backend) báo "video sẵn sàng" hoặc "video thất bại" ngay khi ghi DB thành công — chỉ gửi bởi job thắng cuộc ghi (dựa trên cờ `updated` của lớp idempotency), tránh gửi trùng khi SQS redeliver. Email thất bại không lộ nội dung lỗi FFmpeg thô. **Không dùng** SNS topic `transcode-complete` (đã dựng sẵn trong Terraform nhưng mồ côi) vì SNS email subscription là tĩnh, không set được theo từng user lúc runtime — xem `infrastructure/modules/sns/main.tf`.

### 6. Quy trình chuyển mã video
- [x] S3 Event Notification (`s3:ObjectCreated`) → Amazon SQS Message Queue.
- [x] SQS Trigger Lambda Job Submitter gửi `SubmitJob` sang AWS Batch trên Fargate.
- [x] FFmpeg chuyển mã HLS 360p (400k), 720p (1.5M), 1080p (4M), segment 6s + `master.m3u8` + `thumbnail.jpg`.
- [x] Cập nhật metadata `READY` trên MongoDB Atlas & thu hồi container (Fargate scale to 0).
- [x] **Idempotent write chống xử lý trùng:** `updateVideoReady`/`updateVideoError` dùng `findOneAndUpdate` có điều kiện `status != READY` thay vì ghi vô điều kiện, cộng thêm kiểm tra sớm ở đầu `processVideo` — chống ghi đè/lãng phí compute khi SQS redeliver message trùng (heartbeat trễ, hoặc `deleteMessage()` thất bại sau khi đã xử lý xong). Phát hiện qua nghiên cứu tài liệu (`docs/LITERATURE_REVIEW.md`, mục D — dựa trên lý thuyết lease của Burrows, Chubby lock service, OSDI 2006), xác nhận là gap thật trong code trước khi vá.

### 7. Phân phối nội dung video
- [x] **Mã nguồn Terraform sẵn sàng:** Module `cloudfront` triển khai đầy đủ Origin Access Control, Trusted Key Group và CloudFront Signed Cookies (`docs/PRIVATE_VIDEO_SIGNED_COOKIES.md`), đã `terraform validate` thành công cả hai môi trường.
- [ ] **CloudFront CHƯA triển khai lên tài khoản AWS đang dùng — đây vẫn là gap thật, chưa tính là hoàn thành.** `terraform apply` báo lỗi `AccessDenied: Your account must be verified before you can add new CloudFront resources`. Đã mở ticket AWS Support xin xác minh tài khoản (đang chờ duyệt, tính đến 2026-08-13). Terraform code (cả CDN video lẫn CDN frontend trong `frontend.tf`) đã sẵn sàng chạy ngay khi AWS duyệt — chỉ cần `terraform apply` + trỏ lại DNS, không cần sửa code.
- [x] **Giải pháp thay thế tạm thời (2026-08-13) đang chạy thật, không phải placeholder:** Domain `zelostech.site` chuyển DNS sang **Cloudflare (Free tier)** để có HTTPS ngay trong lúc chờ AWS duyệt — root domain proxy tới S3 static website, `api.zelostech.site` proxy qua **Nginx reverse proxy** dựng trên EC2 (port 80 → Node backend port 5000, vì Cloudflare Free không forward được port 5000 trực tiếp). Đã kiểm chứng end-to-end: HTTPS hoạt động, CORS đúng, video hiển thị được qua trình duyệt thật. **Lưu ý cho báo cáo:** đây là workaround hạ tầng do giới hạn tài khoản AWS mới, không phải thay đổi kiến trúc — thiết kế CloudFront + OAC + Signed Cookies vẫn nguyên trong code, sẽ chuyển lại khi AWS duyệt xong.

### 8. Hạ tầng Cloud-Native và Containerization
- [x] Multi-stage Build Docker Image (`node:24-slim` + FFmpeg — nâng từ Node 18→20 do Mongoose 9.x yêu cầu Web Crypto API, tiếp tục nâng 20→24 ngày 10/8/2026 vì Node 20 đã EOL từ 30/4/2026; chọn 24 là bản Active LTS thay vì 26 (Current, chưa vào LTS) để giữ ổn định production).
- [x] Amazon ECR lưu trữ image với chế độ Image Scan on Push.
- [x] AWS Batch Fargate (`FARGATE_SPOT` tiết kiệm 70% chi phí).

### 9. CI/CD Pipeline & DevSecOps
- [x] `ci-backend.yml`: Jest Unit Tests (71/71 pass trên 6 test suite) + ESLint (0 errors) + Gitleaks + Trivy SCA Scan.
  - Phạm vi kiểm thử: `videoService`, `s3Service`, `authService`, middleware xác thực JWT, kiểm soát quyền riêng tư video, và kiểm tra dữ liệu đầu vào khi tải lên (mức HTTP với `supertest`).
- [x] `ci-transcoder.yml`: Jest Unit Tests (12/12 pass — `dbHandler` idempotency, `emailService`) + ESLint + Gitleaks + Build Docker Image + Trivy Scan + ECR Push + Update Job Definition.
- [x] `ci-frontend.yml`: oxlint + Build Vite + Deploy S3 Static Hosting.
- [x] `security-scan.yml`: Gitleaks Secret Detection + Trivy Dependency Scan trên mọi Pull Request.
- [x] `cd-staging.yml` & `cd-deploy.yml`: Triển khai môi trường Staging (`develop`) và Production (`main`).
- [x] **Quality Gate hai lớp:** Mỗi bước quét Trivy được tách thành lớp *Báo cáo* (`CRITICAL,HIGH` — `exit-code: 0`) và lớp *Quality Gate* (`CRITICAL` — `exit-code: 1`) thực sự chặn Pull Request. Áp dụng cho cả quét mã nguồn, quét Docker Image và quét cấu hình Terraform.
- [x] **SAST — Phân tích tĩnh bảo mật:** Tích hợp `eslint-plugin-security` chạy thật trong `security-scan.yml` với `--max-warnings=0`, phát hiện các mẫu mã nguy hiểm (thực thi lệnh hệ thống, ReDoS, bộ sinh ngẫu nhiên không an toàn). Giải pháp này thay thế SonarQube, không cần dựng và duy trì server riêng.
- [x] **`ci-infra.yml` — Kiểm thử hạ tầng:** `terraform fmt -check -recursive` + `terraform init -backend=false` + `terraform validate` cho cả hai môi trường `dev` và `prod`, kèm quét cấu hình sai lệch bằng Trivy IaC.
- [x] **Bước triển khai không còn báo xanh giả:** `ci-transcoder.yml` nay thất bại tường minh khi AWS Batch Job Definition chưa tồn tại, thay vì chỉ in cảnh báo rồi bỏ qua.

### 10. Infrastructure as Code
- [x] 11 Terraform Modules: `s3`, `sqs`, `ecr`, `iam`, `vpc`, `secrets`, `sns`, `monitoring`, `batch`, `lambda`, `cloudfront`.
- [x] Môi trường `dev` & `prod` validate thành công 100% (`Success! The configuration is valid.`).

### 11. Công nghệ dự kiến
- [x] React.js, HLS.js, Node.js, Express, MongoDB Atlas, Docker, AWS (S3, SQS, Batch, Fargate, ECR, CloudFront, Secrets Manager, CloudWatch), Terraform, GitHub Actions.

### 12. Phương pháp đánh giá & Hiệu năng
- [x] **Node.js Stress Test Script:** Script `scripts/node-load-test.js` chạy native trên Node.js 18+ (Fail-fast JWT token validation, Exit code 1 khi có lỗi, hỗ trợ CLI arg 0).
- [x] **k6 Stress Test:** Script `scripts/k6-load-test.js` thử nghiệm 50-100 virtual users nộp video đồng thời (hỗ trợ Docker run 1-line).
- [x] **QoE Benchmark:** Script `scripts/benchmark-qoe.js` (dùng Node 18 native fetch) đo Time-to-First-Frame (TTFF) trên một CloudFront HLS URL truyền vào.
- [x] **FinOps Cost Report:** Document `docs/FINOPS_COST_ANALYSIS.md` phân tích mức tiết kiệm ~98.87% trên phần chi phí phụ thuộc kiến trúc (Compute + Storage), tương đương ~90.7% khi tính gộp cả chi phí CloudFront ngoài Free Tier.
- [x] **Số liệu đo thực nghiệm QoE & thời gian chuyển mã — đã chạy thật, có kết quả lưu lại:** `docs/results/qoe-ttff.json` (Time-to-First-Frame) và `docs/results/transcode-timing.json`. Đã đo với tệp 100 MB / 500 MB / 1 GB thật trên AWS Batch/Fargate Spot, xác minh chéo qua `aws batch describe-jobs`/CloudWatch Logs (không phải số tự bịa).
- [x] **Thí nghiệm mở rộng — so sánh 1 vCPU vs 4 vCPU:** Speedup đo được 4.12×–5.49×, giải thích được bằng Amdahl's Law (đối chiếu Sankaraiah 2014, Chen 2011 — xem `docs/LITERATURE_REVIEW.md` mục B.1).
- [ ] **Stress Test đồng thời (50–100 video) — CHƯA chạy thật, chỉ mới có script sẵn sàng.** `job_vcpu` hiện đang để 4 (dư lại từ thí nghiệm vCPU) — cần trả về 1 rồi mới chạy `k6-load-test.js`/`node-load-test.js` để kiểm chứng đúng khả năng scale ngang qua SQS như thiết kế Mục 12 yêu cầu. Đây là phần thực nghiệm còn thiếu rõ ràng nhất hiện tại.
- [x] **Frontend Code Splitting:** Cấu hình `manualChunks` trong `vite.config.js` tách bundle thành các chunk riêng biệt, đưa chunk ứng dụng chính xuống **118.00 kB** (gzip 34.36 kB) thay vì một bundle đơn khối 833 kB, build 0 warnings. Các thư viện nặng được tách riêng để trình duyệt lưu cache độc lập: `vendor-hls` 508.79 kB (gzip 157.31 kB), `vendor-react` 225.05 kB (gzip 72.09 kB), `vendor-icons` 24.46 kB.

### 13. Đóng góp kỹ thuật dự kiến
- [x] Chuẩn hóa kiến trúc Event-Driven Serverless Video Transcoding công nghiệp.

### 14. Sản phẩm dự kiến
- [x] Mã nguồn Monorepo hoàn chỉnh, 11 Terraform modules, 6 CI/CD workflows, Dockerfile, k6/Node.js stress scripts, Báo cáo FinOps.
- [x] **Sơ đồ kiến trúc dạng ảnh:** Đã xuất 5 sơ đồ Mermaid → PNG (`docs/diagrams/*.png`), chèn trực tiếp vào báo cáo LaTeX (`report/images/`).
- [x] **Báo cáo LaTeX:** Đã khởi tạo và hoàn thiện `report/` — 6 chương + phụ lục, biên dịch sạch bằng `pdflatex`/`bibtex` (45 trang), toàn bộ trích dẫn học thuật đã được xác minh độc lập qua DOI/DBLP/ACM DL (2 lỗi trích dẫn nghiêm trọng đã phát hiện và sửa).

### 15. Kết quả dự kiến
- [x] Sản phẩm chạy thực tế với domain `zelostech.site` (HTTPS qua Cloudflare tạm thời — xem Mục 7).
- [x] Báo cáo LaTeX hoàn tất, có trích dẫn đã kiểm chứng.
- [ ] **Bộ số liệu thực nghiệm CHƯA đầy đủ 100%:** thiếu đúng 1 phần — Stress Test đồng thời 50–100 video (xem Mục 12). Còn lại đã sẵn sàng để bảo vệ.

---
> 📌 **Trạng thái thật (2026-08-13, đã recheck):** Phần lớn hạng mục đã hoàn thành và kiểm thử thành công, kể cả những phần trước đây còn để trống (số liệu benchmark, sơ đồ, báo cáo LaTeX). **2 gap còn lại, chưa nên tính là xong:**
> 1. **CloudFront (Mục 7)** — chưa triển khai thật lên AWS do tài khoản đang chờ duyệt; đang chạy bằng Cloudflare thay thế tạm thời, không phải kiến trúc gốc trong báo cáo.
> 2. **Stress Test đồng thời (Mục 12)** — script đã có, nhưng chưa thực sự chạy để lấy số liệu.
