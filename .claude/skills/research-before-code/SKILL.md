---
name: research-before-code
description: Nghiên cứu tài liệu khoa học/kỹ thuật (paper IEEE/ACM/Springer/arXiv, RFC, tài liệu chính thức AWS/framework, case study công nghiệp uy tín) TRƯỚC KHI implement bất kỳ feature mới hoặc fix bug/lỗi kỹ thuật không tầm thường nào trong dự án này. LUÔN dùng skill này khi người dùng yêu cầu thêm tính năng, sửa lỗi, implement, thiết kế lại một phần hệ thống, hoặc mô tả một vấn đề kỹ thuật cần giải quyết (race condition, caching, concurrency, security, performance, kiến trúc, message queue, v.v.) — kể cả khi họ không yêu cầu tường minh "hãy research trước". Áp dụng cho cả code backend/frontend/transcoder lẫn thay đổi hạ tầng Terraform. BỎ QUA skill này cho việc vặt (sửa lỗi chính tả, đổi tên biến, format code, cập nhật comment, thay đổi UI thuần thẩm mỹ) hoặc khi người dùng đã tự cung cấp đủ chi tiết kỹ thuật/nguồn tham khảo cụ thể rồi.
---

# Research Before Code

## Vì sao skill này tồn tại

Đây là đồ án tốt nghiệp — mọi quyết định kỹ thuật đáng kể lý tưởng nên có căn cứ kiểm chứng được, không chỉ là "làm theo cảm tính" hay copy tutorial. Trong phiên làm việc trước, cách làm này đã chứng minh giá trị thật, không phải lý thuyết suông:

- Trước khi thiết kế bảo vệ video riêng tư, research phát hiện ra sự khác biệt giữa Canned Policy và Custom Policy của CloudFront — nếu không tra cứu trước, bản triển khai đầu tiên đã sai (Canned Policy không hỗ trợ wildcard resource, sẽ hỏng với mọi video).
- Khi được yêu cầu tìm hiểu sâu về kiến trúc, việc tra lại lý thuyết lease/heartbeat (Chubby lock service, Burrows 2006) đã lộ ra một lỗi thật đang nằm trong code (`updateVideoReady` ghi đè vô điều kiện) — không phải suy đoán, mà là lỗi có thể tái hiện và đã được vá kèm test.
- Khi thử tăng tài nguyên container, việc tra bài báo về multi-threading (Amdahl's Law) giải thích chính xác vì sao tăng tốc quan sát được là 4.1× chứ không phải 4× tuyệt đối, thay vì chỉ ghi "có vẻ nhanh hơn".

Điểm chung: research không phải bước làm cho có, mà **thường thay đổi quyết định thiết kế** hoặc **phát hiện lỗi mà code review thuần tuý bỏ sót**. Bỏ qua bước này for feature/fix không tầm thường tức là đang đặt cược rằng phương án đầu tiên nghĩ ra là đúng — với một hệ thống production-adjacent, đó là cược không đáng.

## Khi nào dùng — và khi nào không

**Dùng khi:**
- Người dùng yêu cầu thêm tính năng mới (ví dụ: "thêm rate limiting", "thêm caching cho seat map", "làm thông báo real-time").
- Người dùng báo lỗi/bug kỹ thuật cần fix mà nguyên nhân gốc chưa rõ ràng (race condition, memory leak, inconsistent state, security vulnerability).
- Cần đưa ra quyết định kiến trúc (chọn giữa 2+ công nghệ/pattern, ví dụ SQS vs SNS, JWT vs session, REST vs GraphQL).
- Đang ở Plan Mode cho một thay đổi có ý nghĩa kỹ thuật thật.

**Bỏ qua khi:**
- Việc vặt: sửa lỗi chính tả, đổi tên biến, format code, cập nhật comment, chỉnh CSS thuần thẩm mỹ.
- Người dùng đã tự đưa đủ chi tiết kỹ thuật, đã dẫn nguồn cụ thể, hoặc đã nói rõ "không cần research, biết cách làm rồi".
- Câu hỏi thuần thông tin, không dẫn tới việc viết code (ví dụ "giải thích đoạn code này làm gì").
- Việc đã có tiền lệ rõ ràng trong chính codebase này (ví dụ thêm route CRUD mới theo đúng pattern route/controller/service đã có sẵn — không cần research lại REST convention mỗi lần).

Nếu phân vân, thiên về **làm nhẹ** thay vì bỏ qua hẳn: một lượt WebSearch nhanh (1-2 query) vẫn tốt hơn không có gì, không cần lúc nào cũng đào sâu như một literature review đầy đủ.

## Quy trình

### Bước 1 — Xác định 2-4 từ khoá kỹ thuật cốt lõi

Không search tên tính năng theo nghĩa đen (ví dụ đừng search "thêm nút yêu thích video") — search đúng **vấn đề kỹ thuật nằm bên dưới**. Vài ví dụ chuyển đổi:

| Yêu cầu người dùng | Từ khoá nên search |
|---|---|
| "Chống 2 job xử lý trùng 1 video" | distributed lock pattern, idempotent write, lease renewal |
| "Thêm cache cho danh sách video hot" | cache invalidation strategy, cache stampede, TTL jitter |
| "API bị gọi spam" | rate limiting algorithm, token bucket vs sliding window |
| "Video riêng tư vẫn xem được qua link cũ" | CDN signed cookie/URL revocation, bearer token expiry |
| "Muốn tăng tốc transcode" | parallel video encoding, multi-threaded x264 scalability |

### Bước 2 — WebSearch tìm nguồn có thể trích dẫn được

Ưu tiên theo thứ tự:
1. Bài báo khoa học bình duyệt (IEEE, ACM, Springer, MDPI, USENIX, NDSS, ICSE) — tra được DOI.
2. Tài liệu chuẩn/chính thức (RFC, AWS/GCP docs, tài liệu chính thức của framework/thư viện đang dùng).
3. arXiv preprint — dùng được nhưng gắn nhãn "chưa peer-review" khi tổng hợp.
4. Case study công nghiệp uy tín (kỹ thuật blog của Netflix/Google/AWS engineering, không phải blog cá nhân) — chỉ dùng làm bằng chứng thực tiễn, không thay được cho paper học thuật khi cần lập luận khoa học.

Chạy 2-4 lượt WebSearch với từ khoá đã xác định ở Bước 1. Nếu tìm được một nguồn có vẻ khớp nhưng thông tin mơ hồ (thiếu tên tác giả/DOI rõ ràng), **đừng đoán** — hoặc tìm sâu hơn để xác minh, hoặc ghi rõ "chưa xác minh đầy đủ" khi tổng hợp thay vì bịa chi tiết.

### Bước 3 — Tóm tắt dưới 200 từ

Trả lời đúng 3 câu hỏi, không lan man:
- Kỹ thuật/pattern nào phù hợp với đúng vấn đề đang gặp?
- Đánh đổi (trade-off) là gì — không có giải pháp nào miễn phí?
- Có case study/tiền lệ nào đã áp dụng cho vấn đề tương tự chưa?

Nói thẳng cho người dùng biết đã tìm được gì trước khi chuyển sang thiết kế/code — đừng giấu bước này trong quá trình suy nghĩ nội bộ rồi chỉ đưa ra kết luận cuối cùng, vì chính bước tóm tắt này là thứ giúp người dùng tin và kiểm chứng lại được quyết định.

### Bước 4 — Dùng kết quả để định hướng thiết kế

- Nếu đang ở Plan Mode: đưa tóm tắt research vào phần **Context** của plan (xem cách plan gần nhất trong dự án này làm — phần Context luôn giải thích *tại sao* trước khi liệt kê *làm gì*).
- Nếu không ở Plan Mode (fix nhỏ/trung bình, không cần plan chính thức): nói ngắn gọn 1-2 câu về hướng đã chọn và vì sao, rồi bắt tay code.
- Nếu research phát hiện phương án ban đầu định làm là sai/thiếu (như trường hợp Canned Policy ở trên) — **đổi hướng ngay**, đừng cố giữ ý tưởng cũ chỉ vì đã nghĩ ra trước.

### Bước 5 — Cân nhắc thêm vào `docs/LITERATURE_REVIEW.md`

File này đã tồn tại trong dự án, theo format phân loại nguồn 🟢 Tier 1 (peer-reviewed) / 🟡 Tier 2 (arXiv, chưa peer-review) / 🔴 Tier 3 (blog/vendor) — xem cấu trúc mục lục A-K hiện có trước khi thêm để biết nên chèn vào mục nào hoặc có cần tạo mục mới.

Chỉ đề xuất thêm khi **cả hai** điều kiện đúng:
1. Tìm được nguồn Tier 1 (hoặc Tier 2 chất lượng tốt) thực sự liên quan.
2. Thay đổi đang làm có ý nghĩa kỹ thuật thật — ảnh hưởng tới thiết kế/kiến trúc, không phải việc vặt.

Nếu cả hai đúng: hỏi người dùng có muốn thêm không (đừng tự ý sửa file tài liệu học thuật của họ mà không xác nhận), gợi ý rõ nên chèn vào mục nào và theo đúng format các mục đã có (tên tác giả/năm/venue/DOI, kết luận cốt lõi, "→ Ứng dụng" giải thích áp dụng cụ thể vào dự án ra sao).

## Ví dụ hoàn chỉnh

**Yêu cầu:** "Muốn thêm tính năng giới hạn mỗi user chỉ được upload tối đa 5 video/giờ."

**Áp dụng skill:**
1. Từ khoá: "rate limiting algorithm", "per-user quota enforcement", "sliding window vs token bucket".
2. WebSearch → tìm được so sánh thuật toán rate limiting (token bucket cho phép burst có kiểm soát, sliding window chính xác hơn nhưng tốn bộ nhớ hơn), đối chiếu với việc dự án đã có `express-rate-limit` (fixed window đơn giản) cho auth routes.
3. Tóm tắt: "Token bucket phù hợp hơn fixed window cho quota theo giờ vì cho phép người dùng dồn upload vào đầu giờ mà không bị chặn cứng ở ranh giới window (vốn là nhược điểm đã biết của fixed window — có thể bị lách bằng cách gửi request sát 2 đầu window để đạt gần gấp đôi giới hạn thực tế). Thư viện `express-rate-limit` đang dùng hỗ trợ cả 2 kiểu qua cấu hình store khác nhau."
4. Quyết định: dùng lại `express-rate-limit` (đã có sẵn, không thêm dependency mới) nhưng cấu hình theo `videoId`/`userId` thay vì theo IP, và chọn store hỗ trợ sliding window thay vì fixed window mặc định.
5. Không đề xuất thêm vào LITERATURE_REVIEW.md vì đây là lựa chọn cấu hình thư viện có sẵn, không phải quyết định kiến trúc mới.
