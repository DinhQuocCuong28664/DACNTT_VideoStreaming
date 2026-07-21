# 🎬 Nền tảng Chia sẻ Video Trực tuyến với Hệ thống Transcoding HLS trên Kiến trúc Serverless Container
## Cloud-Native Video Sharing Platform with HLS Transcoding Pipeline on Serverless Container Architecture

> **Môn học:** Dự án Công nghệ Thông tin (DACNTT)
> **Nhóm:** DACNTT_DQC_VHMD
> **Thành viên:**
> - Đinh Quốc Cường (MSSV: 523H0008)
> - Võ Huỳnh Minh Đức (MSSV: 523H0014)
>
> **Giảng viên hướng dẫn:** Thầy Mai Văn Mạnh
> **Định hướng:** DEVOPS, CONTAINERIZATION & CLOUD SYSTEMS
> **GitHub:** https://github.com/DinhQuocCuong28664 | https://github.com/minhduc14022005-dev
> **Domain:** https://zelostech.site

---

## 📋 MỤC LỤC

1. [Tổng quan dự án](#1-tổng-quan-dự-án)
2. [Mô tả đề tài chi tiết](#2-mô-tả-đề-tài-chi-tiết)
3. [Luồng nghiệp vụ thực tế (Business Flow)](#3-luồng-nghiệp-vụ-thực-tế-business-flow)
4. [Kiến trúc hệ thống (Architecture Diagram)](#4-kiến-trúc-hệ-thống-architecture-diagram)
5. [Công nghệ sử dụng (Tech Stack)](#5-công-nghệ-sử-dụng-tech-stack)
6. [DevSecOps & CI/CD Pipeline](#6-devsecops--cicd-pipeline)
7. [Hệ thống Giám sát (Monitoring & Observability)](#7-hệ-thống-giám-sát-monitoring--observability)
8. [Giải thích thuật ngữ kỹ thuật](#8-giải-thích-thuật-ngữ-kỹ-thuật)
9. [Nhận diện rủi ro & Chiến lược giảm thiểu](#9-nhận-diện-rủi-ro--chiến-lược-giảm-thiểu-senior-insights)
10. [Lộ trình thực hiện (Timeline)](#10-lộ-trình-thực-hiện-timeline)

---

## 1. TỔNG QUAN DỰ ÁN

### Bối cảnh
Video trực tuyến đang thống trị Internet — YouTube xử lý hơn 500 giờ video upload mỗi phút, TikTok và Instagram Reels phục vụ hàng tỷ lượt xem mỗi ngày. Đằng sau trải nghiệm mượt mà đó là một hệ thống xử lý (Transcoding Pipeline) cực kỳ phức tạp: mỗi video gốc được chuyển đổi thành nhiều phiên bản chất lượng khác nhau (360p, 720p, 1080p) theo chuẩn **HLS (HTTP Live Streaming)** để người xem có thể chuyển đổi chất lượng linh hoạt theo tốc độ mạng (Adaptive Bitrate Streaming). Việc xây dựng một hệ thống như vậy theo mô hình truyền thống (máy chủ chạy 24/7) sẽ cực kỳ tốn kém khi lưu lượng upload không đồng đều.

### Mục tiêu
Xây dựng một **Nền tảng Chia sẻ Video hoàn chỉnh (Video Sharing Platform)** — một sản phẩm đầu cuối cho phép người dùng:
- **Upload** video từ giao diện web
- **Xem** video với nhiều chất lượng khác nhau (Adaptive Bitrate) qua giao thức **HTTP Streaming (HLS)**
- **Chia sẻ** video với người khác qua đường link

Phần **Backend** được thiết kế theo kiến trúc **Serverless Container (AWS Fargate / AWS Batch)** kết hợp **Event-Driven Architecture**, tự động scale từ 0 lên hàng trăm container khi có lượng upload lớn và thu gọn về 0 khi rảnh — tối ưu 100% chi phí vận hành.

---

## 2. MÔ TẢ ĐỀ TÀI CHI TIẾT

### Tên đề tài
- **Tiếng Việt:** Xây dựng nền tảng chia sẻ video trực tuyến với hệ thống chuyển mã HLS tự động trên kiến trúc Serverless Container và Event-Driven
- **Tiếng Anh:** Building a Video Sharing Platform with Automated HLS Transcoding Pipeline on Serverless Container and Event-Driven Architecture

### Mô tả / Nội dung đề tài

**1. Bối cảnh và vấn đề:**
Các nền tảng chia sẻ video hiện đại (YouTube, Vimeo, TikTok) đều phải giải quyết một bài toán cốt lõi: Khi người dùng upload một file video gốc (có thể ở bất kỳ định dạng, codec, độ phân giải nào), hệ thống phải tự động chuyển mã (Transcode) video đó thành định dạng chuẩn **HLS (HTTP Live Streaming)** — cắt nhỏ video thành các đoạn (segment `.ts`) dài 2-10 giây, tạo nhiều phiên bản chất lượng (360p, 720p, 1080p), và sinh ra file danh sách phát (manifest `.m3u8`) để trình phát video trên trình duyệt có thể tự động chuyển đổi chất lượng theo băng thông mạng của người xem (Adaptive Bitrate Streaming). Việc duy trì một cụm máy chủ (Server/Kubernetes) chạy 24/7 chỉ để chờ transcoding gây lãng phí tài nguyên cực lớn (Idle Cost) khi không có ai upload. Ngược lại, khi có nhiều người upload cùng lúc, hệ thống cần tự động mở rộng (Scale Out) để xử lý song song hàng trăm video. Đề tài đề xuất xây dựng một nền tảng chia sẻ video hoàn chỉnh (sản phẩm đầu cuối) với hệ thống transcoding HLS hoạt động trên kiến trúc Serverless Container (AWS Fargate/Batch) kết hợp Event-Driven Architecture, giải quyết triệt để bài toán tối ưu chi phí và khả năng mở rộng tự động.

**2. Phạm vi và nội dung thực hiện:**

*A. Sản phẩm đầu cuối (End-User Product):*
- Xây dựng **Website người dùng cuối** với giao diện hiện đại (React.js) cho phép:
  - **Đăng ký / Đăng nhập** tài khoản người dùng (JWT Authentication).
  - **Upload video** từ trình duyệt: Client gọi API Backend để nhận **Pre-signed URL** (đường link upload tạm thời có thời hạn), sau đó tải file video trực tiếp lên Amazon S3 mà không cần đi qua Backend Server — giảm tải hoàn toàn cho Server.
  - **Xem video** với trình phát tích hợp thư viện **HLS.js**: tự động phân tích file manifest `.m3u8`, tải các đoạn video segment `.ts` theo thời gian thực, và chuyển đổi chất lượng (360p/720p/1080p) mượt mà dựa trên tốc độ mạng hiện tại của người xem (Adaptive Bitrate Streaming).
  - **Chia sẻ video** qua đường link công khai hoặc riêng tư.
  - **Trang cá nhân (Channel):** Quản lý danh sách video đã upload, xem lượt xem, xóa video.

*B. Hệ thống Transcoding Pipeline (Backend xử lý video):*
- Áp dụng mô hình **Event-Driven Architecture**: Khi video gốc được upload thành công lên S3 (Raw Bucket), S3 tự động phát ra Event Notification.
- Event được đẩy vào **Amazon SQS** (Message Queue) làm bộ đệm — đảm bảo không rớt task dù có hàng trăm video upload cùng lúc.
- SQS kích hoạt **AWS Batch trên Fargate** (Serverless Container): AWS Batch tự động tạo Docker Container chứa **FFmpeg**, kéo video gốc từ S3 về, và thực hiện transcoding:
  - Chuyển đổi video sang **định dạng HLS**: cắt thành các segment `.ts` dài 6 giây.
  - Tạo nhiều phiên bản chất lượng (Renditions): **360p** (400kbps), **720p** (1.5Mbps), **1080p** (4Mbps).
  - Sinh file **Master Playlist** (`.m3u8`) liệt kê tất cả phiên bản chất lượng — trình phát HLS.js sẽ đọc file này để biết có những chất lượng nào khả dụng.
- Sau khi transcoding hoàn tất: tất cả file `.ts` segments và `.m3u8` manifests được upload lên **S3 Processed Bucket**. Metadata (tiêu đề, mô tả, URL manifest, thumbnail, thời lượng) được lưu vào **MongoDB Atlas**.
- Container tự động bị tiêu hủy (Terminated) sau khi hoàn thành nhiệm vụ — chỉ trả tiền cho thời gian thực thi.

*C. Phân phối Video (Content Delivery):*
- Sử dụng **Amazon CloudFront** (CDN - Content Delivery Network) đặt trước S3 Processed Bucket. CloudFront cache các file `.ts` segments tại các Edge Location gần người xem nhất trên toàn cầu, giảm độ trễ (Latency) và giảm chi phí truy xuất S3.
- Cấu hình **Origin Access Control (OAC)**: S3 Bucket hoàn toàn Private, chỉ CloudFront được quyền truy cập — ngăn chặn truy cập trực tiếp trái phép vào video.

*D. Hạ tầng Cloud-Native, Containerization & DevOps:*
- **Containerization**: Đóng gói môi trường transcoding (FFmpeg + Node.js) thành Docker Image tối ưu qua Multi-stage Build. Push Image lên Amazon ECR.
- **CI/CD Pipeline**: Xây dựng bằng **GitHub Actions** với tích hợp DevSecOps: tự động chạy Lint/Test → Quét bảo mật mã nguồn (SonarQube SAST) → Quét lỗ hổng Docker Image và thư viện dependencies (Trivy) → Phát hiện secret bị lộ trong code (Gitleaks) → Build Docker Image → Push lên ECR → Cập nhật AWS Batch Job Definition → Deploy Backend API. Pipeline tự động chặn deploy nếu phát hiện lỗ hổng bảo mật Critical/High (Quality Gate).
- **Infrastructure as Code (IaC)**: Toàn bộ hạ tầng AWS (S3 Buckets, SQS Queue, Batch Compute Environment, Fargate, ECR, CloudFront Distribution, IAM Roles, MongoDB) được quản lý tự động bằng **Terraform**. Một câu lệnh `terraform apply` dựng toàn bộ hệ thống.

*E. Tích hợp Security Scanning đa tầng (DevSecOps):*
- **SonarQube (SAST):** Quét mã nguồn tìm lỗ hổng bảo mật (SQL Injection, XSS, Path Traversal), phát hiện Code Smell và Technical Debt, đo Code Coverage. Thiết lập Quality Gate tự động block deploy khi code không đạt chuẩn.
- **Trivy (Container & SCA Scanning):** Quét Docker Image tìm lỗ hổng CVE trong OS packages. Quét file `package.json` tìm lỗ hổng trong thư viện open-source (Software Composition Analysis).
- **Gitleaks (Secret Detection):** Quét toàn bộ Git history phát hiện API key, Database password, JWT Secret bị commit nhầm vào source code.

*F. Hệ thống Giám sát (Monitoring & Observability):*
- **Amazon CloudWatch**: Thu thập Metrics (CPU, Memory, thời gian xử lý transcoding, số job thành công/thất bại) từ AWS Batch/Fargate và Backend API. Tạo Dashboard trực quan theo dõi health hệ thống real-time.
- **CloudWatch Alarms + Amazon SNS**: Cấu hình cảnh báo tự động khi phát hiện bất thường (VD: SQS Dead Letter Queue có message → gửi email/Telegram cảnh báo ngay lập tức).
- **Structured Logging**: Tất cả log từ Transcoder Container và Backend được ghi theo format JSON chuẩn, đẩy về CloudWatch Logs để tìm kiếm và debug nhanh chóng.

**3. Công nghệ sử dụng:**
- **Frontend**: React.js, HLS.js (Adaptive Bitrate Video Player), Axios.
- **Backend API**: Node.js (Express), JWT Authentication, AWS SDK (S3 Pre-signed URL).
- **Video Processing**: FFmpeg (chạy trong Docker Container trên AWS Batch/Fargate).
- **Cloud Infrastructure**: Amazon S3 (Storage), Amazon SQS (Message Queue), AWS Batch on Fargate (Serverless Compute), Amazon ECR (Container Registry), Amazon CloudFront (CDN), Amazon SNS/SES (Notification).
- **Database**: MongoDB Atlas (Video Metadata, User data).
- **DevOps & IaC**: Docker, GitHub Actions (CI/CD), Terraform (Infrastructure as Code).
- **DevSecOps**: SonarQube (SAST + Quality Gate), Trivy (Container & SCA Scanning), Gitleaks (Secret Detection).
- **Monitoring**: Amazon CloudWatch (Metrics + Logs + Alarms), Amazon SNS (Alerting).
- **Load Testing**: k6 (Mô phỏng tải upload đồng thời).
- **HTTPS**: AWS Certificate Manager (ACM) + CloudFront (TLS/SSL).

**4. Phương pháp đánh giá:**
- **Đánh giá trải nghiệm xem video (Quality of Experience):** Đo thời gian từ lúc bấm Play đến khi khung hình đầu tiên hiển thị (Time-to-First-Frame). Kiểm tra chuyển đổi chất lượng mượt mà khi thay đổi băng thông mạng (dùng DevTools throttle).
- **Đánh giá hiệu năng Transcoding Pipeline:** Đo thời gian xử lý end-to-end (từ lúc upload xong đến khi video sẵn sàng xem) cho các kích thước file khác nhau (100MB, 500MB, 1GB).
- **Kiểm thử chịu tải (Load Testing):** Dùng **k6** viết kịch bản tự động upload cùng lúc 50-100 video lên S3 để kiểm chứng khả năng scale tự động của AWS Batch và khả năng giữ lệnh chờ xử lý của SQS. Đo Throughput (request/giây), Latency p95, Error Rate (%).
- **Kiểm chứng bảo mật (Security Report):** Xuất báo cáo SonarQube (SAST Report), Trivy (Vulnerability Report), Gitleaks (Secret Scan Report) cho toàn bộ codebase.
- **Phân tích chi phí (FinOps):** Lập bảng so sánh chi phí vận hành giữa kiến trúc EC2 chạy FFmpeg 24/7 so với kiến trúc Serverless Batch/Fargate chỉ tính tiền theo thời gian thực thi.

**5. Kết quả dự kiến:**
- Một **nền tảng chia sẻ video hoàn chỉnh** (sản phẩm đầu cuối): người dùng có thể đăng ký, upload video, xem video với nhiều chất lượng (Adaptive Bitrate HLS), và chia sẻ video — tương tự trải nghiệm YouTube.
- Hệ thống **Transcoding Pipeline tự động** trên Serverless Container: Video upload lên → tự động chuyển mã sang HLS (360p/720p/1080p) → phân phối qua CDN → sẵn sàng xem.
- Bộ mã nguồn **IaC (Terraform)** chuẩn hóa, dựng toàn bộ hạ tầng AWS chỉ bằng 1 câu lệnh.
- Đường ống **CI/CD** tự động hóa toàn diện từ commit code đến production với Security Gate tích hợp.
- Báo cáo bảo mật từ SonarQube (SAST Report), Trivy (Vulnerability Report), Gitleaks (Secret Scan Report).
- Báo cáo phân tích hiệu năng transcoding và tối ưu chi phí (FinOps Report).
- Sản phẩm được triển khai trên hosting thực tế với domain `zelostech.site` và HTTPS.

---

## 3. LUỒNG NGHIỆP VỤ THỰC TẾ (Business Flow)

Dưới đây là luồng hoạt động hoàn chỉnh từ góc nhìn người dùng cuối và hệ thống xử lý phía sau:

### 🔼 LUỒNG 1: UPLOAD VIDEO

#### Bước 1: Người dùng chọn video để upload
- Người dùng đăng nhập vào Website, nhấn nút "Upload Video".
- Điền thông tin: Tiêu đề, Mô tả, Tags, chọn Thumbnail (hoặc hệ thống tự tạo).
- Chọn file video từ máy tính (hỗ trợ: `.mp4`, `.mov`, `.avi`, `.mkv`).

#### Bước 2: Lấy Pre-signed URL từ Backend
- Frontend gọi API `POST /api/videos/upload-url` gửi kèm tên file và loại file.
- Backend (Node.js) sử dụng **AWS SDK** để tạo một **S3 Pre-signed URL** — đường link upload tạm thời có thời hạn (15 phút).
- **Tại sao dùng Pre-signed URL?** Thay vì upload file qua Backend Server (gây tắc nghẽn và tốn băng thông Server), Client upload thẳng lên S3 thông qua Pre-signed URL. Backend chỉ đóng vai trò "phát vé" upload, không phải "khuân vác" dữ liệu.

#### Bước 3: Upload trực tiếp lên S3 (Raw Bucket)
- Frontend sử dụng Pre-signed URL để `PUT` file video trực tiếp lên **Amazon S3 Raw Bucket**.
- Hỗ trợ hiển thị thanh tiến trình upload (Progress Bar) trên giao diện.
- Khi upload hoàn tất, Frontend gọi API `POST /api/videos` để lưu metadata video (tiêu đề, mô tả, trạng thái: "PROCESSING") vào **MongoDB**.

### ⚙️ LUỒNG 2: TRANSCODING PIPELINE (Hoàn toàn tự động - Không cần can thiệp)

#### Bước 4: Kích hoạt sự kiện (Event Trigger)
- Ngay khi file video gốc được lưu vào S3 Raw Bucket thành công, S3 tự động phát ra một **S3 Event Notification** (sự kiện `s3:ObjectCreated:*`).
- Event này được đẩy vào **Amazon SQS Queue** (Hàng đợi) để làm bộ đệm.
- **Tại sao cần SQS?** Nếu 100 người upload cùng lúc, SQS giữ 100 lệnh xếp hàng ngay ngắn, tránh hệ thống bị quá tải (Throttling). Các lệnh được rút ra xử lý tuần tự hoặc song song tùy cấu hình.

#### Bước 5: AWS Batch khởi tạo Serverless Container
- Amazon SQS kích hoạt **AWS Batch**. Batch tự động submit một Job chạy trên **AWS Fargate** (Serverless Container).
- Fargate kéo (pull) **Docker Image** chứa FFmpeg + Node.js từ **Amazon ECR** (Container Registry).
- Container được khởi tạo, nhận thông tin video cần xử lý từ message SQS.

#### Bước 6: Transcoding video sang HLS (Adaptive Bitrate)
- Container tải video gốc (`raw-video.mp4`) từ S3 Raw Bucket xuống.
- Sử dụng **FFmpeg** để thực hiện transcoding đa luồng:
  - **Tạo 3 phiên bản chất lượng (Renditions):**
    - `360p` – Bitrate 400kbps (cho mạng chậm, 3G)
    - `720p` – Bitrate 1.5Mbps (cho mạng trung bình, 4G)
    - `1080p` – Bitrate 4Mbps (cho mạng nhanh, WiFi/5G)
  - **Cắt thành segments:** Mỗi phiên bản được chia thành các đoạn nhỏ `.ts` (MPEG Transport Stream), mỗi đoạn dài **6 giây**.
  - **Sinh file Manifest (`.m3u8`):**
    - Mỗi phiên bản chất lượng có một **Media Playlist** (`.m3u8`) liệt kê danh sách các file `.ts` segment theo đúng thứ tự phát.
    - Một **Master Playlist** (`master.m3u8`) tổng hợp cả 3 phiên bản — trình phát video (HLS.js) sẽ đọc file này để biết có 360p, 720p, 1080p và tự chọn phiên bản phù hợp với băng thông mạng hiện tại.
  - **(Tùy chọn) Tạo Thumbnail:** Trích xuất frame tại giây thứ 5 của video làm ảnh đại diện (Poster).

#### Bước 7: Lưu kết quả và tiêu hủy Container
- Tất cả file đầu ra (segments `.ts`, manifests `.m3u8`, thumbnail) được upload lên **S3 Processed Bucket** theo cấu trúc thư mục:
  ```
  processed-bucket/
  └── videos/
      └── {video-id}/
          ├── master.m3u8           (Master Playlist)
          ├── 360p/
          │   ├── playlist.m3u8     (Media Playlist 360p)
          │   ├── segment_000.ts
          │   ├── segment_001.ts
          │   └── ...
          ├── 720p/
          │   ├── playlist.m3u8     (Media Playlist 720p)
          │   └── ...
          ├── 1080p/
          │   ├── playlist.m3u8     (Media Playlist 1080p)
          │   └── ...
          └── thumbnail.jpg
  ```
- Cập nhật trạng thái video trong MongoDB: `status: "PROCESSING"` → `status: "READY"`, lưu URL của `master.m3u8` trên CloudFront.
- **Container tự động bị tiêu hủy (Terminated)** sau khi hoàn thành — ngừng tính phí Cloud.
- Gửi thông báo cho người upload qua **Amazon SNS/SES**: *"Video của bạn đã sẵn sàng để xem!"*

### ▶️ LUỒNG 3: XEM VIDEO (HTTP Adaptive Streaming)

#### Bước 8: Người xem mở video
- Người xem truy cập trang video trên Website.
- Frontend nhận URL của `master.m3u8` từ API Backend.
- Trình phát video (tích hợp **HLS.js**) gửi request tải `master.m3u8` từ **Amazon CloudFront** (CDN).

#### Bước 9: Adaptive Bitrate Streaming
- HLS.js phân tích Master Playlist → biết có 3 chất lượng: 360p, 720p, 1080p.
- Dựa trên **tốc độ mạng hiện tại** của người xem, HLS.js tự động chọn chất lượng phù hợp:
  - Mạng WiFi nhanh → Chọn 1080p → Tải từng segment `.ts` chất lượng cao.
  - Mạng 4G bình thường → Chọn 720p.
  - Mạng chậm / 3G → Chọn 360p để tránh giật lag (buffering).
- Nếu mạng **thay đổi giữa chừng** (VD: đang WiFi chuyển sang 4G), HLS.js tự động chuyển xuống chất lượng thấp hơn ở segment tiếp theo — **không cần tải lại video từ đầu** (Seamless Quality Switching).
- CloudFront **cache** các file `.ts` tại Edge Location gần người xem nhất → Giảm độ trễ, tăng tốc tải video.

#### Bước 10: Chia sẻ video
- Người dùng nhấn nút "Chia sẻ" → Copy link video (VD: `https://app.example.com/watch/{video-id}`).
- Người nhận link → Mở trình duyệt → Xem video bình thường qua HLS streaming.

---

## 4. KIẾN TRÚC HỆ THỐNG (Architecture Diagram)

### Bảng tổng hợp thành phần hệ thống

| Tầng | Thành phần | Công nghệ | Vai trò |
|------|-----------|-----------|---------|
| **Frontend** | Web Application | React.js + HLS.js | Giao diện upload, xem video (Adaptive Bitrate Player), chia sẻ |
| **Backend API** | REST API Server | Node.js (Express) | Xác thực JWT, cấp Pre-signed URL, quản lý metadata video |
| **Upload** | Object Storage (Raw) | Amazon S3 | Lưu trữ video gốc (Raw Zone) |
| **Event Trigger** | Event Notification | S3 Event → SQS | Tự động phát sự kiện khi có file mới upload |
| **Message Queue** | Hàng đợi | Amazon SQS | Bộ đệm (Decoupling) giữa upload và transcoding |
| **Transcoding** | Serverless Compute | AWS Batch on Fargate | Khởi tạo Container FFmpeg tự động, transcode sang HLS |
| **Container Image** | Registry | Amazon ECR | Lưu trữ Docker Image chứa FFmpeg + Node.js |
| **Output** | Object Storage (Processed) | Amazon S3 | Lưu trữ HLS segments (`.ts`) và manifests (`.m3u8`) |
| **Delivery** | CDN | Amazon CloudFront | Cache và phân phối video tới người xem toàn cầu với độ trễ thấp |
| **Database** | Metadata Store | MongoDB Atlas | Lưu thông tin video (tiêu đề, mô tả, URL, trạng thái, user) |
| **Notification** | Alert | Amazon SNS / SES | Gửi email thông báo khi transcoding hoàn tất |
| **IaC** | Hạ tầng | Terraform | Tự động hóa khởi tạo toàn bộ hạ tầng AWS bằng code |
| **CI/CD** | Pipeline | GitHub Actions | Tự động test → build Docker → push ECR → deploy |

---

## 5. CÔNG NGHỆ SỬ DỤNG (Tech Stack)

### Khối Frontend (Giao diện người dùng)
| Công nghệ | Vai trò |
|-----------|---------|
| **React.js** | Framework xây dựng giao diện SPA (Single Page Application) |
| **HLS.js** | Thư viện JavaScript phát video HLS trên mọi trình duyệt (Chrome, Firefox, Edge). Xử lý Adaptive Bitrate, transmux `.ts` sang fMP4 qua Media Source Extensions API |
| **Axios** | HTTP Client gọi API Backend |

### Khối Backend API
| Công nghệ | Vai trò |
|-----------|---------|
| **Node.js (Express)** | REST API Server: xác thực, quản lý video metadata, cấp Pre-signed URL |
| **JWT (JSON Web Token)** | Xác thực và phân quyền người dùng |
| **AWS SDK (v3)** | Tương tác với S3 (tạo Pre-signed URL), SQS, Batch từ code Node.js |
| **MongoDB Atlas** | Database lưu trữ metadata video, thông tin user |

### Khối Video Processing (Transcoding Engine)
| Công nghệ | Vai trò |
|-----------|---------|
| **FFmpeg** | Công cụ mã nguồn mở mạnh nhất để transcode video, tạo HLS segments, sinh thumbnail |
| **Docker** | Đóng gói FFmpeg + Node.js thành Container image tối ưu (Multi-stage Build) |
| **AWS Batch on Fargate** | Serverless compute: tự động khởi tạo/tiêu hủy Container theo workload, tính tiền theo giây |

### Khối Cloud Infrastructure & DevOps (TRỌNG TÂM)
| Công nghệ | Vai trò |
|-----------|---------|
| **Amazon S3** | Object Storage: Raw Bucket (video gốc) + Processed Bucket (HLS output) |
| **Amazon SQS** | Message Queue: bộ đệm Event-Driven giữa S3 và Batch |
| **Amazon CloudFront** | CDN: cache và phân phối HLS segments tới Edge Location toàn cầu |
| **Amazon ECR** | Container Registry: lưu trữ Docker Image |
| **Amazon SNS / SES** | Notification: gửi email/SMS thông báo khi transcoding xong |
| **Terraform** | Infrastructure as Code: tự động hóa toàn bộ hạ tầng AWS |
| **GitHub Actions** | CI/CD Pipeline: tự động test, scan, build, push, deploy |

### Khối DevSecOps (Bảo mật tích hợp)
| Công nghệ | Vai trò |
|-----------|---------|
| **SonarQube (Community Edition)** | Quét mã nguồn: lỗ hổng bảo mật, Code Smell, Technical Debt, Coverage |
| **Trivy** | Quét Docker Image + dependencies tìm lỗ hổng CVE |
| **Gitleaks** | Phát hiện API key, password bị commit nhầm vào Git |

### Khối Monitoring & Observability
| Công nghệ | Vai trò |
|-----------|---------|
| **Amazon CloudWatch** | Thu thập Metrics (CPU, Memory, Job Duration) + Logs tập trung |
| **CloudWatch Alarms** | Cảnh báo tự động khi metrics vượt ngưỡng |
| **Amazon SNS** | Gửi cảnh báo qua Email/Telegram khi hệ thống gặp sự cố |

### Khối Kiểm thử & Triển khai
| Công nghệ | Vai trò |
|-----------|---------|
| **k6** | Load Testing: mô phỏng tải upload đồng thời, đo hiệu năng |
| **AWS Certificate Manager (ACM)** | Tự động cấp chứng chỉ HTTPS/TLS cho domain `zelostech.site` |

---

## 6. DEVSECOPS & CI/CD PIPELINE

### 6.1. Kiến trúc Pipeline (GitHub Actions)

```
Developer Push Code
       ↓
GitHub Actions Trigger
       ↓
┌─────────────────────────────────┐
│  Stage 1: Code Quality         │
│  - ESLint, Prettier            │
│  - Jest unit tests             │
│  - npm audit (dependency scan) │
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  Stage 2: Security Scanning    │
│  - Gitleaks (Secret Detection) │
│  - SonarQube (SAST + Quality   │
│    Gate: block nếu Critical)   │
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  Stage 3: Build & Scan Image   │
│  - docker build (Multi-stage)  │
│  - Trivy scan Docker Image     │
│    (block nếu CVE Critical)    │
│  - docker push → Amazon ECR    │
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  Stage 4: Deploy               │
│  - Update Batch Job Definition │
│  - Deploy Backend API          │
│  - CloudFront cache invalidate │
└─────────────────────────────────┘
```

### 6.2. Security Scanning đa tầng

| Tầng | Công cụ | Mục tiêu | Hành động khi phát hiện |
|------|---------|----------|------------------------|
| **SAST** | SonarQube | Quét mã nguồn tìm SQL Injection, XSS, Path Traversal. Đo Code Coverage, phát hiện Code Smell và Technical Debt | Quality Gate → Block deploy nếu có Critical Vulnerability hoặc Coverage < 80% |
| **SCA** | Trivy | Quét `package.json` tìm lỗ hổng CVE trong thư viện open-source | Block deploy nếu có CVE Critical/High |
| **Container Scan** | Trivy | Quét Docker Image tìm lỗ hổng CVE trong OS packages (`debian-slim`, FFmpeg) | Block deploy nếu có CVE Critical/High |
| **Secret Detection** | Gitleaks | Quét toàn bộ Git history phát hiện API key, AWS credentials, JWT Secret bị commit nhầm | Block deploy + cảnh báo ngay lập tức |

### 6.3. Workflows

| File Workflow | Trigger | Nội dung |
|--------------|---------|----------|
| `ci-backend.yml` | Push vào `backend/` | Lint → Test → SonarQube → Trivy SCA → Build check |
| `ci-transcoder.yml` | Push vào `transcoder/` | Build Docker Image → Trivy scan Image → Push ECR → Update Batch Job Definition |
| `cd-deploy.yml` | Merge vào `main` | Deploy Backend API → Invalidate CloudFront cache |
| `security-scan.yml` | Mỗi Pull Request | Gitleaks scan → SonarQube SAST → Trivy dependency scan |

---

## 7. HỆ THỐNG GIÁM SÁT (Monitoring & Observability)

### 7.1. Kiến trúc giám sát

```
┌─────────────────────────────────────────────────────────┐
│                Amazon CloudWatch                         │
│                                                          │
│  ┌─────────────────┐  ┌──────────────────┐              │
│  │ CloudWatch       │  │ CloudWatch       │              │
│  │ Metrics          │  │ Logs             │              │
│  │ - CPU/Memory     │  │ - Backend API    │              │
│  │ - Job Duration   │  │ - Transcoder     │              │
│  │ - SQS Queue      │  │ - Error Traces   │              │
│  │   Depth          │  │   (JSON format)  │              │
│  └────────┬─────────┘  └──────────────────┘              │
│           │                                              │
│  ┌────────▼─────────────────────────────────┐            │
│  │ CloudWatch Alarms                         │            │
│  │ - SQS DLQ messages > 0 → ALERT           │            │
│  │ - Transcoding Error Rate > 5% → ALERT    │            │
│  │ - API Latency p95 > 3s → WARNING         │            │
│  └────────┬──────────────────────────────────┘            │
│           │                                              │
│  ┌────────▼────────┐                                     │
│  │ Amazon SNS       │                                     │
│  │ → Email Alert    │                                     │
│  │ → Telegram Bot   │                                     │
│  └──────────────────┘                                     │
└─────────────────────────────────────────────────────────┘
```

### 7.2. Metrics quan trọng cần theo dõi

| Metric | Nguồn | Mục đích |
|--------|-------|----------|
| **Upload Success Rate** | Backend API | Tỷ lệ upload thành công vs thất bại |
| **SQS Queue Depth** | Amazon SQS | Số lượng video đang chờ transcoding (phát hiện tắc nghẽn) |
| **SQS DLQ Messages** | Amazon SQS DLQ | Số message lỗi sau retry (= số video transcode thất bại) |
| **Transcoding Duration** | Fargate Container | Thời gian xử lý trung bình mỗi video (phát hiện performance regression) |
| **Transcoding Error Rate** | Fargate Container | Tỷ lệ job lỗi / tổng job (mục tiêu < 1%) |
| **API Response Latency p95** | Backend API | 95% request xử lý trong bao lâu (mục tiêu < 500ms) |
| **CloudFront Cache Hit Ratio** | CloudFront | Tỷ lệ request được serve từ cache (mục tiêu > 95%) |
| **S3 Storage Used** | Amazon S3 | Dung lượng lưu trữ để dự báo chi phí |

### 7.3. Structured Logging

Tất cả log từ Backend và Transcoder Container được ghi theo format JSON chuẩn:
```json
{
  "timestamp": "2026-07-21T12:30:00Z",
  "level": "INFO",
  "service": "transcoder",
  "videoId": "abc123",
  "action": "transcode_complete",
  "duration_seconds": 45,
  "renditions": ["360p", "720p", "1080p"],
  "output_size_mb": 125.4
}
```

---

## 8. GIẢI THÍCH THUẬT NGỮ KỸ THUẬT

### Video Streaming
| Thuật ngữ | Giải thích |
|-----------|------------|
| **HLS** | HTTP Live Streaming — Giao thức phát video do Apple phát triển, chuẩn công nghiệp (YouTube, Netflix, Twitch). Chia video thành segment `.ts` (2-10 giây), phát từng đoạn qua HTTP. |
| **ABR** | Adaptive Bitrate Streaming — Tự động chuyển chất lượng (360p/720p/1080p) theo tốc độ mạng người xem. |
| **Manifest (`.m3u8`)** | File "mục lục" cho trình phát video. Master Playlist liệt kê các chất lượng. Media Playlist liệt kê danh sách segment `.ts`. |
| **HLS.js** | Thư viện JavaScript phát video HLS trên mọi trình duyệt (Chrome, Firefox, Edge). Transmux `.ts` sang fMP4 qua MSE API. |
| **Transcoding** | Quá trình chuyển đổi video từ định dạng/codec/độ phân giải này sang định dạng khác. |
| **FFmpeg** | Công cụ mã nguồn mở mạnh nhất để xử lý video: transcode, cắt, ghép, tạo HLS segments, sinh thumbnail. |

### Cloud & Serverless
| Thuật ngữ | Giải thích |
|-----------|------------|
| **Pre-signed URL** | Đường link upload tạm thời (15 phút) cho phép Client upload trực tiếp lên S3 mà không cần đi qua Backend. |
| **AWS Batch on Fargate** | Dịch vụ Serverless: tự động tạo Container khi có job, tự tiêu hủy khi xong. Không cần duy trì máy chủ. |
| **Amazon CloudFront** | CDN toàn cầu (400+ Edge Location). Cache video `.ts` gần người xem, giảm độ trễ. |
| **Amazon SQS** | Message Queue: hàng đợi bộ đệm giữa upload và transcoding. Đảm bảo không rớt task dù upload ồ ạt. |
| **Amazon ECR** | Container Registry: kho lưu trữ Docker Image trên AWS. |
| **OAC** | Origin Access Control — S3 hoàn toàn Private, chỉ CloudFront truy cập được. |
| **Event-Driven** | Kiến trúc dựa trên sự kiện: S3 upload xong → phát event → SQS nhận → Batch xử lý. Không có polling liên tục. |

### DevOps & IaC
| Thuật ngữ | Giải thích |
|-----------|------------|
| **Docker** | "Đóng hộp" ứng dụng + môi trường vào Container. Ai nhận cũng chạy được y hệt. |
| **Multi-stage Build** | Kỹ thuật Docker: dùng 1 stage để build, 1 stage để chạy → Image nhỏ gọn hơn 5-10 lần. |
| **Terraform** | Viết code (`.tf`) để tạo tài nguyên Cloud tự động. Không cần click chuột trên AWS Console. |
| **CI/CD** | CI: Push code → tự động test. CD: Test pass → tự động build + deploy lên Production. |
| **GitHub Actions** | Dịch vụ CI/CD tích hợp sẵn trong GitHub. |

### DevSecOps & Bảo mật
| Thuật ngữ | Giải thích |
|-----------|------------|
| **DevSecOps** | Dev + Sec + Ops. Tích hợp bảo mật vào mọi giai đoạn phát triển phần mềm, không để cuối cùng mới kiểm tra. |
| **SAST** | Static Application Security Testing — Quét mã nguồn (code tĩnh) tìm lỗ hổng trước khi build. |
| **SCA** | Software Composition Analysis — Quét các thư viện mã nguồn mở tìm lỗ hổng CVE đã biết. |
| **SonarQube** | Nền tảng quét code quality + SAST. Phát hiện bug, lỗ hổng, Code Smell, đo Coverage. Bản Community miễn phí. |
| **Quality Gate** | Ngưỡng chất lượng tự động. VD: "Coverage < 80% hoặc có Critical Vulnerability → Block Deploy". |
| **Code Smell** | Code chạy được nhưng thiết kế tệ, khó bảo trì. SonarQube phát hiện và đề xuất sửa. |
| **Technical Debt** | "Nợ kỹ thuật" — Số giờ ước tính cần để sửa hết các vấn đề trong code. |
| **Trivy** | Công cụ quét lỗ hổng CVE trong Docker Image, dependencies, và cấu hình IaC. |
| **CVE** | Common Vulnerabilities and Exposures — Mã định danh quốc tế cho lỗ hổng bảo mật đã công bố. |
| **Gitleaks** | Quét Git history phát hiện API key, password, JWT secret bị commit nhầm. |
| **Shift-Left Security** | Triết lý "dịch chuyển bảo mật sang trái" — kiểm tra bảo mật sớm nhất có thể (lúc viết code). |

### Monitoring & Kiểm thử
| Thuật ngữ | Giải thích |
|-----------|------------|
| **CloudWatch** | Dịch vụ giám sát của AWS: thu thập metrics, logs, đặt alarms. |
| **Structured Logging** | Ghi log theo format JSON chuẩn để dễ tìm kiếm và phân tích tự động. |
| **k6** | Công cụ Load Testing viết script bằng JavaScript. Mô phỏng hàng trăm/nghìn user đồng thời. |
| **Throughput** | Số request hệ thống xử lý được mỗi giây (req/s). |
| **Latency p95** | 95% request được xử lý trong bao nhiêu mili-giây. |
| **Time-to-First-Frame** | Thời gian từ bấm Play đến khi khung hình đầu tiên hiển thị. |
| **FinOps** | Financial Operations — Phân tích và tối ưu chi phí vận hành Cloud. |

---

## 9. NHẬN DIỆN RỦI RO & CHIẾN LƯỢC GIẢM THIỂU (Senior Insights)

Để đảm bảo hệ thống vận hành hoàn hảo trên môi trường Production thực tế, dưới đây là phân tích các rủi ro kỹ thuật lớn nhất và chiến lược tối ưu hóa:

### 9.1. Bẫy SQS Visibility Timeout (Rủi ro xử lý trùng lặp)
- **Vấn đề:** Thời gian transcode video rất khó đoán (video 100MB mất 30 giây, video 5GB có thể mất 1 tiếng). Khi Fargate nhận task từ SQS, task đó sẽ bị "ẩn" (Invisible). Nếu cấu hình `Visibility Timeout` của SQS quá ngắn so với thời gian transcode thực tế, SQS sẽ tưởng Container đã chết → làm task "hiện" lại → Một Container khác sẽ nhặt lấy → 1 video bị transcode trùng lặp 2 lần (tốn gấp đôi tiền Cloud).
- **Chiến lược giải quyết (Heartbeat Pattern):** Đặt Visibility Timeout ngắn (5 phút). Trong code Node.js của Container, tạo vòng lặp `setInterval`: cứ mỗi 3 phút gọi API `ChangeMessageVisibility` để "xin gia hạn" thêm 5 phút. Nếu Container crash thật, vòng lặp dừng → 5 phút sau task tự nhả ra cho máy khác.

### 9.2. Rủi ro Cold Start & Tối ưu Docker Image
- **Vấn đề:** Mỗi lần AWS Batch khởi tạo Container mới, Fargate phải kéo Docker Image từ ECR. Image chứa FFmpeg + đầy đủ codec có thể nặng tới 1.5GB → Cold Start mất 40-60 giây.
- **Chiến lược giải quyết:**
  - **Multi-stage Build** bắt buộc: dùng base image `debian:bullseye-slim` hoặc `node:18-slim` (~70MB). Tránh `alpine` vì FFmpeg cần `glibc` (Alpine dùng `musl libc` → lỗi tương thích).
  - Cấu hình **AWS PrivateLink (VPC Endpoint)** nối thẳng mạng nội bộ VPC → ECR, tránh pull Image qua Internet công cộng → tốc độ pull tăng gấp 3-4 lần.

### 9.3. Chi phí CloudFront Egress (Rủi ro phình phí CDN)
- **Vấn đề:** Video streaming tiêu tốn băng thông rất lớn. Nếu có 1.000 người xem video 1080p (4Mbps) cùng lúc trong 10 phút, lượng data transfer qua CloudFront là khoảng 300GB — chi phí egress có thể lên đến $25/ngày chỉ cho 1 video.
- **Chiến lược giải quyết:**
  - Cấu hình **Cache Policy** trên CloudFront: cache `.ts` segments với TTL dài (24h) vì segments không bao giờ thay đổi sau khi transcode.
  - Thiết lập **S3 Lifecycle Policy**: tự động chuyển video gốc (Raw) sang S3 Glacier (storage rẻ hơn 90%) sau 30 ngày.

---

## 10. LỘ TRÌNH THỰC HIỆN (Timeline)

### Giai đoạn 1: Nền tảng cốt lõi (Tuần 1-2)
- [ ] Khởi tạo repository, cấu trúc thư mục Monorepo
- [ ] Setup Frontend (Vite + React.js + HLS.js)
- [ ] Setup Backend (Node.js + Express + MongoDB Atlas)
- [ ] Thiết kế Database Schema (Video, User)
- [ ] Bắt đầu viết Outline báo cáo song song

### Giai đoạn 2: Backend API & Frontend (Tuần 3-5)
- [ ] Xây dựng API: Auth (JWT), Video CRUD, Pre-signed URL
- [ ] Xây dựng Frontend: Upload Page (Progress Bar), Watch Page (HLS.js Player), Channel Page
- [ ] Tích hợp Frontend ↔ Backend ↔ S3

### Giai đoạn 3: Transcoder Container (Tuần 5-7)
- [ ] Viết FFmpeg Transcoding Script (360p/720p/1080p → HLS)
- [ ] Viết SQS Handler + Heartbeat Pattern
- [ ] Viết Dockerfile Multi-stage Build (debian-slim + FFmpeg + Node.js)
- [ ] Test transcoding trên local trước khi lên Cloud

### Giai đoạn 4: Terraform IaC & CI/CD (Tuần 7-10)
- [ ] Viết Terraform modules (S3, SQS, ECR, Batch, CloudFront, IAM, VPC)
- [ ] Xây dựng CI/CD Pipeline (GitHub Actions)
- [ ] Tích hợp SonarQube vào Pipeline (SAST + Quality Gate)
- [ ] Tích hợp Trivy vào Pipeline (Container & SCA Scanning)
- [ ] Tích hợp Gitleaks vào Pipeline (Secret Detection)
- [ ] Thiết lập CloudWatch Monitoring + Alarms + SNS

### Giai đoạn 5: Kiểm thử & Triển khai (Tuần 10-13)
- [ ] Mua domain `zelostech.site` + Cấu hình HTTPS + Deploy hosting thực tế
- [ ] Viết kịch bản Load Testing bằng k6 (50-100 video upload đồng thời)
- [ ] Đo QoE: Time-to-First-Frame, ABR switching
- [ ] Lập báo cáo FinOps: EC2 24/7 vs Serverless Batch/Fargate
- [ ] Xuất báo cáo SonarQube, Trivy, Gitleaks

### Giai đoạn 6: Báo cáo & Nộp bài (Tuần 13-16)
- [ ] Hoàn thiện báo cáo Dự án CNTT
- [ ] Vẽ Architecture Diagram, Sequence Diagram
- [ ] Rà soát chính tả, định dạng
- [ ] Nộp bản final

---

> 📌 **Tài liệu này được cập nhật lần cuối:** 21/07/2026
> 📌 **Liên hệ:** Đinh Quốc Cường (0869087561) | Võ Huỳnh Minh Đức (0383229267)
> 📌 **Email:** 523H0008@student.tdtu.edu.vn | 523H0014@student.tdtu.edu.vn

