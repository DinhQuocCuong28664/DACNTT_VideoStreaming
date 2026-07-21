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

---

## 📋 MỤC LỤC

1. [Tổng quan dự án](#1-tổng-quan-dự-án)
2. [Mô tả đề tài chi tiết](#2-mô-tả-đề-tài-chi-tiết)
3. [Luồng nghiệp vụ thực tế (Business Flow)](#3-luồng-nghiệp-vụ-thực-tế-business-flow)
4. [Kiến trúc hệ thống (Architecture Diagram)](#4-kiến-trúc-hệ-thống-architecture-diagram)
5. [Công nghệ sử dụng (Tech Stack)](#5-công-nghệ-sử-dụng-tech-stack)
6. [Giải thích thuật ngữ kỹ thuật](#6-giải-thích-thuật-ngữ-kỹ-thuật)
7. [Nhận diện rủi ro & Chiến lược giảm thiểu](#7-nhận-diện-rủi-ro--chiến-lược-giảm-thiểu)

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
- **CI/CD Pipeline**: Xây dựng bằng **GitHub Actions**: Tự động chạy lint/test → Build Docker Image → Push lên ECR → Cập nhật AWS Batch Job Definition → Deploy Backend API.
- **Infrastructure as Code (IaC)**: Toàn bộ hạ tầng AWS (S3 Buckets, SQS Queue, Batch Compute Environment, Fargate, ECR, CloudFront Distribution, IAM Roles, DynamoDB/MongoDB) được quản lý tự động bằng **Terraform**. Một câu lệnh `terraform apply` dựng toàn bộ hệ thống.

**3. Công nghệ sử dụng:**
- **Frontend**: React.js, HLS.js (Adaptive Bitrate Video Player), Axios.
- **Backend API**: Node.js (Express), JWT Authentication, AWS SDK (S3 Pre-signed URL).
- **Video Processing**: FFmpeg (chạy trong Docker Container trên AWS Batch/Fargate).
- **Cloud Infrastructure**: Amazon S3 (Storage), Amazon SQS (Message Queue), AWS Batch on Fargate (Serverless Compute), Amazon ECR (Container Registry), Amazon CloudFront (CDN), Amazon SNS/SES (Notification).
- **Database**: MongoDB Atlas (Video Metadata, User data).
- **DevOps & IaC**: Docker, GitHub Actions (CI/CD), Terraform (Infrastructure as Code).

**4. Phương pháp đánh giá:**
- **Đánh giá trải nghiệm xem video (Quality of Experience):** Đo thời gian từ lúc bấm Play đến khi khung hình đầu tiên hiển thị (Time-to-First-Frame). Kiểm tra chuyển đổi chất lượng mượt mà khi thay đổi băng thông mạng (dùng DevTools throttle).
- **Đánh giá hiệu năng Transcoding Pipeline:** Đo thời gian xử lý end-to-end (từ lúc upload xong đến khi video sẵn sàng xem) cho các kích thước file khác nhau (100MB, 500MB, 1GB).
- **Kiểm thử chịu tải (Stress Test):** Dùng script tự động upload cùng lúc 50-100 video lên S3 để kiểm chứng khả năng scale tự động của AWS Batch và khả năng giữ lệnh chờ xử lý của SQS.
- **Phân tích chi phí (FinOps):** Lập bảng so sánh chi phí vận hành giữa kiến trúc EC2 chạy FFmpeg 24/7 so với kiến trúc Serverless Batch/Fargate chỉ tính tiền theo thời gian thực thi.

**5. Kết quả dự kiến:**
- Một **nền tảng chia sẻ video hoàn chỉnh** (sản phẩm đầu cuối): người dùng có thể đăng ký, upload video, xem video với nhiều chất lượng (Adaptive Bitrate HLS), và chia sẻ video — tương tự trải nghiệm YouTube.
- Hệ thống **Transcoding Pipeline tự động** trên Serverless Container: Video upload lên → tự động chuyển mã sang HLS (360p/720p/1080p) → phân phối qua CDN → sẵn sàng xem.
- Bộ mã nguồn **IaC (Terraform)** chuẩn hóa, dựng toàn bộ hạ tầng AWS chỉ bằng 1 câu lệnh.
- Đường ống **CI/CD** tự động hóa toàn diện từ commit code đến production.
- Báo cáo phân tích hiệu năng transcoding và tối ưu chi phí (FinOps Report).

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
| **GitHub Actions** | CI/CD Pipeline: tự động test, build, push, deploy |

---

## 6. GIẢI THÍCH THUẬT NGỮ KỸ THUẬT

### 6.1. HLS (HTTP Live Streaming)
Giao thức phát video trực tuyến được phát triển bởi Apple, hiện là chuẩn công nghiệp được dùng bởi YouTube, Netflix, Twitch. Thay vì tải toàn bộ file video về rồi mới phát (download), HLS chia video thành các đoạn nhỏ (segment `.ts`, mỗi đoạn 2-10 giây) và phát từng đoạn một qua giao thức HTTP thông thường. Trình phát chỉ cần tải trước 1-2 đoạn là đã có thể bắt đầu phát ngay.

### 6.2. Adaptive Bitrate Streaming (ABR)
"Trí thông minh" của HLS. Cùng một video nhưng được tạo ra ở nhiều mức chất lượng khác nhau (360p, 720p, 1080p). Trình phát video (HLS.js) liên tục đo tốc độ mạng hiện tại của người xem. Nếu mạng nhanh → tải segment chất lượng cao (1080p). Nếu mạng chậm → tự động chuyển sang chất lượng thấp (360p) ở segment tiếp theo để tránh giật (buffering). Người xem không cần làm gì — mọi thứ diễn ra tự động.

### 6.3. Manifest / Playlist (`.m3u8`)
File văn bản nhỏ (chỉ vài KB) đóng vai trò "Mục lục" cho trình phát video:
- **Master Playlist**: Liệt kê tất cả phiên bản chất lượng có sẵn (360p, 720p, 1080p) kèm thông tin băng thông tối thiểu cần thiết cho mỗi mức.
- **Media Playlist**: Liệt kê danh sách URL của từng segment `.ts` theo đúng thứ tự phát cho một mức chất lượng cụ thể.

### 6.4. HLS.js
Thư viện JavaScript mã nguồn mở cho phép phát video HLS trên mọi trình duyệt (Chrome, Firefox, Edge — những trình duyệt không hỗ trợ HLS sẵn). HLS.js tải file `.m3u8`, phân tích các chất lượng khả dụng, tải từng segment `.ts`, chuyển đổi (transmux) sang định dạng fMP4, và đẩy vào trình duyệt qua **Media Source Extensions (MSE)** API để phát video.

### 6.5. Pre-signed URL (Đường link upload có thời hạn)
Thay vì upload file qua Backend Server (gây tắc nghẽn), Backend tạo một đường link tạm thời (có hạn 15 phút) cho phép Client upload trực tiếp lên S3. Đường link này chứa chữ ký số (Signature) của AWS — đảm bảo chỉ người được cấp link mới có quyền upload, và link hết hạn sau thời gian quy định.

### 6.6. AWS Batch on Fargate (Serverless Container)
AWS Batch là dịch vụ quản lý hàng đợi xử lý hàng loạt (Batch Processing). Khi kết hợp với Fargate, nó trở thành Serverless: tự động khởi tạo Container khi có job cần xử lý, tự phân bổ CPU/RAM phù hợp, và tự tiêu hủy Container khi xong việc. Không cần duy trì máy chủ.

### 6.7. Amazon CloudFront (CDN)
Mạng phân phối nội dung (Content Delivery Network) toàn cầu của AWS. CloudFront cache các file `.ts` video segments tại hơn 400 Edge Location trên khắp thế giới. Khi người xem ở Việt Nam bấm Play, video được tải từ Edge Location tại Singapore (gần nhất) thay vì từ S3 tại US — giảm độ trễ từ 200ms xuống còn 20ms.

### 6.8. Infrastructure as Code (IaC - Terraform)
Quản lý cơ sở hạ tầng đám mây bằng code. Thay vì lên giao diện web AWS click chuột tạo từng cái S3, SQS, CloudFront... bạn viết file cấu hình Terraform (`.tf`), chạy `terraform apply` → toàn bộ kiến trúc được dựng lên chuẩn xác 100%. Có thể tái sử dụng, version control trên Git, và rollback khi có sự cố.

---

## 7. NHẬN DIỆN RỦI RO & CHIẾN LƯỢC GIẢM THIỂU (Senior Insights)

Để đảm bảo hệ thống vận hành hoàn hảo trên môi trường Production thực tế, dưới đây là phân tích các rủi ro kỹ thuật lớn nhất và chiến lược tối ưu hóa:

### 7.1. Bẫy SQS Visibility Timeout (Rủi ro xử lý trùng lặp)
- **Vấn đề:** Thời gian transcode video rất khó đoán (video 100MB mất 30 giây, video 5GB có thể mất 1 tiếng). Khi Fargate nhận task từ SQS, task đó sẽ bị "ẩn" (Invisible). Nếu cấu hình `Visibility Timeout` của SQS quá ngắn so với thời gian transcode thực tế, SQS sẽ tưởng Container đã chết → làm task "hiện" lại → Một Container khác sẽ nhặt lấy → 1 video bị transcode trùng lặp 2 lần (tốn gấp đôi tiền Cloud).
- **Chiến lược giải quyết (Heartbeat Pattern):** Đặt Visibility Timeout ngắn (5 phút). Trong code Node.js của Container, tạo vòng lặp `setInterval`: cứ mỗi 3 phút gọi API `ChangeMessageVisibility` để "xin gia hạn" thêm 5 phút. Nếu Container crash thật, vòng lặp dừng → 5 phút sau task tự nhả ra cho máy khác.

### 7.2. Rủi ro Cold Start & Tối ưu Docker Image
- **Vấn đề:** Mỗi lần AWS Batch khởi tạo Container mới, Fargate phải kéo Docker Image từ ECR. Image chứa FFmpeg + đầy đủ codec có thể nặng tới 1.5GB → Cold Start mất 40-60 giây.
- **Chiến lược giải quyết:**
  - **Multi-stage Build** bắt buộc: dùng base image `debian:bullseye-slim` hoặc `node:18-slim` (~70MB). Tránh `alpine` vì FFmpeg cần `glibc` (Alpine dùng `musl libc` → lỗi tương thích).
  - Cấu hình **AWS PrivateLink (VPC Endpoint)** nối thẳng mạng nội bộ VPC → ECR, tránh pull Image qua Internet công cộng → tốc độ pull tăng gấp 3-4 lần.

### 7.3. Chi phí CloudFront Egress (Rủi ro phình phí CDN)
- **Vấn đề:** Video streaming tiêu tốn băng thông rất lớn. Nếu có 1.000 người xem video 1080p (4Mbps) cùng lúc trong 10 phút, lượng data transfer qua CloudFront là khoảng 300GB — chi phí egress có thể lên đến $25/ngày chỉ cho 1 video.
- **Chiến lược giải quyết:**
  - Cấu hình **Cache Policy** trên CloudFront: cache `.ts` segments với TTL dài (24h) vì segments không bao giờ thay đổi sau khi transcode.
  - Thiết lập **S3 Lifecycle Policy**: tự động chuyển video gốc (Raw) sang S3 Glacier (storage rẻ hơn 90%) sau 30 ngày.
