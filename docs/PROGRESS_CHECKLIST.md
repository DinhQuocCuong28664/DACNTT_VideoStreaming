# Checklist tiến độ thực tế (đối chiếu với README)

> Cập nhật: 2026-09-09. README mô tả đề tài ở dạng "dự kiến" (ngôn ngữ đề xuất/báo cáo học thuật);
> checklist này ghi lại trạng thái **thực tế đã triển khai** tại thời điểm hiện tại, đối chiếu
> trực tiếp với code/hạ tầng đang chạy, không phải chỉ dựa vào mô tả trong README.

## 1. Tính năng người dùng (README §5, §14)

- [x] Đăng ký / đăng nhập bằng JWT
- [x] Đăng nhập bằng Google (Google Identity Services) — **không có trong README gốc**, bổ sung
      thêm cơ chế account-linking an toàn (không tự động gộp tài khoản theo email trùng, tránh lỗ
      hổng account takeover đã có CVE thực tế ở các thư viện auth khác)
- [x] Liên kết tài khoản Google từ trang Settings (sau khi đã đăng nhập bằng mật khẩu)
- [x] Đổi ảnh đại diện (avatar) qua Settings — presigned PUT thẳng lên S3
- [x] Upload video trực tiếp lên S3 bằng Pre-signed URL kèm **telemetry thời gian thực** (tốc độ
      tải MB/s, thời gian ước tính còn lại ETA, dung lượng đã truyền tải) và nút **Hủy tải lên**
      an toàn ngắt kết nối S3 PUT lập tức qua `AbortController`
- [x] **Tự động dọn dẹp bản ghi nháp `UPLOADING` (`discardDraftVideo()`)** tại cả 3 lối thoát khỏi
      luồng tải lên (bấm Hủy, chọn tệp khác, và tải lên hỏng do rớt mạng/S3 lỗi) — ngăn triệt để
      tình trạng rò rỉ bản ghi nháp mồ côi khi người dùng bấm Upload lại
- [x] Xem video bằng HLS.js + Adaptive Bitrate Streaming (360p/720p/1080p)
- [x] Trình phát video tuỳ biến với **Hover Preview Tooltip** bám theo vị trí con trỏ chuột trên
      thanh tua (timeline scrubber), hiển thị mốc thời gian tại điểm đang trỏ kèm ảnh xem trước
      (ảnh bìa cố định, không phải khung hình tại vị trí tua: transcoder chỉ trích một ảnh tại
      giây thứ 5, không sinh sprite sheet nên chưa xem trước theo khung hình được)
- [x] **Gợi ý video liên quan (Related Videos)** ở thanh bên trang xem video (`GET /api/videos/:id/related`),
      thuật toán đề xuất theo tag và danh mục tương đồng, sắp theo lượt xem giảm dần (kèm bù
      bằng video xem nhiều nhất khi chưa đủ số lượng); bảo
      vệ 2 lớp: khoá cứng bộ lọc `visibility: 'public'` và `status: 'READY'`, đồng thời đóng kín
      lỗ hổng existence oracle (trả 404 cho video nguồn không có quyền xem thay vì lộ sự tồn tại)
- [x] Tự động chuyển sang phát video ngay khi transcode xong, không cần F5 (polling trạng thái)
- [x] Chia sẻ video công khai / riêng tư — phân quyền 2 lớp đồng bộ ở cả Backend API và CloudFront Signed Cookies
- [x] Trang cá nhân (Channel) — quản lý video, xem lượt xem, theo dõi trạng thái xử lý, xoá video
- [x] **Quản lý video nâng cao**: Menu 3 chấm (3-dot dropdown) thao tác nhanh đổi trạng thái hiển
      thị trực tiếp (Public, Unlisted, Private); Modal chỉnh sửa video (Edit Modal) giao diện
      glassmorphic hỗ trợ sửa Tiêu đề, Mô tả, Danh mục và Quyền riêng tư ngay trên web
      (Tags vẫn chỉ đặt được ở biểu mẫu tải lên — `handleSaveEdit` không gửi trường này)
- [x] Tìm kiếm & lọc video, Like/Dislike, Bình luận, Danh mục, Đa ngôn ngữ (i18n), Responsive Mobile
- [x] Email thông báo video chuyển mã xong (READY) hoặc thất bại (ERROR) — code có sẵn từ trước
      nhưng **chưa từng gửi được** do thiếu `ref: 'User'` trong schema transcoder khiến populate
      luôn trả `email: undefined`; đã sửa và verify bằng data thật trong phiên này
- [x] **Bộ kiểm thử tự động toàn diện:** 127/127 tests PASS trên 11 test suites toàn dự án (115
      backend tests bao gồm `relatedVideos`, `cloudfrontService`, `uploadValidation`, `authService`...
      và 12 transcoder tests)

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
      → README §7 đã được viết lại cho đúng thực tế, đoạn cảnh báo "chưa deploy được" không còn nữa.
- [x] **CloudFront cho frontend (`zelostech.site`)** — hạng mục **không có trong README gốc**,
      phát sinh vì phát hiện lỗi thật: site cũ dùng S3 static website hosting, không xử lý được
      SPA client-side routes, F5/chia sẻ link trực tiếp tới `/watch/:id` trả 404 thật. Đã dựng
      CloudFront riêng (cùng cơ chế multi-account), cấp chứng chỉ ACM phủ cả `zelostech.site` và
      `www.zelostech.site`.
- [x] **CloudFront Signed Cookies — ĐÃ BẬT VÀ ĐANG CHẶN THẬT trên production.**
      `enable_signed_urls = true`; Trusted Key Group `dacntt-dev-signing-key-group`
      (public key `K2KJYTIG6SBJUI`) đã gắn vào default cache behaviour của distribution
      `E2CMTN7QBKADP3` từ 2026-08-30. Kiểm chứng lại ngày 2026-09-09: gọi
      `https://cdn.zelostech.site/<bất kỳ>/master.m3u8` khi không kèm cookie trả về
      **HTTP 403 `MissingKey: Missing Key-Pair-Id query parameter or cookie value`**, header
      `Server: CloudFront` — tức là bị chặn ngay tại Edge Location, chưa chạm tới S3.
      Lưu ý phạm vi: cổng ký phủ **toàn bộ video, kể cả video công khai**, không riêng video
      riêng tư; chỉ đường dẫn `*/thumbnail.jpg` được cố ý miễn trừ để trang danh mục vẫn hiển
      thị được ảnh đại diện. Backend cấp cookie qua `GET /api/videos/:id/playback-auth`, dùng
      lại đúng quy tắc phân quyền của `videoService.getVideoById` nên API và CDN không thể lệch
      nhau. Khoá riêng nằm ngoài git, backend đọc qua biến môi trường `CLOUDFRONT_PRIVATE_KEY`.
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
      trong khi CloudFront lúc đó chưa bật Signed Cookie, khiến mọi request bị trình
      duyệt chặn (nay đã bật cookie nên `withCredentials` là bắt buộc, xem mục 2)
- [x] Thêm rồi gỡ lại quyền truy cập LAN cho dev server (test xong không cần dùng nữa)
- [x] Sửa `<title>` trang từ mặc định `frontend` (do Vite sinh ra lúc khởi tạo) thành `VidShare`

## 4. Còn tồn đọng / chưa làm

- [x] Đã bật `enable_signed_urls = true`; Signed Cookies đang chặn thật ở Edge Location, đã
      kiểm chứng lại bằng `curl` ngày 2026-09-09 (xem mục 2)
- [x] README §7 và §9 đã sửa lại 2 chỗ lỗi thời (cảnh báo CloudFront "chưa deploy được" và mô tả
      `cd-deploy.yml` deploy "qua SSH") — cập nhật đúng thực tế hiện tại
- [x] Đã chạy lại stress test trên hạ tầng mới: `scripts/k6-load-test.js` chạy ngày 2026-08-30
      (100 iteration / 50 VUs, 300 request, tỉ lệ lỗi 0%, p95 = 1827 ms —
      `docs/results/k6-summary.json`), và ngày 2026-09-02 chạy thêm một vòng 100 upload bằng
      video H.264 thật để đo tốc độ xả hàng đợi 7.26 job/phút với trần 8 container song song
      (`docs/results/drain-rate-real-payload.json`). Số liệu TTFF qua CloudFront cũng đã đo lại
      (`qoe-ttff-cloudfront.json`, `qoe-ttff-multiregion.json`)
