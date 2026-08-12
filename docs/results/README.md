# Hướng dẫn thu thập số liệu thực nghiệm (Mục 12)

Thư mục này chứa kết quả đo thực tế của hệ thống. Các tệp JSON trong đây là **dữ liệu đo được**, không phải giá trị mục tiêu đặt trước, và là nguồn số liệu cho Chương 5.4 của báo cáo.

| Tệp kết quả | Sinh bởi | Nội dung |
|---|---|---|
| `transcode-timing.json` | `scripts/measure-transcode.js` | Thời gian chuyển mã end-to-end theo từng mốc dung lượng |
| `qoe-ttff.json` | `scripts/benchmark-qoe.js` | Time-to-First-Frame, thống kê trên nhiều lần đo |
| `k6-summary.json` | `scripts/k6-load-test.js` | Kết quả kiểm thử chịu tải 50–100 người dùng đồng thời |
| `node-load-test.json` | `scripts/node-load-test.js` | Kiểm thử chịu tải bằng Node.js thuần (không cần cài k6) |

## Chuẩn bị

Trước khi đo cần lấy JWT token của một tài khoản hợp lệ:

```bash
curl -X POST "$API_URL/auth/login" -H "Content-Type: application/json" -d '{"email":"...","password":"..."}'
```

Sau đó đặt biến môi trường (PowerShell):

```powershell
$env:API_URL="https://api.zelostech.site/api"; $env:JWT_TOKEN="ey..."
```

Cần chuẩn bị ba tệp video mẫu định dạng MP4/H.264 có dung lượng xấp xỉ **100 MB**, **500 MB** và **1 GB** đúng theo yêu cầu của Mục 12. Nếu chưa có, có thể tạo bằng FFmpeg:

```bash
ffmpeg -f lavfi -i testsrc=size=1920x1080:rate=30 -t 120 -c:v libx264 -b:v 7M samples/video-100mb.mp4
```

## Thứ tự thực hiện

Thứ tự dưới đây được sắp xếp có chủ đích: phép đo chuyển mã phải chạy trước để tạo ra video dùng cho phép đo TTFF, còn kiểm thử chịu tải đặt cuối cùng vì tốn kém nhất.

### Bước 1 — Đo thời gian chuyển mã

```bash
node scripts/measure-transcode.js samples/video-100mb.mp4 "100MB"
```

Chạy lần lượt cho cả ba tệp, thay nhãn tương ứng. Kết quả được ghi nối tiếp vào cùng một tệp `transcode-timing.json`, nên cần chạy đủ ba lần để có bảng so sánh hoàn chỉnh.

Nên lặp lại mỗi mốc ít nhất **ba lần**. Số liệu đo thực tế trên hệ thống này cho thấy độ trễ pipeline dao động khá mạnh giữa các lần chạy (ví dụ mốc 100MB: 346s / 540s / 541s — chênh tới 56% giữa lần nhanh nhất và chậm nhất), và **không nhất thiết giảm dần theo thứ tự chạy** như giả định cold-start thông thường. Nguyên nhân nhiều khả năng đến từ việc compute environment dùng `FARGATE_SPOT`: mỗi job đều phải xin cấp phát capacity Spot mới (không có pool "warm" sẵn), và thời gian cấp phát dao động theo tình trạng khả dụng của Spot capacity tại thời điểm đó chứ không giảm dần theo số lần gọi liên tiếp. Đây là dữ liệu thực nghiệm đáng đưa vào phân tích, vì nó minh chứng đúng đánh đổi giữa chi phí và độ ổn định độ trễ mà `FARGATE_SPOT` mang lại so với `FARGATE` on-demand.

### Bước 2 — Đo Time-to-First-Frame

Lấy `hlsUrl` của một video vừa chuyển mã xong rồi chạy:

```bash
node scripts/benchmark-qoe.js "https://cdn.zelostech.site/videos/<userId>/<videoId>/master.m3u8" 20
```

Kết quả có trường `cacheStatuses` cho biết bao nhiêu lần được phục vụ từ Edge Location (`Hit`) và bao nhiêu lần phải lấy từ origin (`Miss`). Đây là số liệu trực tiếp chứng minh hiệu quả của CDN, nên cần trình bày trong báo cáo.

### Bước 3 — Kiểm thử chịu tải

Nếu đã cài k6:

```bash
k6 run scripts/k6-load-test.js
```

Nếu chưa cài k6, dùng script Node.js tương đương:

```bash
node scripts/node-load-test.js 50 100
```

## Thông tin cần ghi lại kèm kết quả

Để kết quả có thể tái lập và có giá trị khoa học, báo cáo phải nêu rõ các thông số sau tại thời điểm đo:

- Vùng AWS (ví dụ `ap-southeast-1`) và vị trí địa lý của máy thực hiện phép đo.
- Cấu hình tài nguyên của AWS Batch Job Definition: số vCPU và dung lượng RAM.
- Loại compute environment đang dùng: `FARGATE` hay `FARGATE_SPOT`.
- Thông số kỹ thuật của video mẫu: độ phân giải, codec, bitrate, thời lượng.
- Băng thông đường truyền của máy thực hiện phép đo, vì yếu tố này ảnh hưởng trực tiếp tới thời gian tải lên S3.

Không nêu các thông số trên sẽ khiến kết quả mất giá trị đối chứng, bởi cùng một hệ thống có thể cho số liệu chênh lệch nhiều lần khi thay đổi cấu hình vCPU hoặc vị trí đo.
