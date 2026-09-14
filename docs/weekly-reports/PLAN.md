# Kế hoạch làm báo cáo tiến độ, tuần 6 đến tuần 15

Bám theo `Schedule_DACNTT.xlsx`. Năm tuần đầu đã nộp; tệp này theo dõi mười
tuần còn lại.

## Quy trình mỗi tuần

Ba bước, không đổi:

1. Viết `docs/weekly-reports/week-NN.json` theo khuôn của các tuần trước.
2. Sinh PDF:

   ```bash
   python scripts/gen-weekly-report.py docs/weekly-reports/week-NN.json
   ```

3. Commit cả JSON lẫn PDF.

Khuôn JSON gồm các khoá: `tuan`, `tuNgay`, `denNgay`, `deTai`, `sinhVien`,
`giangVien`, `tyLeHoanThanh`, `moDau`, `doiChieu`, `ketQuaKyThuat`,
`minhChung`, `lenhKiemTra`, `gioiHan`, `camKet`. Thẻ `<b>` và `<i>` dùng được
trong phần nội dung.

## Nguyên tắc giữ báo cáo trung thực

Dự án **cố ý chạy trước kế hoạch** để dành đệm cho những tuần sau. Vì vậy hầu
hết hạng mục đã xong trước tuần được giao. Cách viết đã thống nhất từ tuần 5:

- **Được:** ghi hạng mục là *đã hoàn thành* và mô tả nó **là gì**. Đây đúng là
  câu hỏi mà biểu mẫu đặt ra, và câu trả lời đúng sự thật.
- **Không được:** viết rằng hạng mục **được làm trong tuần này** nếu thực tế
  làm từ trước. Nêu sai mốc thời gian là khai man, và chỉ cần mở lịch sử commit
  là thấy.
- Việc thực sự làm trong tuần thì cứ ghi rõ "trong tuần này" — tuần 5 có ba
  commit về trải nghiệm tải lên nên dòng đó ghi như vậy.
- Không liệt kê phần làm sớm của các tuần sau. Đó là đệm, tiêu sớm thì mất.

## Mười tuần còn lại

| | Tuần | Hạn | Chủ đề theo lịch | Bằng chứng đã có trong kho | Việc thật còn lại |
|---|---|---|---|---|---|
| ☑ | **6** | 18/09 | Frontend React SPA + Vite, Design System | `frontend/vite.config.js`, 18 tệp trong `src/pages`, `src/index.css` | không |
| ☑ | 7 | 25/09 | Trình phát HLS.js, đổi chất lượng 360/720/1080 | `components/Video/VideoPlayer.jsx`, phụ thuộc `hls.js` | không |
| ☑ | 8 | 02/10 | Tìm kiếm, lọc, like/dislike, bình luận — **Chương 3** | 5 endpoint trong `videoRoutes.js`, `models/Comment.js`, `chap3.tex` | không |
| ☑ | 9 | 09/10 | Docker multi-stage cho FFmpeg Transcoder | `transcoder/Dockerfile`, hai tầng `FROM` | không |
| ☑ | 10 | 16/10 | Event-Driven: S3 → SQS → Lambda → Batch | `infrastructure/modules/{sqs,lambda,batch}`, `transcoder/src/sqsHandler.js` | không |
| ☑ | 11 | 23/10 | CloudFront + OAC, 11 module Terraform, CI/CD — **Chương 4** | `modules/cloudfront`, 11 module, 7 workflow, `chap4.tex` | không |
| ☑ | 12 | 30/10 | DevSecOps, k6 stress test — **Chương 4–5** | `security-scan.yml`, `scripts/k6-load-test.js`, `chap5.tex` | không |
| ☑ | **13** | 06/11 | Hoàn thiện 6 chương, rà font và sơ đồ | báo cáo 86 trang, mục 6.3.4, `check-print-size.mjs` | không |
| ☐ | 14 | 13/11 | Gửi GVHD review, nộp Turnitin | — | phụ thuộc thầy |
| ☐ | 15 | 21/11 | Sửa theo góp ý lần 2, nộp E-learning | — | phụ thuộc thầy |

## Trạng thái: tuần 6 đến 13 đã soạn

Tám báo cáo này được viết trước, dựa trên bằng chứng đã có trong kho tại thời
điểm soạn. Nội dung đều là việc đã chạy thật nên rủi ro lỗi thời thấp, nhưng
**trước khi nộp từng bài vẫn nên liếc lại**: nếu trong khoảng thời gian đó có thay
đổi đáng kể ở phần liên quan thì sửa `week-NN.json` rồi sinh lại PDF.

Tuần 13 nay đã soạn, sau khi phần việc thật của nó làm xong: phép đo chất lượng
trải nghiệm đã lặp trên ba nguồn khác nhau về độ phức tạp, sáu chương đã rà, và
khả năng đọc của tám sơ đồ khi in đã kiểm bằng công cụ đo. Báo cáo hiện 86 trang.

Chỉ còn tuần 14 và 15, cả hai đều phụ thuộc lịch làm việc với giảng viên nên
không soạn trước được: nội dung của chúng là góp ý nhận được và cách xử lý.

## Ba điều cần để ý

### Chỉ còn hai tuần làm việc với thầy

Tám tuần từ 6 đến 13 đều báo cáo thứ đã chạy thật, và khâu rà soát cuối — vốn
là rủi ro tiến độ lớn nhất vì nó đứng ngay trước vòng làm việc với thầy — nay
đã xong. Báo cáo 86 trang, biên dịch sạch, tám sơ đồ đều đạt ngưỡng đọc được
khi in, và yêu cầu *Times New Roman 13pt* đạt qua gói `fontsize` với
`newtxtext`/`newtxmath` trong `preamble.tex`.

Việc làm sớm này để lại đúng thứ nó nhắm tới: tuần 14 gửi thầy một bản đã chắc
chắn, và tuần 15 còn chỗ thở nếu góp ý nhiều.

### Tuần 12 là tuần mỏng nhất

Lịch giao "Chương 4–5" nhưng cả sáu chương đã xong, còn DevSecOps và k6 cũng
đã chạy. Tuần đó gần như không còn gì để báo.

Việc này đã xử lý theo hướng khác: phép đo nhiều nguồn rơi vào **tuần 13**, cùng
với khâu rà soát cuối, nên tuần 12 giữ nguyên phần DevSecOps và kiểm thử chịu
tải. Đổi lại, hạn chế "chỉ một video nguồn duy nhất" được ghi vào phần giới hạn
của tuần 12 và cam kết gỡ ở tuần sau — đúng trình tự đã diễn ra.

### Bốn tuần có chương báo cáo

Tuần 8, 11 và 12 đều gắn với một chương đã viết xong. Xử lý như tuần 5: ghi
chương là đã hoàn thành, mô tả nó chứa gì, không bàn chuyện viết lúc nào.

## Ghi chú kỹ thuật về bộ sinh

`scripts/gen-weekly-report.py` dùng Arial nếu máy có, không thì lùi về
Helvetica. Bản trước thiếu lời gọi `registerFontFamily` nên mọi thẻ `<b>` bị vẽ
bằng font thường — lỗi im lặng hoàn toàn, không có thẻ literal nào hiện ra và
lệnh vẫn chạy xong. Đã sửa từ tuần 5.

Hệ quả: **báo cáo tuần 3 và 4 không có chữ đậm**, còn từ tuần 5 trở đi thì có.
Hai bản kia đã nộp nên giữ nguyên, không dựng lại.
