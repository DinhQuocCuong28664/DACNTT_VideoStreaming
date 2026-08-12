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
| **TỔNG CHI PHÍ (phần phụ thuộc kiến trúc)** | **$133.35 / tháng** (~3,333,000 VNĐ) | **$1.51 / tháng** (~37,700 VNĐ) | **~98.87%** |

### Thành phần chi phí không phụ thuộc kiến trúc

Chi phí phân phối nội dung qua Amazon CloudFront được tách riêng khỏi bảng so sánh trên vì đây là **thành phần trung lập với lựa chọn compute**: dù hệ thống chuyển mã bằng EC2 chạy liên tục hay bằng AWS Batch trên Fargate, lưu lượng mà người xem tải về qua CDN là như nhau. Việc tính $12.00/tháng cho mô hình EC2 nhưng $0.00 cho mô hình Serverless sẽ dẫn đến kết luận sai lệch, bởi khoản $0.00 này đến từ **AWS Free Tier (1 TB Data Transfer Out mỗi tháng)** chứ không phải từ ưu thế kiến trúc.

| Thành phần | Chi phí thực tế (cả hai mô hình) | Ghi chú |
|---|---|---|
| **CloudFront 100 GB/tháng** | **$0.00** trong phạm vi Free Tier<br>Khoảng **$8.50 – $12.00** khi vượt Free Tier | Áp dụng như nhau cho cả hai kiến trúc |

Nói cách khác, mức tiết kiệm **~98.87%** phản ánh đúng phần chi phí mà kiến trúc Serverless Container thực sự tác động tới — gồm Compute Engine và Storage. Nếu tính gộp cả CloudFront ở mức giá ngoài Free Tier ($12.00) vào cả hai vế, tổng chi phí sẽ là $145.35/tháng so với $13.51/tháng, tương ứng mức tiết kiệm **~90.7%**. Con số này thận trọng hơn và là con số nên được trích dẫn khi đánh giá tổng chi phí sở hữu hệ thống ở quy mô vượt Free Tier.

---

## 3. PHÂN TÍCH CHI TIẾT TỰ ĐỘNG TĂNG GIẢM CHI PHÍ (FINOPS INSIGHTS)

### A. Cơ chế FARGATE_SPOT (Tiết kiệm 70% trên Fargate)
- AWS Fargate SPOT tận dụng năng lượng nhàn rỗi của hạ tầng AWS với mức giảm giá **tới 70%** so với Fargate On-Demand.
- Đối với workload chuyển mã video batch (không yêu cầu thời gian thực cực tức thì), FARGATE_SPOT là lựa chọn tối ưu tuyệt đối.

### B. Cơ chế S3 Glacier Lifecycle Policy
- Video gốc (Raw Video) sau khi chuyển mã sang HLS thành công sẽ được chuyển tự động sang **S3 Glacier Flexible Retrieval** sau **30 ngày** (chi phí giảm từ $0.025/GB xuống $0.004/GB).
- Tệp video gốc được xóa hoàn toàn sau **365 ngày** (1 năm) theo đúng quy định lưu trữ.

### C. CloudFront OAC & Bandwidth Cost Optimization

Cần lưu ý rằng cơ chế nén tự động (Gzip/Brotli) của CloudFront **không áp dụng cho các tệp segment `.ts`**. CloudFront chỉ nén những đối tượng có `Content-Type` thuộc nhóm văn bản; `video/MP2T` không nằm trong danh sách này, và bản thân luồng video H.264 đã được nén sẵn nên việc nén lại gần như không mang lại lợi ích. Do đó, khoản tiết kiệm băng thông của hệ thống đến từ ba cơ chế thực chất sau:

- **Cache Hit Ratio tại Edge Location:** Các segment HLS là đối tượng bất biến (immutable) — một khi đã được sinh ra, nội dung không bao giờ thay đổi. Hệ thống đặt `Cache-Control: max-age=31536000` cho tệp `.ts`, nhờ đó phần lớn yêu cầu của người xem được phục vụ trực tiếp tại Edge mà không phát sinh chi phí Data Transfer Out từ Amazon S3 về CloudFront (Origin Fetch).
- **TTL ngắn cho Manifest:** Ngược lại, tệp `.m3u8` được đặt TTL ngắn để bảo đảm tính nhất quán khi danh sách rendition thay đổi. Đây là tệp văn bản dung lượng nhỏ và **là đối tượng duy nhất thực sự được hưởng lợi từ cơ chế nén** của CloudFront.
- **Origin Access Control (OAC):** Ngoài vai trò bảo mật, OAC bảo đảm mọi lượt truy xuất đều đi qua CloudFront, loại bỏ hoàn toàn chi phí truy xuất trực tiếp vào S3 vốn có đơn giá Data Transfer Out cao hơn.

---

## 4. KẾT LUẬN

Xét trên phần chi phí chịu tác động trực tiếp của lựa chọn kiến trúc (Compute Engine và Storage), mô hình **Serverless Container Event-Driven** giúp giảm chi phí hạ tầng từ **$133.35/tháng xuống còn $1.51/tháng**, tương ứng mức tiết kiệm **~98.87%**. Khi tính gộp cả chi phí phân phối nội dung qua CloudFront ở mức giá ngoài Free Tier vào cả hai vế so sánh, mức tiết kiệm là **~90.7%** — đây là con số thận trọng và phản ánh sát thực tế vận hành ở quy mô lớn hơn.

Nguồn gốc của khoản tiết kiệm này nằm ở việc loại bỏ hoàn toàn chi phí tài nguyên nhàn rỗi (Idle Resource Waste). Với giả định 300 video mỗi tháng, cụm máy chủ EC2 truyền thống phải được duy trì đủ 730 giờ nhưng chỉ thực sự thực thi tác vụ chuyển mã trong 3,75 giờ, tức **hiệu suất sử dụng tài nguyên chỉ đạt khoảng 0,5%**. Kiến trúc Serverless Container chuyển mô hình chi phí từ "trả theo thời gian cấp phát" sang "trả theo thời gian thực thi", đồng thời vẫn giữ được khả năng tự động mở rộng khi lượng video tải lên tăng đột biến.

Cần lưu ý rằng ưu thế chi phí này không phải là tuyệt đối trong mọi kịch bản. Khi khối lượng công việc đủ lớn và liên tục — chẳng hạn khi tổng thời gian chuyển mã vượt ngưỡng khoảng 60–70% thời gian hoạt động của máy chủ — chi phí Fargate tính theo giây sẽ tiệm cận rồi vượt chi phí thuê EC2 dài hạn (đặc biệt khi áp dụng Reserved Instance hoặc Savings Plan). Kiến trúc Serverless Container vì vậy phù hợp nhất với các workload có tính chất **bất đồng bộ và biến động mạnh (spiky)** đúng như đặc thù của bài toán chia sẻ video mà đề tài hướng tới.
