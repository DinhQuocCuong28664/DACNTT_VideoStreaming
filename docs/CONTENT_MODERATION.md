# Kiểm duyệt nội dung: chặn tự động, báo cáo và trang rà soát

> **Trạng thái (2026-09-25):** đã hoàn tất code, test và kiểm thử end-to-end cục bộ. Để chạy trên production còn cần `terraform apply` (quyền IAM + biến môi trường cho Batch job), build lại image transcoder, deploy backend/frontend, và cấp quyền admin cho tài khoản vận hành — xem Mục 7.

## 1. Vấn đề cần giải quyết

Trước thay đổi này, mọi video tải lên đi thẳng `PROCESSING → READY` và xuất hiện ngay trên trang chủ. Hệ thống không có bất kỳ lớp nào ngăn nội dung khiêu dâm, bạo lực hay gây sốc; không có vai trò quản trị viên; người xem cũng không có cách nào báo cho đội vận hành biết một video có vấn đề.

## 2. Kiến trúc ba lớp

| Lớp | Ai làm | Bắt được gì | Nằm ở đâu |
|---|---|---|---|
| 1. Sàng lọc tự động | Amazon Rekognition | Nội dung vi phạm rõ ràng, ngay lúc tải lên, trước khi công khai | `transcoder/src/moderation.js` |
| 2. Báo cáo của người xem | Cộng đồng | Những gì bộ lọc máy bỏ sót (nội dung giữa hai khung lấy mẫu, âm thanh, lừa đảo...) | Nút **Báo cáo** trên trang xem video |
| 3. Rà soát của con người | Đội vận hành | Quyết định cuối: giữ lại, gỡ, khôi phục khi có khiếu nại | Trang `/admin` |

Không lớp nào đủ một mình. Gorwa, Binns & Katzenbach (2020) chỉ ra rằng phân loại tự động thiếu minh bạch và sai theo những cách khó lường, nên không được là nơi quyết định duy nhất. Chính AWS cũng ghi rõ Rekognition "không phải bộ lọc toàn diện" cho nội dung vi phạm.

## 3. Sàng lọc tự động

### 3.1. Vì sao lấy mẫu khung hình thay vì dùng API video

Rekognition có hai cách kiểm duyệt video:

| | `StartContentModeration` (API video) | `DetectModerationLabels` trên khung hình (API ảnh) |
|---|---|---|
| Định dạng đầu vào | Chỉ H.264 trong MP4/MOV | Mọi thứ FFmpeg giải mã được |
| Kiểu gọi | Bất đồng bộ: cần SNS topic, IAM PassRole, chờ kết quả | Đồng bộ, gọn trong job Batch đang chạy |
| Giá | $0.10/phút | $0.001/ảnh |

Dự án cho phép tải lên MKV, WebM và AVI (`ALLOWED_VIDEO_MIME_TYPES`), nên API video sẽ hỏng với một phần video. Blog AWS Machine Learning so sánh hai cách trên 200 video và kết luận độ chính xác tương đương khi lấy mẫu cùng tần suất; API ảnh còn nhanh hơn với video dưới 90 giây và cho phép dừng sớm. Hệ thống vì vậy chọn **trích khung hình bằng FFmpeg có sẵn trong container, rồi gọi API ảnh**.

### 3.2. Lấy mẫu

- Mỗi 5 giây lấy một khung, tối đa 120 khung. Video dài hơn 10 phút thì khoảng cách tự giãn ra, nên chi phí tối đa là **$0.12/video**.
- Mỗi khung được lấy ở **giữa** khoảng của nó (2.5s, 7.5s, ...), để tránh giây 0 thường là màn hình đen.
- `-ss` đặt trước `-i` để FFmpeg nhảy thẳng tới keyframe gần nhất thay vì giải mã từ đầu video.
- Chạy song song 3 luồng, SDK dùng `retryMode: 'adaptive'` để tự giãn nhịp khi bị throttle.
- **Dừng sớm**: chỉ cần một khung đạt ngưỡng chặn là đủ căn cứ, không gọi thêm.

Đánh đổi đã biết: nội dung chỉ xuất hiện vài giây giữa hai mẫu có thể lọt qua. Lớp 2 và lớp 3 tồn tại để bù cho điểm này.

### 3.3. Chính sách theo nhãn

Rekognition trả về nhãn theo taxonomy 3 cấp (v7). Theo khuyến nghị của AWS, chính sách được đặt ở cấp L1/L2, còn L3 chỉ dùng để **loại trừ** những khái niệm không muốn kiểm duyệt.

| Nhãn | Hành động | Ghi chú |
|---|---|---|
| Explicit Nudity, Explicit Sexual Activity, Sex Toys | **Chặn** | |
| Graphic Violence (đánh nhau, máu me, tự hại...) | **Chặn** | Hạ xuống *rà soát* nếu khung hình là hoạt hình (game, phim hoạt hình) |
| Death and Emaciation | **Chặn** | Hạ xuống *rà soát* nếu là hoạt hình |
| Hate Symbols (Nazi, White Supremacy, Extremist) | **Chặn** | |
| Non-Explicit Nudity, Obstructed Intimate Parts | Rà soát | Trừ *Bare Back* và *Exposed Male Nipple* (người cởi trần) |
| Explosions and Blasts, Crashes | Rà soát | Pháo hoa, phim hành động, tin tức |
| Weapons, Swimwear, Alcohol, Drugs & Tobacco, Gambling, Rude Gestures | Bỏ qua | Súng xuất hiện chưa phải là bạo lực; dự án có danh mục Game |

**Ngưỡng:** ≥ 90% độ tin cậy trên một nhãn *chặn* thì **tự động gỡ**; ≥ 60% trên nhãn đáng chú ý thì **đưa vào hàng rà soát** (video bị ẩn cho tới khi có người duyệt). AWS ghi chú rằng dưới 50% sẽ có nhiều dương tính giả. Các ngưỡng đều chỉnh được qua biến môi trường.

### 3.4. Ghi kết quả

- Kết quả kiểm duyệt được ghi **trong cùng một lệnh ghi** với `status: READY` (`updateVideoReady`). Nếu tách làm hai lệnh, sẽ có một khoảng hở video đã hiện trên trang chủ trong khi nhãn "blocked" chưa kịp ghi.
- **Hỏng theo hướng an toàn (fail closed)**: nếu Rekognition lỗi (thiếu quyền IAM, throttle kéo dài) hoặc phân tích được dưới 80% số khung dự kiến, video sẽ vào hàng rà soát thay vì tự động công khai. Lỗi của lớp kiểm duyệt cũng không làm hỏng lần chuyển mã: video vẫn được chuyển mã đầy đủ.
- Video bị chặn **vẫn được chuyển mã** để quản trị viên xem lại được khi chủ video khiếu nại; chỉ là không ai khác phát được.
- Chủ video nhận email "video đã bị gỡ" hoặc "video đang được rà soát" thay cho email "video đã sẵn sàng". Email cố ý không nêu nhãn và độ tin cậy, để người vi phạm có chủ đích không dùng chúng chỉnh video cho lọt bộ lọc.

## 4. Trạng thái và quyền truy cập

`Video.moderation.status`:

| Giá trị | Ý nghĩa | Người xem | Chủ video | Quản trị viên |
|---|---|---|---|---|
| *(không có)* | Video tải lên trước khi có tính năng này | Xem bình thường | ✔ | ✔ |
| `approved` | Đã qua kiểm duyệt hoặc được quản trị viên giữ lại | Xem bình thường | ✔ | ✔ |
| `flagged` | Chờ rà soát | 403 `VIDEO_UNDER_REVIEW`, ẩn khỏi mọi danh sách | Xem và phát được, có banner báo | ✔ |
| `blocked` | Đã bị gỡ | 403 `VIDEO_REMOVED`, ẩn khỏi mọi danh sách | Mở được trang (để biết lý do) nhưng **không phát được** | Phát được để rà soát |

Bộ lọc ẩn được áp dụng ở mọi đường truy vấn: trang chủ, tìm kiếm, trang kênh của người khác, video liên quan, xem theo ID, cấp Signed Cookie (`getPlayableVideo`), đếm lượt xem, thích và bình luận. Video riêng tư bị gỡ vẫn trả 404 như cũ, không để lộ sự tồn tại qua một mã lỗi khác.

**Vì sao là 403 chứ không phải 410 Gone:** bản đầu tiên dùng 410. Khi kiểm thử end-to-end, Chrome đã cache response 410 (một mã được cache theo heuristic, RFC 9111 §4.2.2) và trả nó cho cả chủ video đăng nhập sau đó trên cùng trình duyệt. Trên production, điều này nghĩa là người xem từng gặp video bị gỡ sẽ vẫn thấy "đã bị gỡ" từ cache ngay cả khi quản trị viên đã khôi phục. Trạng thái "bị gỡ" đảo ngược được và khác nhau theo người xem, nên 403 kèm mã máy đọc được mới là lựa chọn đúng.

Chi tiết nhãn, độ tin cậy và số báo cáo **chỉ trả về cho quản trị viên** (API admin dùng `.lean()`); `Video.toJSON()` chỉ để lộ `status` và `note`.

## 5. Báo cáo của người xem

- `POST /api/videos/:id/report` với `{ reason, details? }`, yêu cầu đăng nhập, giới hạn 20 báo cáo/giờ/IP.
- 8 lý do theo nhóm của YouTube: khiêu dâm, bạo lực/gây sốc, thù ghét, quấy rối, nguy hiểm, xâm hại trẻ em, spam, khác. Crawford & Gillespie (2016) chỉ ra rằng nút báo cáo là một "từ vựng khiếu nại" do nền tảng định sẵn; danh sách càng dài và chồng lấn thì người báo cáo chọn càng tuỳ tiện.
- Mỗi người chỉ có **một báo cáo mở** cho mỗi video (chỉ mục duy nhất một phần `{video, reporter}` với `status: 'open'`). Bấm báo cáo nhiều lần không đẩy video lên đầu hàng rà soát.
- Không báo cáo được video của chính mình, hay video mình không có quyền xem (không dùng báo cáo để dò ID video riêng tư được).
- Báo cáo **không tự động ẩn video**, chỉ xếp video lên hàng rà soát theo số báo cáo. Tự ẩn theo số lượng báo cáo sẽ biến nút báo cáo thành công cụ để một nhóm người dùng hạ video mà họ không thích.

## 6. Trang rà soát `/admin`

- Ba ô số liệu: cần rà soát, báo cáo chưa xử lý, đã gỡ (trong đó gỡ tự động).
- Tab **Cần rà soát**: video bị hệ thống đánh dấu hoặc có báo cáo mở, video nhiều báo cáo nhất lên đầu. Tab **Đã gỡ**: để khôi phục khi có khiếu nại.
- Mỗi video hiển thị nguồn đánh dấu, số báo cáo theo lý do, nhãn Rekognition kèm độ tin cậy và mốc thời gian (để tua tới đúng đoạn), cảnh báo nếu kiểm duyệt tự động chưa trọn vẹn, và danh sách báo cáo khi mở ra.
- **Ảnh bìa mặc định được làm mờ và chuyển xám**, bấm mới hiện. Karunakaran & Ramakrishnan (HCOMP 2019) đo được rằng can thiệp đơn giản này giảm rõ tác động cảm xúc lên người kiểm duyệt mà không làm giảm chất lượng quyết định. Hàng rà soát, theo đúng định nghĩa, gom những hình ảnh dễ gây sốc nhất của cả nền tảng.
- Mỗi quyết định (Giữ lại / Gỡ video / Khôi phục) đi qua hộp thoại xác nhận có ô ghi chú. Chủ video đọc được ghi chú này trên trang xem video của họ. Báo cáo mở chuyển sang `dismissed` (khi giữ lại) hoặc `actioned` (khi gỡ).
- Quyền admin **không cấp được qua API nào**. Vai trò được đọc lại từ database ở mỗi request, nên thu hồi quyền có hiệu lực ngay lập tức.

API: `GET /api/admin/stats`, `GET /api/admin/videos?tab=review|blocked`, `GET /api/admin/videos/:id/reports`, `PATCH /api/admin/videos/:id/moderation` với `{ decision: 'approve'|'block', note? }`.

## 7. Triển khai

1. **Hạ tầng**: `terraform apply` ở `infrastructure/environments/dev` sẽ thêm policy `rekognition:DetectModerationLabels` cho transcoder task role và 5 biến `MODERATION_*` vào Batch Job Definition. Có thể đổi ngưỡng qua các biến `moderation_*` của module `batch`.
2. **Transcoder**: build lại image (thêm `@aws-sdk/client-rekognition`). Workflow `ci-transcoder.yml` tự làm bước này khi push.
3. **Backend + frontend**: deploy như bình thường. Không có biến môi trường backend mới.
4. **Cấp quyền admin** cho tài khoản vận hành (tài khoản phải đăng ký trước):
   ```bash
   node backend/scripts/set-role.js <email> admin
   node backend/scripts/set-role.js --list
   ```
5. Video cũ không có trường `moderation` và vẫn hiển thị như trước. Chúng chỉ vào hàng rà soát khi bị người xem báo cáo.

## 8. Chi phí

$0.001 mỗi khung hình (DetectModerationLabels thuộc nhóm Group 2 của Rekognition Image). Một video 3 phút tốn 36 khung ≈ **$0.036**; video từ 10 phút trở lên chạm trần 120 khung ≈ **$0.12**. Video bị chặn sớm tốn ít hơn nhờ dừng sớm.

## 9. Kiểm thử

- **Transcoder** (`tests/moderation.test.js`, `tests/dbHandler.test.js`): kế hoạch lấy mẫu; chính sách nhãn gồm loại trừ bằng L3, hạ mức cho hoạt hình, không hạ nội dung khiêu dâm hoạt hình; quyết định cho cả video; fail-closed khi Rekognition lỗi hoàn toàn hoặc thiếu khung; dừng sớm; ghi READY + kiểm duyệt trong một lệnh ghi.
- **Backend** (`tests/moderation.test.js`): video bị ẩn không lọt qua bất kỳ đường truy vấn nào; quyền của chủ video / quản trị viên / người xem; báo cáo (lý do sai, tự báo cáo, báo cáo trùng, video riêng tư); quyết định của quản trị viên; `requireAdmin`.
- **Rekognition thật** (ap-southeast-1, model 7.0): chạy `moderateVideo` trên video mẫu 3 phút với 6 khung → `approved` trong 1,3 giây.
- **End-to-end cục bộ** trên MongoDB in-memory: báo cáo video, màn hình "đã bị gỡ"/"đang rà soát", nhãn trên trang kênh, trang admin (làm mờ, xem báo cáo, gỡ, khôi phục), giao diện tiếng Việt/tiếng Anh, sáng/tối, mobile. Lượt kiểm thử này phát hiện hai lỗi đã được sửa: 410 bị trình duyệt cache (Mục 4), và focus không quay về nút đã mở sau khi đóng hộp thoại `<dialog>`.

## 10. Hạn chế và hướng phát triển

- **Âm thanh, tiêu đề và mô tả không được kiểm duyệt.** Lời nói thù ghét hay mô tả lừa đảo hiện chỉ bắt được qua báo cáo. Hướng mở rộng: Amazon Transcribe + Comprehend cho âm thanh, hoặc bộ lọc văn bản cho tiêu đề/mô tả.
- **Lấy mẫu thưa** có thể lọt các đoạn vi phạm ngắn (Mục 3.2).
- **Ảnh bìa `*/thumbnail.jpg` được miễn ký CloudFront** (để trang chủ tải nhanh), nên ai biết đường dẫn vẫn tải được ảnh bìa của video bị gỡ. Không API nào trả đường dẫn này cho người không có quyền, nhưng nếu cần chặn triệt để thì phải xoá hoặc đổi tên ảnh bìa khi gỡ video.
- **Signed Cookie đã cấp** (hiệu lực 2 giờ) vẫn dùng được tới khi hết hạn, nên người đang xem dở video vừa bị gỡ có thể xem tiếp tối đa 2 giờ.
- Quyết định của quản trị viên **chưa gửi email** cho chủ video (chủ video thấy ghi chú trên trang xem). Cũng chưa có cơ chế "gậy" (strike) hay khoá tài khoản vi phạm nhiều lần.

## 11. Tài liệu tham khảo

- Amazon Rekognition Developer Guide: *Moderating content*, *Using the image and video moderation APIs* (taxonomy v7, khuyến nghị MinConfidence), *Guidelines and quotas*. https://docs.aws.amazon.com/rekognition/latest/dg/moderation.html
- AWS Machine Learning Blog: *How to decide between Amazon Rekognition image and video API for video moderation*. https://aws.amazon.com/blogs/machine-learning/how-to-decide-between-amazon-rekognition-image-and-video-api-for-video-moderation/
- R. Gorwa, R. Binns, C. Katzenbach, "Algorithmic content moderation: Technical and political challenges in the automation of platform governance," *Big Data & Society*, 7(1), 2020. DOI: 10.1177/2053951719897945
- K. Crawford, T. Gillespie, "What is a flag for? Social media reporting tools and the vocabulary of complaint," *New Media & Society*, 18(3), 2016. DOI: 10.1177/1461444814543163
- S. Karunakaran, R. Ramakrishnan, "Testing Stylistic Interventions to Reduce Emotional Impact of Content Moderation Workers," *Proc. AAAI HCOMP*, 7(1), 50–58, 2019.
- RFC 9110 (HTTP Semantics) §15.5.4, §15.5.11; RFC 9111 (HTTP Caching) §4.2.2.
