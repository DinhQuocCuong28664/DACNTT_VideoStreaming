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
- [x] **Direct S3 Upload & Telemetry:** Pre-signed PUT URL (`POST /api/videos/initiate-upload`) tạo bản ghi DB trước tránh race condition. Giao diện tích hợp telemetry thời gian thực (tốc độ tải lên MB/s, thời gian ước tính còn lại ETA, phần trăm tiến độ, dung lượng đã truyền tải).
- [x] **Hủy tải lên an toàn & Dọn dẹp bản ghi nháp:** Tích hợp nút Cancel Upload (`AbortController` ngắt ngay kết nối PUT S3). Hàm `discardDraftVideo()` tự động dọn dẹp bản ghi nháp `UPLOADING` trên MongoDB ở cả 3 lối thoát (Người dùng hủy, Đổi file khác, Lỗi mạng/S3 hỏng) để triệt tiêu rò rỉ bản ghi mồ côi.
- [x] **Xem video HLS, ABR & Scrubber Hover Tooltip:** Phát `.m3u8` qua `HLS.js`, chuyển đổi linh hoạt giữa các mức 144p / 240p / 360p / 480p / 720p / 1080p. Thanh tua thời gian (timeline scrubber) trang bị tooltip trực quan bám theo con trỏ chuột, hiển thị mốc thời gian tại điểm đang trỏ kèm ảnh xem trước (ảnh bìa cố định, không phải khung hình tại vị trí tua — xem trước theo khung hình đòi hỏi sinh sprite sheet lúc chuyển mã).
- [x] **Gợi ý video liên quan (Related Videos):** Endpoint `GET /api/videos/:id/related` (mặc định 8, tối đa 24; trang xem gọi 10) hiển thị ở danh sách "Tiếp theo" cột phải trang xem, có chip lọc "Tất cả / Từ kênh này". Thuật toán gợi ý thông minh dựa trên tag và danh mục tương đồng (kèm bù bằng video xem nhiều nhất khi chưa đủ số lượng); bảo vệ 2 lớp: khoá cứng bộ lọc `visibility: 'public'` và `status: 'READY'`, đồng thời đóng kín lỗ hổng existence oracle (trả HTTP 404 cho video nguồn không có quyền xem thay vì lộ sự tồn tại).
- [x] **Chia sẻ video & Quyền riêng tư 2 lớp:** Chia sẻ link công khai hoặc riêng tư. Quyền riêng tư được kiểm soát đồng bộ ở cả tầng Backend API lẫn tầng CDN Edge Location qua CloudFront Signed Cookies.
- [x] **Trang cá nhân & Quản lý video nâng cao (Channel Management):** Menu 3 chấm (3-dot dropdown) hiện đại cho từng video, cho phép đổi quyền hiển thị trực tiếp (Public / Unlisted / Private). Hộp thoại chỉnh sửa kiểu YouTube Studio (bộ đếm ký tự, thẻ xem trước, chọn chế độ hiển thị bằng radio có câu giải thích) hỗ trợ sửa Tiêu đề, Mô tả, Danh mục và Quyền riêng tư ngay trên web (Tags hiện chỉ đặt được lúc tải lên — xem mục Hạn chế ở Chương 7 báo cáo). Hỗ trợ xóa sạch DB & S3 raw/HLS.
- [x] **Sắp xếp video trên trang kênh (Mới nhất / Phổ biến / Cũ nhất):** Tham số `?sort=latest|popular|oldest` cho `GET /api/videos/user/:userId`, tra qua bảng `USER_VIDEO_SORTS` cố định trong `videoService.js` (giá trị lạ quay về `latest`, không truyền được đối tượng sort tuỳ ý vào truy vấn). Mỗi kiểu sắp xếp kết thúc bằng `_id` làm tiêu chí phụ vì tài liệu MongoDB cảnh báo sắp theo trường trùng giá trị (như `views`) cho thứ tự không ổn định khi phân trang bằng `skip()`. Thêm index `{ user: 1, views: -1, createdAt: -1 }` cho kiểu "Phổ biến". Giao diện: hàng chip trên tab Video của trang kênh, đổi chip thì lưới cuộn vô hạn nạp lại từ đầu. Kiểm thử: `tests/userVideosSort.test.js` (10 tests).
- [x] **Giới hạn phân trang API danh sách:** `parsePaging` (`backend/src/utils/pagination.js`) chặn `limit` ở 50 và đưa `page`/`limit` không hợp lệ về mặc định cho `GET /api/videos`, `/api/videos/user/:userId` và `/api/videos/:id/comments`. Trước đó `?limit=100000` kéo cả collection trong một lần gọi, còn `?page=-1` tạo `skip()` âm và thành HTTP 500. Kiểm thử: `tests/pagination.test.js` (10 tests).
- [x] **Search & Filter:** Tìm kiếm video theo từ khóa tiêu đề, mô tả, tags (Escape Regex an toàn).
- [x] **Video Categories:** Lọc và Upload theo các danh mục: Công nghệ, Giáo dục, Giải trí, Âm nhạc, Game, Khác.
- [x] **Tương tác Người dùng:** Nút Like / Dislike tương tác tức thì.
- [x] **Hệ thống Bình luận (Comments):** Viết, đọc và xóa bình luận (cho phép tác giả bình luận OR chủ video xóa).
- [x] **Giao diện kiểu YouTube:** Thanh trên 56 px (ô tìm kiếm ở giữa), menu trái 240 px thu còn 72 px dưới 1312 px và thành ngăn kéo dưới 792 px; thẻ video phẳng; trang chủ và trang kênh **cuộn vô hạn** trên API phân trang sẵn có (`useInfiniteList`, lọc trùng theo `_id`, có nút "Tải thêm" dự phòng cho bàn phím). Ba lựa chọn chủ đề (sáng / tối / theo thiết bị) và hai ngôn ngữ, chỉnh ở Settings → Giao diện. Màu thương hiệu xanh ngọc lục `#10a37f` chỉ dùng cho logo và thanh tiến trình. Trang xem giữ nguyên cột trình phát **880 px** (hls.js chọn bậc chất lượng theo bề rộng này) bằng cách ẩn menu trái ở trang đó.
- [x] **Email thông báo trạng thái video:** Transcoder tự gửi email (Gmail SMTP, tái dùng pattern `emailService.js` sẵn có ở backend) báo "video sẵn sàng" hoặc "video thất bại" ngay khi ghi DB thành công — chỉ gửi bởi job thắng cuộc ghi (dựa trên cờ `updated` của lớp idempotency), tránh gửi trùng khi SQS redeliver. Email thất bại không lộ nội dung lỗi FFmpeg thô. **Không dùng** SNS topic `transcode-complete` (đã dựng sẵn trong Terraform nhưng mồ côi) vì SNS email subscription là tĩnh, không set được theo từng user lúc runtime — xem `infrastructure/modules/sns/main.tf`.

### 6. Quy trình chuyển mã video
- [x] S3 Event Notification (`s3:ObjectCreated`) → Amazon SQS Message Queue.
- [x] SQS Trigger Lambda Job Submitter gửi `SubmitJob` sang AWS Batch trên Fargate.
- [x] FFmpeg chuyển mã HLS 144p (120k), 240p (240k), 360p (400k), 480p (750k), 720p (1.5M), 1080p (4M), cắt theo kích thước nguồn (không phóng to), segment 6s + `master.m3u8` + `thumbnail.jpg`.
- [x] Cập nhật metadata `READY` trên MongoDB Atlas & thu hồi container (Fargate scale to 0).
- [x] **Idempotent write chống xử lý trùng:** `updateVideoReady`/`updateVideoError` dùng `findOneAndUpdate` có điều kiện `status != READY` thay vì ghi vô điều kiện, cộng thêm kiểm tra sớm ở đầu `processVideo` — chống ghi đè/lãng phí compute khi SQS redeliver message trùng (heartbeat trễ, hoặc `deleteMessage()` thất bại sau khi đã xử lý xong). Phát hiện qua nghiên cứu tài liệu (`docs/LITERATURE_REVIEW.md`, mục D — dựa trên lý thuyết lease của Burrows, Chubby lock service, OSDI 2006), xác nhận là gap thật trong code trước khi vá.

### 7. Phân phối nội dung video
- [x] **Mã nguồn Terraform sẵn sàng:** Module `cloudfront` triển khai đầy đủ Origin Access Control, Trusted Key Group và CloudFront Signed Cookies (`docs/PRIVATE_VIDEO_SIGNED_COOKIES.md`), đã `terraform validate` thành công cả hai môi trường.
- [x] **CloudFront ĐÃ triển khai thành công lên AWS:** Khắc phục giới hạn tài khoản AWS mới bằng cơ chế **multi-account Terraform provider** (`aws.account_a`, `aws.account_a_us_east_1`) — CloudFront video CDN (`cdn.zelostech.site`) và CloudFront frontend (`zelostech.site`) chạy trên tài khoản phụ khả dụng, trỏ gốc về S3 Processed Bucket private qua Origin Access Control (OAC) ở tài khoản chính.
- [x] **Đo kiểm thực nghiệm CloudFront:** Đã đo kiểm Time-to-First-Frame (TTFF) thực tế qua `cdn.zelostech.site`, phát hiện và tối ưu từ `PriceClass_100` (728 ms qua Marseille) -> `PriceClass_200` (110 ms qua SGN50) -> `PriceClass_All` (đồng bộ toàn cầu, đo từ 6 vùng AWS). Dữ liệu lưu tại `docs/results/qoe-ttff-cloudfront.json` và `docs/results/qoe-ttff-multiregion.json`.

### 8. Hạ tầng Cloud-Native và Containerization
- [x] Multi-stage Build Docker Image (`node:24-slim` + FFmpeg — nâng từ Node 18→20 do Mongoose 9.x yêu cầu Web Crypto API, tiếp tục nâng 20→24 ngày 10/8/2026 vì Node 20 đã EOL từ 30/4/2026; chọn 24 là bản Active LTS thay vì 26 (Current, chưa vào LTS) để giữ ổn định production).
- [x] Amazon ECR lưu trữ image với chế độ Image Scan on Push.
- [x] AWS Batch Fargate (`FARGATE_SPOT` tiết kiệm 70% chi phí).

### 9. CI/CD Pipeline & DevSecOps
- [x] `ci-backend.yml`: Jest Unit Tests (220/220 pass trên 21 test suite) + ESLint (0 errors) + Gitleaks + Trivy SCA Scan.
  - Phạm vi kiểm thử: `videoService`, `s3Service`, `authService`, `cloudfrontService`, `relatedVideos` (10 tests kiểm thử phân quyền, lọc public/READY và chống existence oracle), `userVideosSort` (10 tests kiểm thử sắp xếp trang kênh và chặn giá trị sort lạ), `pagination` (10 tests kiểm thử chặn limit và page không hợp lệ), `emailConfig` (9 tests kiểm thử phát hiện cấu hình email còn chuỗi giữ chỗ và kiểm tra SMTP lúc khởi động), `forgotPassword`, middleware xác thực JWT, kiểm soát quyền riêng tư video, và kiểm tra dữ liệu đầu vào khi tải lên (mức HTTP với `supertest`).
- [x] `ci-transcoder.yml`: Jest Unit Tests (140/140 pass trên 9 test suite — `dbHandler` idempotency, `renditions` (thang chất lượng theo nguồn), `thumbnail`, `s3Handler` (tải song song), `emailService`, `framerate` 32 tests kiểm tra GOP bám theo framerate thật của nguồn, `bandwidth` 18 tests kiểm tra BANDWIDTH đo từ segment thật theo RFC 8216 §4.3.4.2, `codecs` 32 tests kiểm tra chuỗi codec đọc từ luồng đã mã hoá theo RFC 6381) + ESLint + Gitleaks + Build Docker Image + Trivy Scan + ECR Push + Update Job Definition.
- [x] **Toàn bộ test suite tự động:** Đạt **360/360 tests PASS** trên 30 test suites toàn dự án (220 backend + 140 transcoder), đo lại ngày 2026-09-29.
- [x] `ci-frontend.yml`: oxlint + Build Vite + Deploy S3 Static Hosting (`s3 sync --delete` loại trừ `avatars/`, không còn xoá ảnh đại diện người dùng ở mỗi lần deploy).
- [x] `security-scan.yml`: Gitleaks Secret Detection + Trivy Dependency Scan trên mọi Pull Request.
- [x] **Môi trường Staging** (`infrastructure/environments/staging`, `scripts/staging-up.sh` / `staging-down.sh`): máy chủ backend chỉ tồn tại khi đang thử; `cd-staging.yml` deploy transcoder + backend + frontend của một nhánh, smoke test và quét DAST bằng OWASP ZAP baseline. Chờ `terraform apply` lần đầu.
- [x] `cd-deploy.yml`: chỉ chạy sau khi `CI — Backend` thành công (`workflow_run`), triển khai đúng commit CI vừa kiểm lên EC2 qua SSM.
- [x] **GitHub Actions → AWS bằng OIDC** (`infrastructure/environments/dev/github-oidc.tf`): ba role quyền tối thiểu thay cho khoá tĩnh; trust policy dùng *immutable subject* của repo. Đã bật ngày 2026-10-03: 5 biến repository (production + staging), mọi bước credential của 4 workflow deploy đã chạy thử qua OIDC, 4 secret khoá tĩnh đã xoá khỏi GitHub.
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
- [x] **Stress Test đồng thời (100 video) — ĐÃ CHẠY THẬT và có số liệu lưu lại:** Đã chạy thử nghiệm chịu tải đồng thời 100 upload cycles (50 VUs) với cả Node.js native script và k6 (Go engine), chéo xác thực đường cong xả hàng đợi SQS và Batch. Đồng thời đã chạy thêm kiểm thử với video thật 3s H.264 xác nhận 100% job SUCCEEDED, đo tốc độ xả hàng đợi 7.26 jobs/phút và trần song song 8 containers RUNNING (`docs/results/stress-test-concurrency.json`, `docs/results/k6-summary.json`, `docs/results/drain-rate-real-payload.json`).
- [x] **Frontend Code Splitting:** Cấu hình `manualChunks` trong `vite.config.js` tách bundle thành các chunk riêng biệt, đưa chunk ứng dụng chính xuống **175.61 kB** (gzip 50.70 kB) thay vì một bundle đơn khối, build 0 warnings. Các thư viện nặng được tách riêng để trình duyệt lưu cache độc lập: `vendor-hls` 508.79 kB (gzip 157.31 kB), `vendor-react` 283.60 kB (gzip 91.23 kB), `vendor-icons` 26.85 kB. (Đo lại 2026-09-09 sau khi thêm các tính năng gợi ý video, sửa video và telemetry tải lên; con số cũ là 161.51 kB / gzip 47.69 kB.)

### 13. Đóng góp kỹ thuật dự kiến
- [x] Chuẩn hóa kiến trúc Event-Driven Serverless Video Transcoding công nghiệp.

### 14. Sản phẩm dự kiến
- [x] Mã nguồn Monorepo hoàn chỉnh, 11 Terraform modules, 7 CI/CD workflows, Dockerfile, k6/Node.js stress scripts, Báo cáo FinOps.
- [x] **Sơ đồ kiến trúc dạng ảnh:** Đã xuất 5 sơ đồ Mermaid → PNG (`docs/diagrams/*.png`), chèn trực tiếp vào báo cáo LaTeX (`report/images/`).
- [x] **Báo cáo LaTeX:** Đã khởi tạo và hoàn thiện `report/` — 7 chương + phụ lục, biên dịch sạch bằng `pdflatex`/`bibtex` (76 trang), toàn bộ trích dẫn học thuật đã được xác minh độc lập qua DOI/DBLP/ACM DL.

### 15. Kết quả dự kiến
- [x] Sản phẩm chạy thực tế với domain `zelostech.site` (HTTPS qua CloudFront CDN).
- [x] Báo cáo LaTeX hoàn tất 76 trang, có trích dẫn đã kiểm chứng.
- [x] **Bộ số liệu thực nghiệm đầy đủ 100%:** Đo kiểm TTFF đa vùng (6 regions), thời gian chuyển mã (100MB, 500MB, 1GB), so sánh scaling 1 vCPU vs 4 vCPU, và Stress Test đồng thời 100 video với k6 / Node.js. Sẵn sàng 100% để bảo vệ.

### Rà soát và cải thiện hệ thống (2026-09-28 → 29)
Nhánh `fix/system-review`, mỗi lỗi một commit, có test hoặc kiểm chứng kèm theo:
- [x] **Bảo mật:** IP người dùng sau Cloudflare (rate limit không còn dùng chung IP Cloudflare); giới hạn tải lên/báo cáo theo tài khoản; chặn ảnh đại diện dạng HTML chạy trên `zelostech.site` (stored XSS) và ép giới hạn 2 GB ngay tại S3 bằng presigned POST; không công bố danh sách người Like/Dislike; security group chỉ nhận Cloudflare, đóng cổng 22; mật khẩu tối thiểu 8 ký tự, tối đa 72 byte; header bảo mật + CSP (report-only) cho frontend; `NODE_ENV=production` trên máy chủ (cookie `Secure`, ẩn lỗi 5xx); giới hạn body JSON 100 kB.
- [x] **Độ tin cậy:** Like/Dislike cập nhật nguyên tử (hết lỗi 500 khi bấm đồng thời); bộ đối soát video kẹt `PROCESSING`/`UPLOADING`; ảnh bìa cho video ngắn hơn 5 giây; nguồn 10-bit/4:4:4 (HDR iPhone) không còn làm job thất bại; mỗi video một bộ Signed Cookie (xem nhiều video ở nhiều tab); health check trả 503 khi mất MongoDB; deploy chờ CI xanh.
- [x] **Hiệu năng:** thang chất lượng theo nguồn, không phóng to, giữ tỉ lệ (nguồn 480p: 9,08 MB → 3,06 MB, 7,0 s → 1,4 s trên clip 12 s); tải HLS lên S3 song song; JS tải lần đầu của frontend 307,5 → 141,9 kB gzip; dọn bộ chống đếm trùng lượt xem O(1).
- [ ] Đo lại thời gian chuyển mã (100 MB / 500 MB / 1 GB) và Stress Test sau khi deploy — số liệu ở Chương 6 được đo trước hai thay đổi về thang chất lượng và tải song song.

---
> 📌 **Trạng thái cập nhật (2026-09-29):** Mã nguồn cho các mục rà soát ở trên đã xong và pass toàn bộ 360/360 test; chưa deploy. Trước đó (2026-09-24): Toàn bộ 15/15 mục đã hoàn thành 100%. CloudFront video CDN đã triển khai và đo kiểm đa vùng; Stress Test đồng thời 100 video đã thực thi hoàn tất với dữ liệu thực nghiệm đầy đủ; toàn bộ test suite backend và transcoder đều pass.
