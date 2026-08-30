# Checklist tiến độ thực tế (đối chiếu với README)

> Cập nhật: 2026-08-30. README mô tả đề tài ở dạng "dự kiến" (ngôn ngữ đề xuất/báo cáo học thuật);
> checklist này ghi lại trạng thái **thực tế đã triển khai** tại thời điểm hiện tại, đối chiếu
> trực tiếp với code/hạ tầng đang chạy, không phải chỉ dựa vào mô tả trong README.

## 1. Tính năng người dùng (README §5, §14)

- [x] Đăng ký / đăng nhập bằng JWT
- [x] Đăng nhập bằng Google (Google Identity Services) — **không có trong README gốc**, bổ sung
      thêm cơ chế account-linking an toàn (không tự động gộp tài khoản theo email trùng, tránh lỗ
      hổng account takeover đã có CVE thực tế ở các thư viện auth khác)
- [x] Liên kết tài khoản Google từ trang Settings (sau khi đã đăng nhập bằng mật khẩu)
- [x] Đổi ảnh đại diện (avatar) qua Settings — presigned PUT thẳng lên S3
- [x] Upload video trực tiếp lên S3 bằng Pre-signed URL
- [x] Xem video bằng HLS.js + Adaptive Bitrate Streaming (360p/720p/1080p)
- [x] Tự động chuyển sang phát video ngay khi transcode xong, không cần F5 (polling trạng thái)
- [x] Chia sẻ video công khai / riêng tư
- [x] Trang cá nhân (Channel) — quản lý video, xem lượt xem, xoá video
- [x] Tìm kiếm & lọc video, Like/Dislike, Bình luận, Danh mục, Responsive Mobile
- [x] Email thông báo video chuyển mã xong (READY) hoặc thất bại (ERROR) — code có sẵn từ trước
      nhưng **chưa từng gửi được** do thiếu `ref: 'User'` trong schema transcoder khiến populate
      luôn trả `email: undefined`; đã sửa và verify bằng data thật trong phiên này

## 2. Pipeline xử lý video & Hạ tầng (README §6–§10)

- [x] Kiến trúc Event-Driven: S3 → SQS → Lambda → AWS Batch (Fargate) → MongoDB — chạy thật, đã
      test end-to-end nhiều lần trong phiên này (upload → PROCESSING → READY tự động)
- [x] Docker multi-stage build (Node 24-slim + FFmpeg), push ECR qua CI
- [x] CI/CD 7 workflow GitHub Actions — tất cả đã xanh, verify trực tiếp qua nhiều lần push trong
      phiên này (CI Frontend/Backend/Infra/Transcoder, CD Deploy, Security Scan)
- [x] IaC bằng Terraform, 11 module — mở rộng thêm cơ chế multi-account provider (xem mục 3)
- [x] **CloudFront cho video CDN + Origin Access Control** — README §7 có cảnh báo (2026-08-10)
      rằng chưa deploy được vì account AWS chính bị chặn tạo CloudFront (`AccessDenied`, chờ AWS
      Support). **Đã giải quyết trong phiên này**: chạy CloudFront trên 1 AWS account phụ (account
      A) trong khi S3/Batch/Lambda vẫn ở account chính — không cần đợi ticket được duyệt nữa.
      → **README §7 cần cập nhật lại, đoạn cảnh báo "chưa deploy được" đã lỗi thời.**
- [x] **CloudFront cho frontend (`zelostech.site`)** — hạng mục **không có trong README gốc**,
      phát sinh vì phát hiện lỗi thật: site cũ dùng S3 static website hosting, không xử lý được
      SPA client-side routes, F5/chia sẻ link trực tiếp tới `/watch/:id` trả 404 thật. Đã dựng
      CloudFront riêng (cùng cơ chế multi-account), cấp chứng chỉ ACM phủ cả `zelostech.site` và
      `www.zelostech.site`.
- [ ] **CloudFront Signed Cookies cho video riêng tư** — mã nguồn Terraform đã viết đầy đủ
      (`enable_signed_urls`, Trusted Key Group, `docs/PRIVATE_VIDEO_SIGNED_COOKIES.md`) nhưng
      **vẫn đang tắt** (`enable_signed_urls = false`). Video riêng tư hiện được phân phối qua
      CloudFront giống hệt video công khai — đúng như README §7 đã tự nhận là hạn chế, đến giờ
      vẫn còn nguyên, chỉ khác là bucket đã private thật (không còn public bucket policy tạm thời
      như ghi trong cảnh báo cũ).
- [x] HTTPS cho `api.zelostech.site` bằng chứng chỉ **Let's Encrypt thật** (thay self-signed) +
      renewal hook tự reload nginx — hạng mục vận hành phát sinh khi bật Cloudflare "Full/Full
      Strict" cho phần CloudFront frontend ở trên

## 3. Thay đổi hạ tầng phát sinh trong phiên làm việc này (không có trong README)

- [x] Cơ chế **multi-account Terraform provider** (`aws.account_a`, `aws.account_a_us_east_1`) để
      chạy CloudFront trên 1 AWS account không bị giới hạn, trong khi toàn bộ tài nguyên còn lại
      (S3/Batch/Lambda/Secrets) vẫn ở account chính — mẫu hình này áp dụng cho cả video CDN lẫn
      frontend CDN
- [x] Sửa security group egress bị Trivy chấm CRITICAL (AWS-0104) bằng annotation `trivy:ignore`
      có giải thích rõ lý do (S3/ECR/SQS/MongoDB Atlas không có dải IP cố định để giới hạn hẹp hơn)
- [x] Sửa hàng loạt lỗi CSS thật: `.form-row` sai số cột, đụng độ tên class `.progress-bar-*`
      giữa VideoPlayer/VideoUpload/LandingPage, `.textarea` và `.skeleton-card` chưa từng được
      định nghĩa
- [x] Sửa lỗi CORS video không phát được: `VideoPlayer` mặc định gửi cookie (`withCredentials`)
      dù CloudFront chưa bật Signed Cookie, khiến mọi request bị trình duyệt chặn
- [x] Thêm rồi gỡ lại quyền truy cập LAN cho dev server (test xong không cần dùng nữa)
- [x] Sửa `<title>` trang từ mặc định `frontend` (do Vite sinh ra lúc khởi tạo) thành `VidShare`

## 4. Còn tồn đọng / chưa làm

- [ ] Bật `enable_signed_urls = true` để Signed Cookies thật sự bảo vệ video riêng tư (xem mục 2)
- [x] README §7 và §9 đã sửa lại 2 chỗ lỗi thời (cảnh báo CloudFront "chưa deploy được" và mô tả
      `cd-deploy.yml` deploy "qua SSH") — cập nhật đúng thực tế hiện tại
- [ ] Chưa xác nhận trong phiên này: kịch bản `scripts/k6-load-test.js` (stress test 50–100 video
      đồng thời) đã có sẵn nhưng không được chạy lại để lấy số liệu mới — số liệu hiện có trong
      `docs/results/` là dữ liệu cũ, chưa phản ánh hạ tầng CloudFront mới
