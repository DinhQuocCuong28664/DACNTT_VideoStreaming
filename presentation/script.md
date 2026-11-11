# Kịch bản thuyết trình bảo vệ DACNTT — Zelos

Nguồn chung cho cả hai bản deck (A: Artifact Slides, B: skill pptx). Chữ trên slide bằng tiếng Anh, lời nói bằng
tiếng Việt. Mỗi số liệu ghi nguồn ở mục **Nguồn** của slide. Tổng thời lượng mục tiêu ≤ 900 s (15 phút).

Quy ước mỗi slide:
- **Người nói**, **Thời lượng**
- **Tiêu đề (EN)**, **Ý trên slide (EN)**: tối đa 4 dòng
- **Hình**: tệp trong `report/images/`, hoặc "—"
- **Lời nói (VI)**: viết ở khoảng 2,8 âm tiết mỗi giây, để còn chỗ ngắt nghỉ khi nói ở tốc độ thường (khoảng 3)
- **Nguồn**: tệp và dòng để đối chiếu

## Tiến độ thời lượng

| Đợt | Slide | Đức (s) | Cường (s) | Cộng dồn (s) |
|---|---|---|---|---|
| A | 1–4 | 160 | 0 | 160 |
| B | 5–9 | 0 | 250 | 410 |
| C | 10–11 | 190 (gồm demo) | 0 | 600 |
| D | 12–17 | 60 | 180 | 840 |

---

## Đợt A — Mở đầu và yêu cầu (Đức)

### Slide 1 — Title

- **Người nói:** Đức · **Thời lượng:** 15 s
- **Tiêu đề (EN):** Building a Video Sharing Platform with an Automated HLS Transcoding Pipeline on a Serverless
  Container and Event-Driven Architecture
- **Ý trên slide (EN):**
  - Dinh Quoc Cuong (523H0008) · Vo Huynh Minh Duc (523H0014)
  - Advisor: MSc. Mai Van Manh
  - Faculty of Information Technology, Ton Duc Thang University · 2026
  - Live at zelostech.site
- **Hình:** —
- **Lời nói (VI):** Kính chào thầy cô. Nhóm em gồm Cường và Đức, do thầy Mai Văn Mạnh hướng dẫn. Đề tài là nền
  tảng chia sẻ video có pipeline chuyển mã HLS tự động trên container serverless, đang chạy tại zelostech.site.
- **Nguồn:** `report/frontmatter/cover.tex` dòng 13–14 và 35.

### Slide 2 — The problem

- **Người nói:** Đức · **Thời lượng:** 50 s
- **Tiêu đề (EN):** Transcoding is a bursty workload
- **Ý trên slide (EN):**
  - Every upload must become HLS renditions a browser can adapt
  - Many cores while encoding, none while nobody uploads
  - An always-on server: idle most of the time, capped during bursts
  - 300 five-minute videos ≈ 138 vCPU-hours of work, 2.4% of an 8-vCPU server's month
- **Hình:** `07-compute-models.png` (Hình 2.1)
- **Lời nói (VI):** Một nền tảng video phải biến mọi tệp tải lên, bất kể định dạng hay độ phân giải, thành các luồng
  HLS ở nhiều mức chất lượng để trình duyệt tự chọn theo băng thông. Việc chuyển mã này rất tốn CPU nhưng lại đến
  theo từng đợt: lúc có upload thì cần nhiều nhân, lúc không ai upload thì không cần gì. Nếu giữ một máy chủ chạy
  suốt, ta trả tiền cho thời gian rảnh, và khi nhiều người upload cùng lúc thì máy đó vẫn là trần cứng. Ví dụ một
  tháng có ba trăm video năm phút chỉ cần khoảng 138 vCPU-giờ xử lý, tức máy tám vCPU chạy cả tháng chỉ bận khoảng
  2,4 phần trăm. Mâu thuẫn giữa chi phí khi rảnh và năng lực khi tải đột biến chính là động lực của đề tài.
- **Nguồn:** `report/chapters/chap1.tex` dòng 21; `report/chapters/chap2.tex` dòng 85–91.

### Slide 3 — Objectives and scope

- **Người nói:** Đức · **Thời lượng:** 45 s
- **Tiêu đề (EN):** Five objectives, clear limits
- **Ý trên slide (EN):**
  - A complete platform: accounts, upload, adaptive playback, channels, memberships
  - An event-driven pipeline: the file arriving in S3 starts everything
  - FFmpeg in Fargate containers that exist only while they work
  - Infrastructure as code, CI with security scans, measured on production
- **Ghi chú nhỏ dưới slide (EN):** Out of scope: DRM, live streaming, per-title ladders
- **Hình:** —
- **Lời nói (VI):** Đề tài có năm mục tiêu. Một là một nền tảng hoàn chỉnh: đăng ký, upload, xem với chất lượng
  thích ứng, kênh, đăng ký theo dõi và hội viên. Hai là pipeline hướng sự kiện, chỉ cần tệp nguồn xuất hiện trên S3
  là quá trình xử lý tự chạy. Ba là mọi job FFmpeg chạy trong container Fargate, chỉ tồn tại khi có việc, dùng Spot
  trước và On-Demand khi tràn. Bốn là toàn bộ hạ tầng viết bằng mã, mỗi thay đổi đều qua CI có quét bảo mật. Năm là
  đánh giá bằng số đo trên hệ thống production. Nhóm cũng chủ động không làm DRM, không làm phát trực tiếp, và không
  tối ưu thang bitrate theo từng video.
- **Nguồn:** `report/chapters/chap1.tex` dòng 33–48 (mục tiêu), 62–68 (phạm vi).

### Slide 4 — Users and measurable requirements

- **Người nói:** Đức · **Thời lượng:** 50 s
- **Tiêu đề (EN):** Who it serves, and targets we can measure
- **Ý trên slide (EN):**
  - Visitors, registered users (viewer = creator), operators, auditors, administrators
  - 23 functional requirements, 10 non-functional requirements
- **Bảng trên slide (EN):**

  | NFR | Target |
  |---|---|
  | 01 Playback start | First frame ≤ 1 s at p95 once cached; start ≤ 3 s |
  | 02 Processing time | 10-min video ≤ 3 min; 4-hour video ≤ 1 h |
  | 03 Burst load | 100 simultaneous uploads lose no accepted work |
  | 04 Idle cost | No compute billed while nothing is processed |
  | 05 API latency | Warm median ≤ 300 ms; 80 concurrent without errors |

- **Hình:** — (bảng)
- **Lời nói (VI):** Nền tảng phục vụ khách chưa đăng nhập, người dùng đã đăng ký vừa xem vừa có thể làm người sáng
  tạo, và ba vai trò nhân viên tách biệt là người duyệt, người kiểm toán và quản trị viên. Từ nhu cầu đó, nhóm đặt
  hai mươi ba yêu cầu chức năng và mười yêu cầu phi chức năng. Điểm quan trọng là các yêu cầu phi chức năng đều có
  con số đo được: khung hình đầu dưới một giây khi đã cache, video mười phút sẵn sàng trong ba phút, video bốn giờ
  trong một giờ, một trăm upload cùng lúc không mất việc nào đã nhận, không tốn tiền khi rảnh, và API trả lời dưới
  ba trăm mili giây. Phần cuối bài sẽ đối chiếu từng con số này với kết quả đo.
- **Nguồn:** `report/chapters/chap3.tex` dòng 25–31 (stakeholder), 150–154 (NFR-01…05); Bảng 3.2–3.4 (FR-01…FR-23).

---

## Đợt B — Thiết kế (Cường)

### Slide 5 — Architecture

- **Người nói:** Cường · **Thời lượng:** 70 s
- **Tiêu đề (EN):** Four tiers along the path of a video
- **Ý trên slide (EN):**
  - API: Cloudflare Worker → one Lambda (Express), MongoDB Atlas + DynamoDB
  - Ingest: browser → S3 directly → SQS → Step Functions
  - Compute: AWS Batch on Fargate Spot, On-Demand overflow, zero when idle
  - Delivery: private bucket → CloudFront with signed policy
- **Hình:** `01-architecture-overview.png` (Hình 4.1)
- **Lời nói (VI):** Đây là kiến trúc đang chạy thật. Hệ thống chia thành bốn tầng theo đường đi của một video. Tầng
  API là một hàm Lambda chạy Express, đứng sau Cloudflare Worker; Worker gắn một header bí mật nên hàm từ chối mọi
  request đi vòng. Dữ liệu tài liệu nằm ở MongoDB Atlas, còn dữ liệu ghi liên tục như giới hạn tần suất và vị trí
  xem nằm ở DynamoDB. Tầng thứ hai nhận upload: trình duyệt gửi tệp thẳng lên S3, không qua API. Tệp tới S3 sinh sự
  kiện vào hàng đợi SQS, rồi khởi động một luồng Step Functions. Tầng thứ ba là tính toán: AWS Batch chạy container
  trên Fargate Spot, hết Spot thì tràn sang On-Demand, và cả hai về không khi hết việc. Tầng cuối là phân phối:
  segment nằm trong bucket riêng tư, chỉ CloudFront đọc được, và chỉ phục vụ request có chữ ký hợp lệ.
- **Nguồn:** `report/chapters/chap4.tex` dòng 29–61 (bốn tầng, 80 instance, pool 3, 500 kết nối).

### Slide 6 — Event-driven workflow

- **Người nói:** Cường · **Thời lượng:** 50 s
- **Tiêu đề (EN):** The workflow owns every video
- **Ý trên slide (EN):**
  - Execution named {videoId}-{uploadVersion}: a duplicate event starts nothing
  - Analyse and encode run in parallel; long videos take the chunked path
  - Retries for what can pass; exit code 3 for what cannot
  - Every failure ends in MarkFailed: error state, owner told, alert sent
- **Hình:** `21-state-machine.png` (Hình 4.2)
- **Lời nói (VI):** Sau khi khởi động, Step Functions làm chủ toàn bộ vòng đời video. Mỗi lần chạy được đặt tên theo
  mã video và phiên bản upload. SQS có thể giao một sự kiện hai lần, nhưng Step Functions từ chối tên trùng, nên cả
  pipeline idempotent mà không cần bảng ghi sự kiện. Nhánh phân tích và nhánh mã hoá chạy song song; video trên năm
  phút đi đường chia đoạn. Lỗi tạm thời như Spot bị thu hồi thì thử lại tối đa ba lần; lỗi không thể qua, như tệp
  hỏng, thì container thoát với mã ba để không thử lại vô ích. Lỗi nào còn lại cũng dẫn tới MarkFailed, và mỗi lần
  chạy có giới hạn hai mươi tư giờ.
- **Nguồn:** `chap4.tex` dòng 85–88 (tên execution, DLQ), 110 (năm phút), 118–125 (retry, exit 3, MarkFailed, 24 h).

### Slide 7 — Media design

- **Người nói:** Cường · **Thời lượng:** 45 s
- **Tiêu đề (EN):** One decode, six switchable renditions
- **Ý trên slide (EN):**
  - One FFmpeg process decodes once, feeds up to six x264 encoders
  - Key frame forced every 6 s on every rung: switch at any segment
  - Capped CRF: quality-targeted, peak bounded per rung
  - Ladder 144p–1080p, bounded by the source, never upscaled
- **Hình:** `23-ffmpeg-graph.png` (Hình 4.4). Biểu đồ ladder (Hình 4.5) không đặt lên slide để sơ đồ đủ lớn; hai
  con số của nó vẫn được nói ra.
- **Lời nói (VI):** Về phía media, một tiến trình FFmpeg đọc và giải mã nguồn đúng một lần, rồi chia mỗi khung cho
  tối đa sáu bộ mã hoá. Nếu chạy sáu tiến trình riêng thì phải giải mã sáu lần. Mọi rung bị ép keyframe ở cùng mốc
  sáu giây, nên trình phát đổi chất lượng ở bất kỳ ranh giới segment nào mà không giật. Mỗi rung dùng Capped CRF:
  CRF giữ chất lượng, còn maxrate chặn đỉnh để băng thông khai báo đáng tin. Biểu đồ cho thấy hiệu quả: với bản ghi
  thật, rung 1080p chỉ dùng khoảng ba phần tư mức trần; với test pattern dễ nén, chỉ một phần mười sáu. (Câu này
  trên deck bắt đầu bằng "Đo trên production" thay cho "Biểu đồ cho thấy hiệu quả".)
- **Nguồn:** `chap4.tex` dòng 239–242 (giải mã một lần), 255–257 (keyframe), 272 và 304–307 (Capped CRF, Hình 4.5).

### Slide 8 — Long videos: the chunked path

- **Người nói:** Cường · **Thời lượng:** 40 s
- **Tiêu đề (EN):** Long videos: cut, encode in parallel, check, join
- **Ý trên slide (EN):**
  - Chunks are whole 6-second GOPs: every rung cuts at the same frames
  - One Batch array job: a four-hour video = 48 chunks of five minutes
  - Audio encoded once; each chunk copies its window
  - Stitch refuses to publish what does not line up
- **Hình:** `25-chunked-path.png` (Hình 4.6)
- **Lời nói (VI):** Video dài được cắt thành nhiều đoạn, mỗi đoạn là một số nguyên GOP sáu giây, nên mọi rung vẫn cắt
  segment ở cùng khung hình. Các đoạn chạy song song trong một array job của Batch; video bốn giờ thành bốn mươi tám
  đoạn năm phút. Âm thanh được mã hoá một lần cho cả video, mỗi đoạn chỉ chép phần âm thanh của mình, để không hở
  hay lặp ở biên. Cuối cùng bước ghép kiểm từng đoạn: thiếu đoạn, lệch ranh giới hay sai quá ba khung thì không xuất
  bản. Người xem nhận một gói HLS bình thường.
- **Nguồn:** `chap4.tex` dòng 337–352 (kế hoạch chunk, nửa khung, kiểm tra stitch).

### Slide 9 — Protecting content

- **Người nói:** Cường · **Thời lượng:** 45 s
- **Tiêu đề (EN):** Two layers protect every segment
- **Ý trên slide (EN):**
  - Private bucket, readable only by CloudFront (Origin Access Control)
  - Signed policy for videos/{id}/*, valid two hours, cache still shared
  - AES-128 per upload version; key released only after an access check
  - Not DRM: an authorised viewer can still save the stream
- **Hình:** `17-playback-sequence.png` (Hình 4.7)
- **Lời nói (VI):** Đặt video ở chế độ riêng tư là vô nghĩa nếu ai biết địa chỉ segment cũng tải được. Vì vậy có hai
  lớp. Lớp một: bucket riêng tư, chỉ CloudFront đọc được, và CloudFront chỉ phục vụ request mang policy ký cho đúng
  video đó, hạn hai giờ. Policy không nằm trong cache key, nên mọi người xem vẫn dùng chung bản cache. Lớp hai: mọi
  segment mã hoá AES-128 bằng khoá mười sáu byte riêng cho từng phiên bản upload, và API chỉ trả khoá sau khi kiểm
  lại quyền xem. Nhóm nói rõ đây không phải DRM: người được xem vẫn có thể lưu lại.
- **Nguồn:** `chap4.tex` dòng 373–393 (khoá, policy hai giờ, cache key, không phải DRM).

---

## Đợt C — Kiểm duyệt và demo (Đức)

### Slide 10 — Moderation and staff roles

- **Người nói:** Đức · **Thời lượng:** 40 s
- **Tiêu đề (EN):** Screening before publishing, people who correct it
- **Ý trên slide (EN):**
  - Rekognition on sampled frames: remove, hold for review, or warn
  - Fails closed: if screening cannot run, the video is held
  - Operators decide, auditors read error rates, admins assign roles
  - Every decision logged against the machine verdict (Wilson 95% CI)
- **Hình:** `19-moderation-sequence.png` (Hình 4.13); có thể thay bằng `ui-console-accuracy.png` (Hình 6.5)
- **Lời nói (VI):** Mỗi video được kiểm duyệt trước khi xuất bản. Hệ thống lấy mẫu khung hình gửi sang Rekognition:
  vi phạm rõ thì gỡ, nghi ngờ thì giữ lại chờ người duyệt, bạo lực được phép thì hiện cảnh báo. Nếu không kiểm được
  thì giữ lại, không bao giờ tự xuất bản. Ba vai trò nhân viên tách nhau: người duyệt ra quyết định, người kiểm toán
  chỉ đọc tỉ lệ sai, quản trị viên gán vai trò. Mỗi quyết định được ghi cạnh kết luận của máy, nên đo được tỉ lệ sai
  kèm khoảng tin cậy.
- **Nguồn:** `chap4.tex` dòng 583–584 (console theo quyền), 665–674 (lấy mẫu, fail closed), 709–719 (audit,
  Wilson, tách vai trò).

### Slide 11 — Live demo

- **Người nói:** Đức thao tác và nói; Cường bổ sung ở bước 4 · **Thời lượng:** 150 s
- **Tiêu đề (EN):** Live demo — zelostech.site
- **Ý trên slide (EN):**
  - Upload → processing → adaptive playback
  - Search without diacritics · Creator studio · Staff console
  - Backup: recorded demo (same steps)
- **Hình:** — (chuyển sang trình duyệt)
- **Lời nói (VI):** theo từng bước dưới đây.

**Chuẩn bị trước buổi bảo vệ (không tính giờ):**
- Đăng nhập sẵn tài khoản demo trên trình duyệt của máy chiếu. Thông tin đăng nhập lấy từ
  `.local-notes/prod-demo-account.json`, không ghi lên slide. Phóng to trình duyệt 125% cho hội đồng dễ nhìn.
- Mở sẵn bốn tab: (1) trang Upload; (2) trang xem video "Hearth and Hamlet: xây làng đầu game" (đã READY, đủ sáu
  rung, theo `.local-notes/demo-videos.json`); (3) Studio; (4) Staff console, tab Accuracy (cần tài khoản có quyền
  `metrics:read`).
- Tệp để upload: `e2e/fixtures/clip36.mp4` (36 s, 640×360). Thời gian tới READY đo được: trung vị 111 s, chậm nhất
  112 s.
- Kiểm tra mạng của phòng; mở sẵn video dự phòng trên máy (đường dẫn đặt trên slide).

**Các bước (150 s):**

| Bước | Giây | Thao tác | Lời nói (VI) |
|---|---|---|---|
| 1 | 0–20 | Tab Upload: chọn `clip36.mp4`, nhập tiêu đề, bấm tải lên | Em tải lên một clip ba mươi sáu giây. Tệp đi thẳng từ trình duyệt lên S3; API chỉ cấp quyền tải lên. Từ đây pipeline tự chạy, trong lúc đó em cho thầy cô xem phía người xem. |
| 2 | 20–60 | Tab xem video: phát, mở menu chất lượng, chọn 1080p rồi Auto | Đây là video năm phút đã xử lý xong, có đủ sáu mức từ 144p tới 1080p. Chế độ Auto để hls.js tự chọn theo băng thông; chọn tay thì cố định một mức. |
| 3 | 60–80 | Ô tìm kiếm: gõ "xay lang" (không dấu) | Tìm kiếm không cần gõ dấu: "xay lang" vẫn ra "xây làng", vì chỉ mục bỏ dấu ở cả hai phía. |
| 4 | 80–120 | Tab Studio: video vừa tải lên, bước xử lý và phần trăm | (Cường) Video vừa tải đang ở bước xử lý; trạng thái này do Step Functions báo về qua sự kiện, container không chạm vào cơ sở dữ liệu. Khi xong, video chuyển READY. |
| 5 | 120–150 | Tab Staff console, Accuracy; nếu video đã READY thì quay lại Studio | Đây là bảng điều khiển của người kiểm toán: mỗi tỉ lệ đi kèm số quyết định, chưa đủ dữ liệu thì hệ thống nói là chưa đủ, không in ra một con số vô nghĩa. |

**Khi có sự cố:**
- Mạng chậm hoặc trang lỗi: dừng demo live, mở video dự phòng, nói "em xin phép dùng bản quay sẵn với đúng các
  bước này".
- Clip chưa READY ở bước 5: nói rằng thời gian tới READY trung vị là 111 s, rồi chuyển slide tiếp. Không chờ.
- Video demo bị giữ chờ duyệt (kiểm duyệt đang bật): đây cũng là hành vi đúng; giải thích ngắn rồi đi tiếp.

**Video dự phòng (bạn tự quay):** quay đủ 5 bước trên bằng OBS ở 1080p, cắt còn khoảng 150 s, lưu thành
`presentation/demo-backup.mp4` (không commit nếu có thông tin cá nhân trên màn hình).

- **Nguồn:** `report/chapters/chap6.tex` dòng 51–52 (tìm kiếm không dấu); Bảng 6.5 (clip 36 s: trung vị 111 s,
  khoảng 94–112 s); `.local-notes/demo-videos.json`; `report/chapters/chap4.tex` dòng 583–584 (console theo quyền).

---

## Đợt D — Kết quả và kết luận

### Slide 12 — Playback and transcoding time

- **Người nói:** Cường · **Thời lượng:** 55 s
- **Tiêu đề (EN):** Fast to start, fast to be ready
- **Ý trên slide (EN):**
  - Requests before the first frame: 435 ms at p95 once cached
  - Page to first frame, unthrottled: 2.27 s median, no stall
  - 10-minute 1080p video ready in 147 s; 26.7-minute in 287 s
  - ~30–60 s before encoding starts: the price of zero idle compute
- **Hình:** `27-chart-ttff-steps.png` (Hình 6.6) và `28-chart-transcode-size.png` (Hình 6.7)
- **Lời nói (VI):** Mọi số đo đều làm trên production. Về phía người xem, khi đã có cache, năm request trước khung
  đầu mất 435 mili giây ở phân vị 95, phần lớn là hai lời gọi API. Tính cả tải trang, khung đầu hiện sau 2,27 giây ở
  trung vị, không lần nào bị giật. Về chuyển mã, video mười phút sẵn sàng sau khoảng 147 giây, video gần hai mươi
  bảy phút sau 287 giây, nhờ đường chia đoạn. Mỗi lần chạy mất ba mươi tới gần sáu mươi giây trước khi bắt đầu mã
  hoá, đó là cái giá của việc không giữ máy nào chạy khi rảnh.
- **Nguồn:** `report/chapters/chap6.tex` dòng 134–136 (TTFF), 164 (2,27 s), 245–249 (độ trễ khởi động, đường chia
  đoạn); Bảng 6.5.

### Slide 13 — Four hours and one hundred uploads

- **Người nói:** Cường · **Thời lượng:** 55 s
- **Tiêu đề (EN):** Scales to long videos and to bursts
- **Ý trên slide (EN):**
  - Four-hour 1080p video ready 38.3 min after upload (target: 1 h)
  - 100 simultaneous uploads: 92 ready, none failed in processing
  - 8 refused at creation with a retryable 429: an API limit, not the pipeline
  - Queue absorbed the burst: last video ready after 638 s
- **Hình:** `29-chart-four-hour.png` (Hình 6.8) và `30-chart-burst.png` (Hình 6.9)
- **Lời nói (VI):** Với video bốn giờ, hệ thống chia thành bốn mươi tám đoạn và sẵn sàng sau 38,3 phút, trong mục
  tiêu một giờ. Biểu đồ cho thấy phần chặn là job âm thanh, chiếm gần mười một phút. Với một trăm upload cùng lúc,
  chín mươi hai video tới READY và không video nào hỏng khi xử lý. Tám upload bị từ chối ngay lúc tạo với mã 429,
  client có thể thử lại; giới hạn nằm ở API và cơ sở dữ liệu miễn phí, không ở pipeline. Hàng đợi hấp thụ đợt tải:
  video cuối cùng xong sau khoảng mười phút.
- **Nguồn:** `chap6.tex` dòng 258 (38,3 phút), 290 (92/100), 310 (331 s, 638 s); trường `follow_up` của
  `docs/results/runs/2026-11-04-v2-s3c-burst.json`.

### Slide 14 — Cost

- **Người nói:** Cường · **Thời lượng:** 40 s
- **Tiêu đề (EN):** Pay for work, not for waiting
- **Bảng trên slide (EN):**

  | 300 five-minute videos / month | Fargate, per use | EC2, always on |
  |---|---|---|
  | Compute (137.5 vCPU-hours of work) | 8.47 USD | 286.16 USD |
  | Screening (18,000 frames) | 23.40 USD | 23.40 USD |
  | **Total** | **31.87 USD** | **309.56 USD** |

- **Ý trên slide (EN):** Fargate priced at On-Demand: an upper bound, most tasks run on Spot
- **Hình:** — (bảng)
- **Lời nói (VI):** Với ba trăm video năm phút mỗi tháng, phần tính toán theo kiểu dùng bao nhiêu trả bấy nhiêu chỉ
  khoảng 8,5 đô, so với 286 đô cho một máy tám vCPU chạy suốt tháng, vì khối lượng việc chỉ lấp 2,4 phần trăm số giờ
  của máy đó. Cộng chi phí kiểm duyệt như nhau ở hai bên, tổng là 31,87 so với 309,56 đô. Con số Fargate tính theo
  giá On-Demand nên là cận trên; thực tế phần lớn task chạy Spot, rẻ hơn.
- **Nguồn:** `chap6.tex` dòng 371–378 (Bảng 6.7); `docs/results/runs/2026-11-04-v2-prices.json`.

### Slide 15 — Engineering quality

- **Người nói:** Cường · **Thời lượng:** 30 s
- **Tiêu đề (EN):** Reproducible and checked on every change
- **Ý trên slide (EN):**
  - 11 Terraform modules build staging and production on AWS and Cloudflare
  - Every push: lint, type check, 305 unit tests, 13 FFmpeg checks in the image
  - Security gate: Gitleaks, Trivy, eslint-plugin-security
  - 27 end-to-end tests pass against production
- **Hình:** `03-cicd-pipeline.png` (Hình 5.1)
- **Lời nói (VI):** Toàn bộ hạ tầng viết bằng mười một module Terraform, staging và production dựng từ cùng mã. Mỗi
  lần push đều chạy lint, kiểm kiểu, 305 unit test, mười ba kiểm tra FFmpeg ngay trong image, và cổng bảo mật quét
  bí mật và thư viện có lỗ hổng. Hai mươi bảy test end-to-end chạy trên production.
- **Nguồn:** `report/chapters/chap5.tex` dòng 136 (11 module), 207 và 303–305 (305/13/27), 344.

### Slide 16 — Conclusion

- **Người nói:** Đức · **Thời lượng:** 50 s
- **Tiêu đề (EN):** Every objective, and the evidence
- **Ý trên slide (EN):** năm thẻ đánh số 01–05 trùng với slide mục tiêu, mỗi thẻ một kết quả:
  - 01 Platform: uploads up to 20 GB, six quality levels, channels, memberships, staff console
  - 02 Event-driven: one named execution per upload; 92 of 100 in a burst ready
  - 03 Serverless: zero vCPUs when idle; a four-hour video in 38.3 min
  - 04 Reproducible: 11 Terraform modules; 305 + 13 + 27 tests pass
  - 05 Measured: 9 of 10 NFRs met; the tenth (start ≤ 3 s) at its median
  - Hai dải dưới: Limits (AES-128 is not DRM · free database tier · fixed ladder) và Next (VMAF ladder · audio
    in parallel · playback without MSE)
- **Bố cục chung cả deck (từ mẫu tham khảo):** dòng định vị chương, mục và hình của báo cáo dưới mỗi tiêu đề;
  nhãn đậm ở đầu mỗi ý; một họ phông (bản A: Montserrat, bản B: Calibri).
- **Hình:** —
- **Lời nói (VI):** Tóm lại, nhóm đạt cả năm mục tiêu; chín trên mười yêu cầu phi chức năng đạt, yêu cầu còn lại về
  thời gian khởi động đạt ở trung vị. Nhóm cũng nói rõ giới hạn: AES-128 không phải DRM, cơ sở dữ liệu gói miễn phí
  là điểm nghẽn khi tải đột biến, và thang bitrate cố định. Hướng tiếp theo là thang bitrate theo từng video đo bằng
  VMAF, mã hoá âm thanh song song để rút ngắn video dài, đường phát cho trình duyệt không có MSE, và hiệu chỉnh kiểm
  duyệt khi đã đủ quyết định của người duyệt.
- **Nguồn:** `report/chapters/chap7.tex` dòng 28 (Bảng 7.1), 61–80 (hạn chế), 97–112 (hướng phát triển).

### Slide 17 — Thank you

- **Người nói:** Đức · **Thời lượng:** 10 s
- **Tiêu đề (EN):** Thank you — Questions?
- **Ý trên slide (EN):** zelostech.site · github.com/DinhQuocCuong28664/DACNTT_VideoStreaming
- **Hình:** —
- **Lời nói (VI):** Phần trình bày của nhóm em đến đây là hết. Nhóm em xin cảm ơn và mong nhận câu hỏi của thầy cô.
- **Nguồn:** —

## Slide dự phòng cho hỏi đáp (không tính giờ)

Chỉ mở khi bị hỏi. Chữ trên slide bằng tiếng Anh; câu trả lời đầy đủ ở `.local-notes/defense-qa.md`.

| # | Tiêu đề (EN) | Nội dung trên slide (EN) | Câu hỏi liên quan | Nguồn |
|---|---|---|---|---|
| B1 | Three burst runs, three fixes | s3: 23/100 (20 reserved instances) → s3b: 48/100 (index creation on cold start, 502) → s3c: 92/100 (8 throttled at creation) | NFR-03 có bị viết cho khớp không | `s3-burst.json`, `s3b-burst.json`, `s3c-burst.json` |
| B2 | Twelve chunks at once | 6 on Spot + 6 overflow on On-Demand; 48 chunks of 236–476 s; planner sized for 6 Spot slots | Vì sao chunk bị giới hạn | execution `6aea92c79af78a13720d8c37-1` |
| B3 | Why one IV per upload version | Chunks number segments from 0; the stitched playlist renumbers them; an implicit IV would not decrypt | Bảo mật mã hoá | `transcoder/src/context.ts` dòng 29, 54 |
| B4 | Versus a managed encoder | MediaConvert ≈ 76–122 USD/month for 9,000 output minutes vs 8.47 USD Fargate compute | So sánh với MediaConvert | Price List API, 2026-11-09 |
| B5 | Real content, not only test patterns | Screen recording 1912×1080, 4 min 40 s: 5.50 vCPU-s per source second | Hằng số 5,5 đo trên gì | `docs/results/runs/2026-11-03-v2-real-recording.json` (execution `6aea3d0094989c6980c6c03c-1`) |
| B6 | Limits of screening | 1 frame / 5 s, max 120 (a 4-hour video: every 2 min); no audio screening; 60% / 90% thresholds | Kiểm duyệt video dài | `shared/src/moderation/policy.ts` |

### Cần kiểm lại (đợt A)

1. Slide 2: con số 138 vCPU-giờ dùng hệ số 5,5 vCPU-giây mỗi giây nguồn, chủ yếu đo trên test pattern (xem
   `.local-notes/defense-qa.md` câu 3). Nếu bị hỏi thì nói thêm điểm đo trên bản ghi thật: 5,50.
2. Slide 4: "viewer = creator" nghĩa là không có vai trò creator riêng (`chap3.tex`, đoạn sau Bảng 3.1). Bạn xem
   cách viết này có dễ hiểu không.
3. Thời lượng: đợt A là 160 s cho Đức. Bạn đọc to thử từng đoạn lời nói, dài quá thì báo để mình cắt.

### Cần kiểm lại (đợt B)

1. Slide 5: sơ đồ Hình 4.1 rất dày (5220×3600). Khi chiếu nên phóng to từng tầng, hoặc thêm một slide phụ chỉ có
   bốn tầng. Bạn chọn một trong hai.
2. Slide 6: "thử lại tối đa ba lần" là ba lần chạy của mỗi Batch job; Lambda task còn có retry riêng, sáu lần.
   Nếu hội đồng hỏi chi tiết thì nói thêm ý này.
3. Slide 7: "ba phần tư" là của bản ghi màn hình 1912×1080 (3562 trên 4500 kbit/s, khoảng 79%); "một phần mười
   sáu" là của test pattern (274 kbit/s).
4. Slide 8: video 4 giờ chạy 12 đoạn cùng lúc (6 Spot + 6 On-Demand). Lời nói không nhắc để giữ ngắn; nếu bị hỏi
   thì dùng slide dự phòng B2.
5. Slide 9: IV dùng chung cho cả phiên bản upload. Câu trả lời khi bị hỏi ở `.local-notes/defense-qa.md` câu 7.
6. Thời lượng: đợt B 250 s cho Cường; lời nói ngắn hơn quỹ giờ khoảng 15–20 s mỗi slide, phần đó để chỉ vào sơ đồ.

### Cần kiểm lại (đợt C)

1. Tài khoản demo có quyền xem tab Accuracy không. Nếu không, bước 5 dùng một tài khoản auditor hoặc admin đăng
   nhập ở một cửa sổ khác.
2. Video "Hearth and Hamlet" còn trên production và vẫn READY không; mở trước buổi bảo vệ một ngày để kiểm.
3. Demo upload thật trên production, kiểm duyệt đang bật. clip36 là cảnh thử, gần như chắc chắn được duyệt; muốn
   chắc thì thử một lần trước buổi bảo vệ.
4. Chia giờ: demo tính cho Đức (190 s cả đợt). Tổng sau đợt C: Đức 350 s, Cường 250 s. Đợt D phần lớn do Cường nói
   (kết quả, chi phí), nên hai bên sẽ cân lại.
5. Clip tải lên trong demo sẽ nằm lại trên production; sau buổi bảo vệ có thể xoá trong Studio.

### Cần kiểm lại (đợt D)

1. Slide 12: "30–60 s trước khi mã hoá" là cách nói tròn của 29–57 s trong `chap6.tex` dòng 245.
2. Slide 13: video 4 giờ là test pattern tổng hợp. Nếu bị hỏi nội dung video, nói thẳng và dẫn sang slide B5.
3. Slide 16: "9 of 10 NFRs met, the tenth at its median" lấy từ Bảng 7.1; NFR-01 đạt ở trung vị (2,27 s), hai
   trong năm lượt vượt 3 s (3,10 và 3,23 s).
4. Slide dự phòng B4: giá MediaConvert là ước lượng từ Price List API, chưa rõ tier nào hỗ trợ AES-128. Chỉ nói là
   ước lượng.
5. Tổng thời lượng: 840 s (14 phút), Đức 410 s, Cường 430 s, chênh 5%. Còn 60 s dự phòng trong 15 phút.
