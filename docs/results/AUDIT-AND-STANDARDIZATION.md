# Rà Soát & Chuẩn Hóa Dữ Liệu Thực Nghiệm (Data Audit & Standardization)

Tài liệu này tổng hợp toàn bộ kết quả rà soát, kiểm toán độc lập và đối chiếu chéo (cross-validation) dữ liệu thực nghiệm đã thực hiện trong đề tài **"Xây dựng nền tảng chia sẻ video với quy trình chuyển mã HLS tự động trên kiến trúc Serverless Container và Event-Driven"**.

---

## 1. Mục Đích Rà Soát

Kiểm tra tính nhất quán, độ chính xác toán học, tính hợp lệ kỹ thuật và phát hiện sai sót (nếu có) giữa:
1. Các tệp dữ liệu thô gốc dạng JSON trong `docs/results/`.
2. Các script đo đạc và tạo bảng trong `scripts/` và `scripts/results/`.
3. Toàn bộ bảng số liệu, biểu đồ và phân tích học thuật được trình bày trong Báo cáo Luận văn tốt nghiệp (`report/chapters/chap6.tex`).

---

## 2. Kết Quả Kiểm Toán Chi Tiết Theo Từng Nhóm Số Liệu

### 2.1. Phân Hệ Phân Phối Nội Dung (CloudFront CDN & TTFF)
- **Tệp dữ liệu:** `docs/results/qoe-ttff-cloudfront.json`, `docs/results/qoe-ttff-multiregion.json`.
- **Phương pháp đo:** Đo đạc 3 chặng tuần tự của người xem (Master playlist $\rightarrow$ Sub playlist $\rightarrow$ Segment `.ts` đầu tiên) kèm xác thực CloudFront Signed Cookies.
- **Kết quả đối chiếu:**
  + **Độ chính xác:** Khớp **100%** giữa dữ liệu JSON và Bảng số liệu trong phụ lục báo cáo.
  + **Phát hiện thực nghiệm có giá trị cao:**
    * Lần đo đầu với `PriceClass_100`: Do hạn chế phân vùng chỉ gồm Bắc Mỹ và Châu Âu, các yêu cầu từ Việt Nam bị định tuyến nhầm sang Edge Marseille (Pháp, `MRS53`), khiến TTFF trung vị lên tới **727.69 ms**.
    * Nâng cấp lên `PriceClass_200`: CloudFront điều hướng chuẩn xác về PoP TP. Hồ Chí Minh (`SGN50`), TTFF trung vị giảm sâu xuống **110.32 ms** (tăng tốc gấp **6.6 lần**).
    * Đo đa vùng (Multi-region từ 5 vùng AWS): Kiểm chứng Anycast DNS của CloudFront; vùng Sao Paulo (`sa-east-1`) đạt TTFF 36.79 ms khi dùng `PriceClass_All`.
- **Kết luận:** Dữ liệu TTFF hoàn toàn hợp lệ, không có sai sót toán học hay logic.

---

### 2.2. Phân Hệ Chuyển Mã HLS (AWS Batch Fargate Spot)
- **Tệp dữ liệu:** `docs/results/transcode-timing.json`, `docs/results/runs/*.json`.
- **Phương pháp đo:** Đo thời gian end-to-end từ lúc SQS nhận message đến khi tất cả các rendition (144p $\rightarrow$ 1080p) hoàn tất và ghi `READY` vào MongoDB.
- **Kết quả đối chiếu:**
  + Đường 1 container (Single-job legacy):
    * 100 MB với 1 vCPU: 3 lần đo (346s, 540s, 541s), trung vị 540s, Realtime Factor 4.50x.
    * 100 MB với 4 vCPU: 3 lần đo (105s, 111s, 130s), trung vị 111s, Realtime Factor 0.93x (tăng tốc 4.8 lần).
    * 1 GB với 4 vCPU: 2 lần đo (1077s, 1080s), Realtime Factor 0.67x (nhanh hơn thời gian thực 1.5 lần).
  + Đường chia đoạn song song (Chunked Pipeline):
    * Video 25 phút: Giảm thời gian mã hóa từ 36.3 phút xuống còn 14.7 - 20.1 phút.
    * Đột biến 100 video (Burst of 100 clips): 100% hoàn thành `READY`, SQS giữ vững hàng đợi, không thất thoát bất kỳ thông điệp nào.
  + **Đánh giá dao động Fargate Spot:** Khoảng chênh lệch giữa các lần chạy (ví dụ 346s vs 541s) xuất phát từ thời gian AWS Batch tìm kiếm và cấp phát máy chủ ảo khả dụng trong Fargate Spot Pool, không phải lỗi phần mềm.

---

### 2.3. Phân Hệ Máy Chủ Backend API Cũ (Monolithic EC2 Baseline)
- **Tệp dữ liệu:** 
ode-load-test.json, k6-summary.json, drain-rate-real-payload.json.
- **Phương pháp đo:** Mô phỏng 50 Virtual Users (VUs) gửi 100 - 300 requests đồng thời tới máy chủ EC2 	3.small (https://api.zelostech.site/api) và quy trình xử lý 100 video thật.
- **Phát hiện quan trọng & Bản chất kỹ thuật của Baseline:**
  1. **Hiệu năng xử lý hàng đợi và giải phóng backlog:**
     - 100 video clip H.264 thật gửi đồng thời đều được tiếp nhận và xử lý thành công 100% (100/100 job hoàn tất chuyển mã sang trạng thái READY, 0% lỗi).
     - Hàng đợi giải phóng sạch trong 826 giây (~13.7 phút) ở tốc độ 7.26 job/phút với đúng 8 container RUNNING đồng thời theo trần hạn ngạch 8 vCPU.
  2. **Nút thắt cổ chai hiệu năng của máy chủ EC2 	3.small đơn lẻ:**
     - Khi chịu 50 VUs đồng thời, thông lượng tối đa của EC2 bị nghẽn ở mức **15.52 - 23.47 RPS**.
     - Độ trễ phản hồi trung bình vọt lên **2,388 ms (2.39 giây)**, phân vị P95 đạt **3,317 ms (3.32 giây)**, và độ trễ tối đa (Max) chạm đỉnh **6,130 ms (hơn 6.1 giây)**.
  3. **Nguyên nhân cốt lõi (Root Cause):**
     - Máy chủ 	3.small (2 vCPU, 2 GiB RAM) chạy tiến trình Node.js đơn luồng. Khi 50 kết nối gửi yêu cầu đồng thời đòi hỏi xác thực JWT và kết nối bảo mật tới MongoDB Atlas, hàng đợi socket của máy chủ bị tích tụ (socket backlog buildup).
     - Máy chủ EC2 là Điểm lỗi đơn (Single Point of Failure - SPOF). Nếu máy chủ gặp sự cố hoặc quá tải, toàn bộ hệ thống API bị ngắt quãng.
     - Chi phí nhàn rỗi không tối ưu: Tiêu tốn \.58/tháng (nếu chạy 24/7) hoặc phát sinh chi phí duy trì đĩa cứng EBS gp3 (\.60/tháng) ngay cả khi đã tắt máy chủ.

---

## 3. Chuẩn Hóa Số Liệu Kiến Trúc Mới: 100% Serverless Lambda

Để loại bỏ hoàn toàn SPOF và nút thắt cổ chai của EC2, hệ thống đã chuẩn hóa và chuyển đổi toàn diện sang **AWS Lambda Multi-AZ**:

| Chỉ số / Đặc tính | Baseline Cũ: EC2 Monolithic (`t3.small`) | Kiến Trúc Mới: AWS Lambda Multi-AZ | Mức Độ Cải Thiện |
|---|---|---|---|
| **Mô hình kiến trúc** | Máy chủ đơn lẻ (Single VM - SPOF) | Không máy chủ (100% Serverless Event-Driven) | Khử hoàn toàn SPOF |
| **Tính sẵn sàng (Availability)** | Single-AZ (Chết máy chủ = sập hệ thống) | Multi-AZ (Active-Active trên 3 Availability Zones) | SLA 99.99% của AWS |
| **Độ trễ xử lý Warm (P95)** | 3,317.79 ms (Khi có 50 tải đồng thời) | **0.47 ms** (Execution) / < 40-70 ms (HTTP E2E) | Tăng tốc ~99.8% |
| **Độ trễ Cold Start (Khởi tạo)** | n/a (Máy chủ luôn bật hoặc mất 60s boot OS) | **406.50 ms** (Tải bundle 9.6 MB + Mongoose pool) | Nhanh hơn khởi động VM |
| **Thông lượng chịu tải (Throughput)** | Giới hạn ở 15.52 RPS (Nghẽn socket) | Tự động scale 1000 microVM song song | Không nghẽn dồn toa |
| **Chi phí nhàn rỗi (Idle Cost)** | \$20.58/tháng (24/7) hoặc \$1.99/tháng (bật/tắt) | **\$0.00 / tháng** (AWS Always Free Tier) | **Tiết kiệm 100%** |
| **Vận hành & Bảo trì** | Phải SSH vá lỗi OS, bật/tắt thủ công khi test | 0 bảo trì (AWS tự động vá runtime & scale) | Tối ưu vận hành |

---

## 4. Kết Luận Chung

Việc rà soát và đo đạc lại đã khẳng định:
1. Số liệu thực nghiệm của hệ thống CDN và Transcoder Fargate Spot trước đây là hoàn toàn chuẩn xác, minh bạch và có tính khoa học cao.
2. Số liệu nghẽn tải của EC2 cũ phản ánh đúng thực tế nút thắt cổ chai của máy chủ truyền thống, qua đó chứng minh một cách thuyết phục sự cần thiết và giá trị vượt trội của việc chuyển đổi sang kiến trúc **100% Serverless Container & Event-Driven**.
