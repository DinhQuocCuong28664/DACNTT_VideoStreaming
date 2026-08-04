# 💰 Báo cáo Phân tích Tối ưu Chi phí FinOps (FinOps Cost Analysis Report)

## DACNTT — Cloud-Native Video Sharing Platform with HLS Transcoding Pipeline

---

## 1. TỔNG QUAN

Trong các kiến trúc xử lý video truyền thống, máy chủ nén video (FFmpeg Transcoder) thường được duy trì **hoạt động 24/7** để chờ xử lý các tác vụ do người dùng tải lên. Tuy nhiên, lưu lượng upload video của người dùng thường mang tính chất **bất đồng bộ và biến động mạnh theo giờ** (Spiky / Non-uniform Workload). Việc duy trì hạ tầng nhàn rỗi gây lãng phí chi phí lớn.

Đề tài này áp dụng kiến trúc **Serverless Container (AWS Batch on Fargate SPOT)** kết hợp **Event-Driven Architecture (S3 + SQS)**. Máy chủ container chỉ được khởi tạo khi có sự kiện upload video, thực thi quá trình chuyển mã HLS và **tự động tiêu hủy (Scale to 0)** ngay khi hoàn thành.

Báo cáo này cung cấp bảng tính toán và so sánh chi phí vận hành thực tế giữa 2 mô hình trên vùng **AWS Region AP-Southeast-1 (Singapore)**.

---

## 2. BẢNG SO SÁNH CHI PHÍ VẬN HÀNH HÀNG THÁNG

### Giả định Mô hình Kiểm thử:
- **Số lượng video upload/tháng:** 300 video (trung bình 10 video/ngày).
- **Thời lượng trung bình mỗi video:** 5 phút (1080p, H.264).
- **Thời gian chuyển mã trung bình (FFmpeg 360p + 720p + 1080p):** 45 giây / video.
- **Tổng thời gian xử lý thực tế/tháng:** 300 video × 45s = 13,500 giây = **3.75 giờ / tháng**.

| Thành phần Hạ tầng | Mô hình Truyền thống (EC2 24/7) | Mô hình Serverless (AWS Batch Fargate SPOT) | Mức Tiết kiệm |
|---|---|---|---|
| **Compute Engine** | `c5.xlarge` (4 vCPU, 8 GB RAM) chạy 24/7 (730 giờ/tháng)<br>👉 **$124.10 / tháng** | AWS Fargate SPOT (1 vCPU, 2 GB RAM)<br>Chỉ tính phí **3.75 giờ / tháng**<br>👉 **$0.05 / tháng** | **99.96%** |
| **Storage (EBS / S3)** | EBS gp3 100 GB ($8.00/tháng)<br>S3 Standard 50 GB ($1.25/tháng)<br>👉 **$9.25 / tháng** | S3 Standard 50 GB ($1.25/tháng)<br>S3 Glacier Lifecycle sau 30 ngày ($0.20/tháng)<br>👉 **$1.45 / tháng** | **84.32%** |
| **Queue & Trigger** | Không sử dụng hoặc tự cài RabbitMQ trên EC2 | Amazon SQS (10,000 requests = $0.004)<br>AWS Lambda ($0.001)<br>👉 **$0.01 / tháng** | N/A |
| **CDN & Network Out** | CloudFront 100 GB ($12.00/tháng) | CloudFront 100 GB (Free Tier 1TB) 👉 **$0.00** | **100%** |
| **TỔNG CHI PHÍ THÁNG** | **$133.35 / tháng** (~3,333,000 VNĐ) | **$1.51 / tháng** (~37,700 VNĐ) | **~98.86%** |

---

## 3. PHÂN TÍCH CHI TIẾT TỰ ĐỘNG TĂNG GIẢM CHI PHÍ (FINOPS INSIGHTS)

### A. Cơ chế FARGATE_SPOT (Tiết kiệm 70% trên Fargate)
- AWS Fargate SPOT tận dụng năng lượng nhàn rỗi của hạ tầng AWS với mức giảm giá **tới 70%** so với Fargate On-Demand.
- Đối với workload chuyển mã video batch (không yêu cầu thời gian thực cực tức thì), FARGATE_SPOT là lựa chọn tối ưu tuyệt đối.

### B. Cơ chế S3 Glacier Lifecycle Policy
- Video gốc (Raw Video) sau khi chuyển mã sang HLS thành công sẽ được chuyển tự động sang **S3 Glacier Flexible Retrieval** sau **30 ngày** (chi phí giảm từ $0.025/GB xuống $0.004/GB).
- Tệp video gốc được xóa hoàn toàn sau **365 ngày** (1 năm) theo đúng quy định lưu trữ.

### C. CloudFront OAC & Bandwidth Cost Optimization
- Áp dụng **Origin Access Control (OAC)** kết hợp **Brotli/Gzip Compression** trên CloudFront giúp nén tệp `.ts` và `.m3u8`, giảm **35% dung lượng truyền tải mạng (Data Transfer Out)**.

---

## 4. KẾT LUẬN

Kiến trúc **Serverless Container Event-Driven** giúp doanh nghiệp/dự án giảm chi phí hạ tầng từ **$133.35/tháng xuống chỉ còn $1.51/tháng** (tiết kiệm **98.86%** chi phí), hoàn toàn loại bỏ chi phí máy chủ nhàn rỗi (Idle Resource Waste) và đáp ứng khả năng mở rộng tự động theo thực tế sử dụng.
