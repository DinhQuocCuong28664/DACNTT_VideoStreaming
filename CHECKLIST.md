# 🎯 CHECKLIST TỔNG HỢP TIẾN ĐỘ DỰ ÁN
## DACNTT — Cloud-Native Video Sharing Platform with HLS Transcoding

---

## 📌 BẢNG QUẢN LÝ TIẾN ĐỘ TỔNG QUAN

- [x] **Phase 0: Khởi tạo dự án & Cấu trúc Monorepo** `(Đã hoàn thành 100%)`
- [x] **Phase 1: Xây dựng Backend API & Database** `(Đã hoàn thành 100%)`
- [ ] **Phase 2: Xây dựng Frontend UI & HLS Player (React.js)** `(Chưa bắt đầu)`
- [ ] **Phase 3: Transcoder Engine (Docker + FFmpeg + SQS Handler)** `(Chưa bắt đầu)`
- [ ] **Phase 4: Hạ tầng Terraform IaC & CI/CD Pipeline (GitHub Actions)** `(Chưa bắt đầu)`
- [ ] **Phase 5: DevSecOps, Monitoring & Load Testing (k6)** `(Chưa bắt đầu)`

---

## 🚀 PHASE 0: KHỞI TẠO DỰ ÁN & CẤU TRÚC MONOREPO

> **Mục tiêu:** Thiết lập cấu trúc Monorepo chuẩn doanh nghiệp, quy tắc phát triển (AGENTS.md), cấu hình môi trường và đồng bộ GitHub repository.

### Checklist công việc Phase 0:
- [x] **Repository & Git:**
  - [x] Tạo repository private `DACNTT_VideoStreaming` trên GitHub.
  - [x] Phân quyền collaborator cho thành viên team (`minhduc14022005-dev`).
  - [x] Khởi tạo root `.gitignore` (loại bỏ `node_modules`, `.env`, `.tfstate`, log files).
- [x] **Tài liệu & Quy tắc:**
  - [x] Cấu hình `.agents/AGENTS.md` định nghĩa quy tắc code, chuẩn đặt tên commit, kiến trúc 3 lớp, thiết kế HLS player.
  - [x] Hoàn thiện `README.md` cao cấp (550+ dòng): Mô tả chi tiết, Luồng nghiệp vụ 10 bước, Kiến trúc hệ thống, Tech Stack, DevSecOps, Monitoring, Giải thích thuật ngữ, Risk Management và Timeline.
- [x] **Scaffold Cấu trúc Thư mục Monorepo:**
  - [x] **Backend (`backend/`):** Khởi tạo Node.js/Express, cài đặt dependencies (`express`, `mongoose`, `jsonwebtoken`, `bcryptjs`, `cors`, `dotenv`, `@aws-sdk/client-s3`). Tạo sẵn các thư mục MVC (`config`, `controllers`, `middleware`, `models`, `routes`, `services`).
  - [x] **Frontend (`frontend/`):** Khởi tạo dự án Vite + React.js, cài đặt `hls.js`, `react-router-dom`, `axios`. Tạo cấu trúc thư mục UI (`api`, `assets`, `components`, `context`, `hooks`, `pages`, `styles`).
  - [x] **Infrastructure (`infrastructure/`):** Khởi tạo 7 Terraform modules (`batch`, `cloudfront`, `ecr`, `iam`, `s3`, `sqs`, `vpc`) và thư mục `environments/`.
  - [x] **Transcoder (`transcoder/`):** Khởi tạo thư mục `src/` sẵn sàng đóng gói Docker Container.
  - [x] **CI/CD (`.github/workflows/`):** Khởi tạo thư mục chứa các đường ống CI/CD.

---

## ⚡ PHASE 1: BACKEND API & DATABASE (NODE.JS + MONGODB ATLAS)

> **Mục tiêu:** Xây dựng toàn bộ Backend REST API cốt lõi, kết nối MongoDB Atlas thực tế, xác thực JWT, tính năng Quên/Đổi mật khẩu qua Gmail SMTP, và quản lý Video (CRUD + S3 Pre-signed URL).

### Checklist công việc Phase 1:

#### 1. Cấu hình & Database (`config/` & `models/`)
- [x] **`backend/.env`**: Cấu hình chuỗi kết nối MongoDB Atlas thực tế, JWT Secret, và Gmail App Password (`cbzero28664@gmail.com`).
- [x] **`src/config/db.js`**: Kết nối MongoDB Atlas bằng Mongoose, hỗ trợ tự động kết nối lại (Auto-reconnect) và ghi log sự kiện.
- [x] **`src/models/User.js`**:
  - [x] Schema User: `username`, `email`, `password`, `displayName`, `avatar`, `channelDescription`, `subscribers`.
  - [x] Tự động mã hóa mật khẩu bằng `bcryptjs` (saltRounds = 10) trước khi lưu.
  - [x] Tương thích hoàn toàn Mongoose 9 (Async pre-save hook).
  - [x] Tự động ẩn các trường nhạy cảm (`password`, `resetPasswordToken`) khi xuất JSON.
  - [x] Tạo và mã hóa `resetPasswordToken` có thời hạn 15 phút.
- [x] **`src/models/Video.js`**:
  - [x] Schema Video với Enum trạng thái: `UPLOADING` ➔ `PROCESSING` ➔ `READY` ➔ `ERROR`.
  - [x] Lưu trữ các đường dẫn S3 (`rawS3Key`, `hlsUrl`, `thumbnailUrl`).
  - [x] Lưu thông số kĩ thuật video (`duration`, `fileSize`, `mimeType`) & chỉ số tương tác (`views`, `tags`, `visibility`).
  - [x] Đánh chỉ mục (Indexes) tối ưu cho trang Home, trang Kênh và Transcoder query.

#### 2. Middleware & Utilities (`middleware/`)
- [x] **`src/middleware/auth.js`**: Middleware xác thực JWT Bearer Token, kiểm tra quyền và nạp thông tin user vào `req.user`.
- [x] **`src/middleware/errorHandler.js`**: Middleware bắt lỗi toàn cục, chuẩn hóa phản hồi lỗi JSON cho Mongoose, JWT và lỗi hệ thống.
- [x] **`src/middleware/validateRequest.js`**: Middleware kiểm tra tính hợp lệ của dữ liệu đầu vào (Required fields, Email format).

#### 3. Tầng Xử lý Nghiệp vụ (`services/`)
- [x] **`src/services/authService.js`**: Đăng ký, Đăng nhập, Tạo JWT token (hạn 7 ngày), Đổi mật khẩu, Quên mật khẩu.
- [x] **`src/services/emailService.js`**: Nodemailer service kết nối Gmail SMTP gửi email HTML thiết kế đẹp chứa link đặt lại mật khẩu.
- [x] **`src/services/s3Service.js`**: Sử dụng AWS SDK v3 sinh **Pre-signed PUT URL** (thời hạn 15 phút) cho S3 Raw Bucket và xóa file S3.
- [x] **`src/services/videoService.js`**: Logic CRUD Video, phân trang (Pagination), tăng lượt xem bất đồng bộ (Async fire-and-forget), lọc theo quyền sở hữu.

#### 4. Controllers & Routes (`controllers/` & `routes/`)
- [x] **Authentication Endpoints (`/api/auth`)**:
  - [x] `POST /api/auth/register` — Đăng ký tài khoản mới.
  - [x] `POST /api/auth/login` — Đăng nhập nhận JWT Token.
  - [x] `GET /api/auth/me` — Lấy thông tin tài khoản hiện tại (Protected).
  - [x] `POST /api/auth/forgot-password` — Gửi email quên mật khẩu qua Gmail SMTP.
  - [x] `POST /api/auth/reset-password/:token` — Đặt lại mật khẩu mới bằng Token.
  - [x] `PUT /api/auth/change-password` — Đổi mật khẩu (Protected).
- [x] **Video Management Endpoints (`/api/videos`)**:
  - [x] `POST /api/videos/upload-url` — Sinh Pre-signed URL để Client upload trực tiếp lên S3 (Protected).
  - [x] `POST /api/videos` — Tạo bản ghi video với trạng thái `UPLOADING` (Protected).
  - [x] `PATCH /api/videos/:id/confirm-upload` — Chuyển trạng thái `UPLOADING` ➔ `PROCESSING` (Protected).
  - [x] `GET /api/videos` — Danh sách video public READY cho trang chủ (Public, Phân trang).
  - [x] `GET /api/videos/:id` — Xem chi tiết video + tự động tăng view count (Public).
  - [x] `GET /api/videos/user/:userId` — Danh sách video theo Kênh cá nhân (Public / Owner full access).
  - [x] `PUT /api/videos/:id` — Cập nhật tiêu đề, mô tả, tags, riêng tư (Protected, Owner only).
  - [x] `DELETE /api/videos/:id` — Xóa video khỏi DB và S3 (Protected, Owner only).

---

## 🧪 KẾT QUẢ KIỂM THỬ THỰC NGHIỆM (EMPIRICAL TEST RESULTS)

| Kịch bản kiểm thử | API Endpoint | Trạng thái thực tế | Ghi chú kiểm thử |
|-------------------|--------------|-------------------|------------------|
| Kết nối Database | `Mongoose.connect()` | ✅ **SUCCESS** | Kết nối thành công tới MongoDB Atlas Cluster (`dacntt-videostreaming.kunxhmk.mongodb.net`) |
| Đăng ký tài khoản | `POST /api/auth/register` | ✅ **SUCCESS** | Đã tạo thành công user `cbzero` trong MongoDB Atlas, mật khẩu được mã hóa bcrypt |
| Đăng nhập | `POST /api/auth/login` | ✅ **SUCCESS** | Trả về JWT token có thời hạn 7 ngày |
| Lấy thông tin me | `GET /api/auth/me` | ✅ **SUCCESS** | Xác thực Bearer Token thành công, trả về profile |
| Quên mật khẩu (Email) | `POST /api/auth/forgot-password` | ✅ **SUCCESS** | Gmail SMTP đã xác thực App Password và gửi email HTML thành công về `cbzero28664@gmail.com` |
| Đổi mật khẩu | `PUT /api/auth/change-password` | ✅ **SUCCESS** | Mật khẩu mới được mã hóa lại và cập nhật vào DB |
| Đăng nhập MK mới | `POST /api/auth/login` | ✅ **SUCCESS** | Đăng nhập thành công với `NewPassword456` |
| Tạo bản ghi Video | `POST /api/videos` | ✅ **SUCCESS** | Bản ghi video khởi tạo với trạng thái `UPLOADING` |
| Xem chi tiết Video | `GET /api/videos/:id` | ✅ **SUCCESS** | Trả về dữ liệu video, lượt xem tự động tăng từ 0 ➔ 1 |
| Cập nhật Video | `PUT /api/videos/:id` | ✅ **SUCCESS** | Cập nhật tiêu đề, mô tả, quyền riêng tư thành công |
| Xóa Video | `DELETE /api/videos/:id` | ✅ **SUCCESS** | Xóa bản ghi DB mượt mà, xử lý ngoại lệ an toàn khi S3 key chưa tồn tại |

---

> 📌 **Trạng thái Mã nguồn:** Đã commit và push toàn bộ lên GitHub Repository (`master` branch).
> 📌 **Cập nhật lần cuối:** 22/07/2026
