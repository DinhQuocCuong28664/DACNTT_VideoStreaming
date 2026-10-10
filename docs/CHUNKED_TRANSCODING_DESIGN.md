# Thiết kế: chuyển mã song song theo đoạn cho video dài

> Trạng thái: **đã duyệt và đã triển khai** (PR #8), đang thử trên staging; chưa bật ở production. Các điều chỉnh
> sau khi đo bằng ffmpeg thật nằm ở **mục 10 và ghi đè** những chỗ mâu thuẫn ở các mục 2-5 phía trên.
> Yêu cầu: xử lý được video **tối thiểu 4 giờ** (có thể dài hơn), tệp tới 20 GB.

## 1. Vấn đề

Một video hiện là **một** Batch job chạy **một** tiến trình ffmpeg tuần tự. Số đo thật trên Fargate
(`docs/results/transcode-timing.json`, thang cũ 3 mức):

| Cấu hình | Video đo | Thời gian chạy | Hệ số (giây chạy / giây video) |
|---|---|---|---|
| 1 vCPU | 10 phút | 2.281 s | 3,8 |
| 1 vCPU | 26,7 phút | 5.917 s | 3,7 |
| 4 vCPU | 26,7 phút | 1.077 s | 0,675 |

Timeout job là 7.200 s và hết timeout thì **không được thử lại**. Suy ra giới hạn của thiết kế hiện tại:
khoảng 32 phút video 1080p ở 1 vCPU, khoảng 2,9 giờ ở 4 vCPU. Video 4 giờ không chạy được, và video
48 giờ không chạy được ở bất kỳ cấu hình nào. Tăng vCPU chỉ đẩy giới hạn lên một chút (Amdahl) và
không tránh được rủi ro Fargate Spot bị thu hồi giữa một job nhiều giờ.

Hướng giải quyết trùng với mục B.2/B.3 và hạn chế J8 trong `docs/LITERATURE_REVIEW.md`: chia video thành
các đoạn, mã hoá song song bằng nhiều container, rồi ghép playlist. Thời gian khi đó gần như không
phụ thuộc độ dài video, và một đoạn bị thu hồi chỉ phải chạy lại đúng đoạn đó.

## 2. Kết quả thực nghiệm (cơ sở của thiết kế)

Tất cả đo cục bộ bằng ffmpeg 8.1 với đúng các cờ của transcoder (`-g 180 -keyint_min 180 -sc_threshold 0
-force_key_frames expr:gte(t,n_forced*6)`, HLS 6 giây). Nguồn là video 70 giây có âm thanh sin 440 Hz liên tục
để mọi khe hở hay chồng lấn đều lộ ra; chia thành 4 đoạn.

**E1. Ranh giới đoạn phải theo khung hình, không theo giây.** Nguồn 30 fps, đoạn 18 s: playlist ghép giống hệt
encode một lần (12 segment, cùng độ dài). Nguồn 29,97 fps: mỗi GOP 180 khung là 6,006 s, nên đoạn 18 s sinh thêm một
segment 0,033 s (13 thay vì 12). Chọn độ dài đoạn là bội của GOP (`18,018 s = 3 GOP`) thì ra đúng 12 segment đều 6,006 s.

**E2. Mọi đoạn phải dùng cùng một offset nền.** PTS đầu tiên của đầu ra HLS là `max(1,4667; offset + 1,4)`: đoạn 0
(offset 0) bị kéo lên 1,4667 s vì độ trễ B-frame, còn đoạn có offset ≥ 0,1 s thì đúng `offset + 1,4`. Kết quả là đoạn 0
bắt đầu muộn hơn các đoạn khác 66,7 ms và chồng lên đoạn 1. Đặt `-output_ts_offset = k × độ_dài_đoạn + 1` cho **mọi** đoạn
(kể cả đoạn 0): hình ghép liền mạch, dài đúng 70,000 s, không khe hở hay chồng lấn nào, ở cả 30 và 29,97 fps.

**E3. Không được mã hoá lại âm thanh theo từng đoạn.** Mỗi encoder AAC mới chèn một khung khởi động (priming) bị
suy giảm, và cuối mỗi đoạn dư ~42 ms. Giải mã chính playlist ghép theo mô hình trình duyệt (khung sau ghi đè khung
trước ở vùng chồng), phần dư của phép kiểm tra "sin thuần" tại ranh giới vọt lên **~65% biên độ tín hiệu** (khoảng
23 ms rớt âm); nối thẳng PCM thì còn ~2% nhưng vẫn lệch pha. Cả hai đều có thể nghe thấy.

**E4. Mã hoá âm thanh một lần, rồi mỗi đoạn chỉ sao chép (stream copy) dải khung của mình.** Mỗi ranh giới chỉ có đúng
**một khung AAC trùng lặp giống hệt** (chồng 23,2 ms = một khung, cùng mốc thời gian, cùng nội dung): thay một khung bằng
bản y hệt thì không đổi gì. Không có khung khởi động. Đúng ở cả 30 và 29,97 fps.
Chi phí lượt âm thanh (CPU máy cục bộ): 1 giờ âm thanh mất 23 s (48k) đến 52 s (192k), tức 69-156 lần thời gian thực;
Fargate Spot 1 vCPU chậm hơn khoảng 3 lần so với một nhân máy này (ước tính từ log production, chưa đo trực tiếp).

**E5. Đọc đúng dải qua HTTP range, không cần tải cả tệp.** Tệp 587 MiB: cắt đoạn 60 giây ở giữa chỉ đọc **~35 MiB (6%)**
trong 2-4 request, bất kể `moov` ở đầu hay cuối tệp; `ffprobe` qua HTTP đọc ~2,7 MiB. Vì vậy job chunk không tải nguồn
về đĩa, không cần nâng ổ đĩa tạm Fargate (mặc định 20 GiB), và hiệu năng đọc tỉ lệ với kích thước đoạn.

Các script đo nằm ở thư mục scratchpad của phiên làm việc, không đưa vào repo; kết quả được trích đủ ở trên.

## 3. Kiến trúc đề xuất

```
S3 raw ──ObjectCreated──▶ SQS ──▶ Lambda ──▶ Batch job "transcode-<id>"   (không đổi, đường vào duy nhất)
                                                │
                                      ffprobe qua HTTP (~3 MiB, không tải tệp)
                                                │
                       ┌── thời lượng ≤ 20 phút ┴── thời lượng > 20 phút ──┐
                       ▼                                                   ▼
        đường hiện tại (một job, không đổi)                    PLANNER: ghi kế hoạch, nộp job con, thoát
                                                                           │
                                         ┌─────────────────────────────────┴──────────────┐
                                         ▼                                                ▼
                                AUDIO jobs (2 job, song song)        (chờ AUDIO xong, vì chunk sao chép AAC)
                                         │                                                │
                                         └───────────────▶ CHUNK array job (N phần tử, N ≈ 48 cho 4 giờ)
                                                                           │ (tất cả thành công)
                                                                           ▼
                                                                  FINALIZER: ghép, đo, READY, email
```

**Nguyên tắc: không đổi gì ở đường vào.** Lambda vẫn nộp đúng một job như hiện nay. Chính job đó, sau khi đọc
thời lượng, quyết định đi đường cũ hay đường mới. Video ngắn (đa số) không đổi hành vi, không thêm rủi ro.

### 3.1 Planner (cùng image, chế độ `plan`)

- `ffprobe` qua presigned URL (do chính job ký bằng task role) để lấy thời lượng, fps dạng phân số, kích thước hiển thị,
  số luồng âm thanh, `start_time` từng luồng. Không tải tệp.
- Tính **độ dài đoạn = số GOP × (GOP khung / fps)** với số GOP mặc định 50 (~5 phút), bằng số học phân số để ranh giới rơi đúng
  vào khung hình (E1). Tính trước `-output_ts_offset` và `-start_number` của từng đoạn (E2).
- Chọn thang chất lượng bằng `planRenditions` như hiện nay (cả sáu mức: ngưỡng 20 phút của `FULL_LADDER_MAX_SECONDS`
  chỉ còn ý nghĩa cho đường một-job và không áp cho đường chunk).
- Ghi kế hoạch vào MongoDB (`video.processing`) và một tệp JSON trong `work/<videoId>/plan.json` của bucket processed
  (tiền tố `work/` không nằm dưới `videos/<id>/`, là phạm vi duy nhất mà cookie ký của CloudFront mở cho người xem; có lifecycle xoá sau 7 ngày).
- Nộp bằng `SubmitJob`: 2 job AUDIO, một array job CHUNK phụ thuộc AUDIO, một job FINALIZER phụ thuộc CHUNK
  (theo [tài liệu AWS Batch](https://docs.aws.amazon.com/batch/latest/userguide/array_jobs.html): job thường phụ thuộc
  array job chỉ chạy khi **tất cả** job con thành công). Rồi thoát thành công.

### 3.2 AUDIO (chế độ `audio`)

Mã hoá **một lần** toàn bộ âm thanh của nguồn qua HTTP, mỗi lần một bitrate, ghi `work/<id>/audio-<bitrate>.m4a` (E4).
Chỉ cần 2 bitrate cho video dài: **64k** cho các mức ≤ 480p và **128k** cho 720p/1080p (thay vì 5 mức hiện có), vì mỗi
bitrate là một lượt mã hoá riêng. Chạy song song nên thời gian bằng lượt chậm nhất. Nguồn không có âm thanh thì bỏ qua.
Chi phí ước tính cho video 4 giờ: ~3 phút (128k) trên CPU cục bộ, nhân khoảng 3 cho Fargate 1 vCPU.

### 3.3 CHUNK (chế độ `chunk`, đọc `AWS_BATCH_JOB_ARRAY_INDEX`)

Mỗi phần tử mã hoá đúng một đoạn của **mọi** mức chất lượng trong một tiến trình ffmpeg, như `buildFFmpegArgs` hiện nay:

- Hình: `-ss <bắt đầu> -t <độ dài> -i <presigned URL của nguồn>`, mọi cờ GOP giữ nguyên.
- Âm thanh: `-ss <bắt đầu> -t <độ dài> -i <audio-bitrate.m4a>` với `-c:a copy` (E4).
- `-output_ts_offset <k × độ dài + 1>` và `-start_number <k × số segment mỗi đoạn>` cho **mọi** đoạn (E2).
- Đầu ra: `videos/<id>/<mức>/segment_NNN.ts` (đánh số toàn cục, nên các đoạn không đè lên nhau) và playlist riêng của đoạn
  trong `work/<id>/chunks/<k>/<mức>.m3u8`.
- Đọc nguồn qua HTTP range (E5), nên **không cần ổ đĩa tạm lớn**.
- Idempotent: tệp đầu ra ghi đè cùng khoá, nên chạy lại một đoạn (Spot bị thu hồi) vô hại.

### 3.4 FINALIZER (chế độ `finalize`)

- Đọc playlist của từng đoạn, nối đúng thứ tự thành `playlist.m3u8` mỗi mức (chỉ nối các dòng `#EXTINF` và tên segment,
  đã kiểm chứng ở E1/E2), thêm `#EXT-X-ENDLIST`.
- Đo `BANDWIDTH` đỉnh và trung bình từ kích thước segment trên S3, thăm dò `CODECS` từ segment đầu (dùng lại
  `generateMasterPlaylist`, `probeRenditionCodecs`), ghi `master.m3u8`.
- Thumbnail và kiểm duyệt Rekognition lấy mẫu khung trên **toàn video** qua HTTP range (seek, không tải).
- Chuyển video sang `READY` bằng `updateVideoReady` (có sẵn, ghi có điều kiện), gửi email, dọn `work/<id>/`.

### 3.5 Trạng thái, lỗi và đối soát

- Heartbeat: mọi job con cập nhật `updatedAt` của video mỗi ~5 phút. Bộ đối soát đổi ngưỡng từ "6 giờ kể từ lần ghi đầu"
  sang "2 giờ không có heartbeat", nên pipeline chạy bao lâu cũng được miễn còn sống.
- Một đoạn thất bại hẳn (hết số lần thử) thì chính job đó gọi `updateVideoError`; job FINALIZER không chạy vì phụ thuộc thất bại.
  Spot thu hồi giữa chừng được Batch thử lại theo `retry_strategy` hiện có.
- Tiến độ hiển thị (số đoạn xong / tổng) có thể suy ra từ `work/<id>/chunks/*/done` mà không tốn thêm cơ chế.

## 4. Ước tính (chưa phải số đo; sẽ đo lại khi triển khai)

Video 4 giờ 1080p, hệ số 3,7-5,2 giây/giây ở 1 vCPU (3,7 đã đo; 5,2 là ước tính thang 6 mức, +40%):

| Thành phần | Công việc | Ghi chú |
|---|---|---|
| CHUNK | 48 đoạn × 18-26 phút | tổng ~15-21 vCPU-giờ |
| Song song 8 vCPU (quota hiện tại) | 6 lượt | **~1,9-2,6 giờ** |
| Song song 12 vCPU (đã xin) | 4 lượt | **~1,2-1,7 giờ** |
| Song song 32 vCPU | 2 lượt | **~37-52 phút** |
| AUDIO + FINALIZER | song song / vài phút | ~10-20 phút thêm |

So với một job: không chạy được (khoảng 15 giờ ở 1 vCPU, vượt timeout 2 giờ). Chi phí Fargate Spot tính theo vCPU-giây nên gần
như không đổi so với chạy tuần tự; cần tra bảng giá ap-southeast-1 hiện hành khi đánh giá FinOps (chưa kiểm chứng ở đây).

## 5. Thay đổi cần làm

| Phần | Thay đổi |
|---|---|
| Transcoder | chế độ `plan`/`audio`/`chunk`/`finalize` trong `index.js`; module `chunkPlan.js` (số học GOP/fps, offset, số segment) thuần để test; `buildChunkArgs`; `mergeChunkPlaylists` |
| Terraform | 3 job definition (audio, chunk, finalize; cùng image, khác command và tài nguyên), quyền `batch:SubmitJob` cho task role, lifecycle xoá `work/` sau 7 ngày, biến `max_vcpus` |
| Backend | `video.processing` (chế độ, tổng đoạn); heartbeat; ngưỡng đối soát mới; nâng `MAX_VIDEO_SIZE_GB` lên 20 khi sẵn sàng |
| Tài liệu / CI | cập nhật CHECKLIST; test mới trong `transcoder/tests` |

Không cần: đổi Lambda, nâng ổ đĩa tạm (E5), đổi frontend (master playlist vẫn là các variant có âm thanh nhúng), đổi CloudFront.

## 6. Kế hoạch kiểm chứng

1. **Thuần (không AWS):** test `chunkPlan` với fps 30, 29,97, 23,976, 25, 60; kiểm tra tổng độ dài đoạn = độ dài video,
   ranh giới là bội GOP, offset không trùng; test ghép playlist; test cờ ffmpeg của `buildChunkArgs`.
2. **Cục bộ với ffmpeg thật:** chạy plan → chunk → merge trên nguồn mẫu; so sánh playlist ghép với encode một lần; chạy lại phép đo E2/E4.
3. **Staging bằng video 4 giờ:** tạo nguồn bằng `ffmpeg -stream_loop ... -c copy` (tức thì, ~7 GB), tải lên bằng chính luồng multipart mới,
   đo thời gian thật, số lần Spot bị thu hồi, độ chính xác tổng thời lượng, và phát thử bằng hls.js ở ranh giới đoạn.
4. **Chặn hồi quy:** video ngắn vẫn đi đường cũ; cờ `CHUNKED_TRANSCODING` để tắt ngay nếu có sự cố.

## 7. Rủi ro và những điều chưa biết

- **Nguồn đặc biệt:** VFR, WebM/MKV không có chỉ mục seek (seek chậm hoặc kém chính xác), tệp có nhiều luồng âm thanh, `start_time`
  âm thanh khác hình. Cách xử lý: planner phát hiện (ffprobe) và lùi về đường một-job kèm cảnh báo; chỉ nhận chunk khi nguồn đủ điều kiện.
- **Một khung AAC trùng ở ranh giới (E4)** đo là vô hại với ffmpeg và theo mô hình MSE, nhưng **chưa nghe thử trên trình duyệt thật**;
  sẽ kiểm bằng hls.js ở bước 3 của kế hoạch kiểm chứng. Nếu có vấn đề, lùi về lựa chọn B của mục 8.
- **Quota Fargate** quyết định thời gian chờ, không quyết định tính đúng: 8 vCPU hiện có, đã xin 12.
- **Tải S3:** mỗi đoạn đọc ~6% nguồn (E5) nhưng lượt AUDIO đọc gần như toàn bộ tệp (âm thanh xen kẽ trong `mdat`); cùng region nên
  không tính phí truyền, chỉ tốn thời gian (~vài phút cho 20 GB).

## 8. Các lựa chọn khác đã cân nhắc

- **A. Một job 8-16 vCPU, timeout dài.** Nhanh nhất để làm, nhưng không tới được 48 giờ, Spot bị thu hồi là mất cả job, và tốn hơn
  mỗi video (Amdahl). Chỉ hợp lý nếu yêu cầu dừng ở ~4 giờ.
- **B. Âm thanh thành rendition riêng** (`EXT-X-MEDIA TYPE=AUDIO`): mã hoá âm thanh một lần thành playlist riêng, các variant chỉ có hình.
  Tránh hẳn chuyện khung trùng nhưng đổi cấu trúc master playlist và hành vi trình phát (hls.js nạp luồng âm thanh riêng). Dự phòng cho E4.
- **C. Step Functions** thay cho phụ thuộc Batch: linh hoạt hơn (retry theo đoạn, tiến độ), nhưng thêm một dịch vụ và quyền; phụ thuộc Batch
  đủ cho nhu cầu hiện tại.
- **D. Mã hoá lại âm thanh theo đoạn:** bị loại bởi E3.

## 9. Điều cần bạn duyệt

1. Hướng chung: planner trong chính job hiện tại, AUDIO một lần, CHUNK song song, FINALIZER (mục 3), thay vì A hoặc B.
2. Độ dài đoạn mặc định ~5 phút (50 GOP) và ngưỡng chuyển sang đường chunk ở 20 phút.
3. Hai bitrate âm thanh cho video dài (64k và 128k) thay vì năm mức.
4. Cho phép tạm lùi về đường một-job khi gặp nguồn đặc biệt (mục 7) thay vì từ chối.
5. Thứ tự làm: `chunkPlan` thuần + test → chế độ chunk cục bộ → Terraform + staging → bật cho production và nâng trần lên 20 GB.

## 10. Điều chỉnh sau khi triển khai và đo

Bản thiết kế ở trên dựa trên các phép đo E1-E5 với lệnh ffmpeg đơn giản. Khi chạy **mã thật** qua
`transcoder/scripts/verify-chunked.js` (kiểm lệnh ffmpeg) và `verify-pipeline.js` (chạy cả pipeline cục bộ với S3/Mongo/Batch giả)
trên 9 nguồn, một số điều khác dự kiến. Mục này ghi đè các mục trước.

### 10.1 Khác biệt về kiến trúc

| Thiết kế ban đầu | Đã làm | Lý do |
|---|---|---|
| 3 job definition (audio, chunk, finalize) | **Một** job definition, job con chỉ khác `command` qua `containerOverrides` | CI chỉ đăng ký lại một job definition mỗi lần có image mới; ba cái dễ lệch phiên bản |
| Tệp tạm ở `work/<id>/` của bucket **processed** | Ở bucket **raw** | CloudFront phục vụ cả bucket processed: âm thanh gốc của video riêng tư sẽ có URL công khai. Bucket raw riêng tư, và event S3 chỉ lọc `videos/` nên ghi vào `work/` không kích hoạt job |
| Reconciler đổi ngưỡng sang "2 giờ không nhịp tim" | **Giữ nguyên** 6 giờ | `updatedAt` vốn là mốc ghi gần nhất; job con ghi nhịp tim (`touchVideoProcessing`) nên pipeline chạy bao lâu cũng được miễn còn job con ghi |
| `-start_number` theo đoạn | Tên segment chứa số đoạn: `segment_c0042_000.ts`, đánh số lại từ 0 | Tên của các đoạn không bao giờ trùng nhau dù một đoạn ra nhiều hay ít segment hơn kế hoạch, nên không đoạn nào ghi đè nhầm đoạn khác |
| Retry theo `retry_strategy` của job definition | Job con tự khai `retryStrategy` 3 lần **vô điều kiện** | Job definition chỉ thử lại với `Host EC2*` / `Task failed to start*`, mẫu AWS chỉ nêu cho Spot trên EC2, không cho Fargate Spot |

### 10.2 Khác biệt về mã hoá (E1-E4 được tinh chỉnh)

- **E1 — GOP làm tròn LÊN, không dùng `-force_key_frames` theo giây.** Đường một-job (GOP làm tròn xuống + `force_key_frames`) ở
  29,97 fps sinh một segment ngắn 5,973 s sau mỗi ~5,5 segment, vì keyframe ép rơi vào khung `ceil(6k × fps)` lệch dần so với bội của GOP.
  Ở đoạn 50 GOP điều đó để lại một segment cụt cuối mỗi đoạn. Đường chia đoạn dùng `-g G -keyint_min G -sc_threshold 0` với
  `G = ceil(6 × fps)` (phân số chính xác, ví dụ 180 ở 30000/1001): GOP quy ra giây >= 6 nên mỗi GOP đúng một segment.
- **E2 — quy tắc pts duy nhất.** Mọi thứ ở vị trí T trong tệp nguồn có pts đầu ra = T + hằng số chung. ffmpeg (chế độ CFR) đưa khung
  đầu của mỗi đoạn về timestamp 0 nên nửa khung lùi ở `-ss` biến mất với **hình** nhưng còn với **tiếng** (tiếng được sao chép nguyên
  timestamp). Vì vậy: hình `-ss` lùi nửa khung (biên an toàn cho `-ss`), `-output_ts_offset = T_f + base` cho MỌI đoạn kể cả đoạn 0 (bù
  nửa khung ở đoạn 0 làm nó chồng 16,7 ms lên đoạn 1), tiếng `-ss` ĐÚNG bằng `T_f`. Đã đo: bù sai làm hình/tiếng lệch 16,7 ms.
- **E3 — cắt hình bằng bộ lọc `trim` theo pts, KHÔNG dùng `-frames:v`, và KHÔNG chuyển đổi CFR.** Ba lần sửa liên tiếp, mỗi lần do một phép đo:
  1. `-t` ở đầu vào cắt theo gói tin (dts); với nguồn có B-frame dts của khung kế tiếp đến sớm hơn pts nên khung đó lọt vào cửa sổ: đoạn ra
     9001 khung thay vì 9000, lặp ở mỗi ranh giới và cộng dồn ~1,6 s lệch giữa EXTINF và pts sau 48 đoạn. Số khung rò bằng độ sâu sắp xếp lại
     B-frame, không có cận trên.
  2. `-frames:v` giải quyết được trên ffmpeg 8.1 nhưng **trên ffmpeg 5.1 nó đóng mọi luồng của đầu ra ngay khi hình đủ khung**, cắt dở luồng
     tiếng sao chép: trên AWS thật mỗi đoạn mất 1,3 s tiếng ở cuối (4 khe hở ở video 25 phút), hình hoàn hảo. Cục bộ không thấy vì máy phát triển
     chạy 8.1 trong khi image production chạy 5.1 (xem 10.6).
  3. Chế độ CFR mặc định nhân đôi khung cuối khi kết thúc luồng trên 5.1 (đoạn ra 9001 khung dù đã trim đúng, chồng 33 ms ở ranh giới) và chọn tốc độ
     từ `r_frame_rate` chứ không phải `avg_frame_rate`: nguồn khai avg 29,991 / r 30 cho đoạn ngắn hơn kế hoạch 94 ms.

  Cách làm hiện tại: `trim=end=<cửa sổ hình>,setpts=PTS-STARTPTS,scale…` ở đầu chuỗi lọc (chỉ bỏ khung hình, không đụng tiếng; `setpts` đặt khung đầu
  về 0 thay vì trông chờ CFR làm việc đó) cùng `-fps_mode passthrough`. Số khung của đoạn do bộ lọc quyết định, không do phiên bản ffmpeg: 9000 khung mỗi
  đoạn trên cả 5.1.9 và 8.1.2. Đoạn cuối mở nên không cắt.
- **E4 — tiếng không còn khung AAC trùng.** Cửa sổ tiếng bắt đầu đúng tại khung đầu, độ dài là hiệu của hai mốc đã làm tròn micro-giây (hai cửa sổ
  liền nhau khớp tuyệt đối), và `-copypriorss 0` để ffmpeg 5.1 không sao chép gói AAC nằm vắt qua điểm bắt đầu (mặc định làm mỗi ranh giới có một gói trùng
  chồng 23,2 ms). Khi đó mỗi gói AAC thuộc đúng một đoạn: số mẫu giải mã **bằng đúng** mã hoá một lần (3.088.384 mẫu ở cả hai) và tín hiệu sin 440 Hz
  liền pha qua mọi ranh giới. Không còn khung trùng để lo ở mục 7, nên phương án B (âm thanh thành rendition riêng) không cần nữa. Đã kiểm trên Chrome
  thật bằng hls.js (mục 10.4).
- **Ngưỡng kiểm tra tính nhất quán tính theo số khung hình** (cảnh báo từ nửa khung, lỗi từ 3 khung), không theo giây: ngưỡng 50 ms cũ nhỏ hơn
  một khung ở 30 fps nên để lọt đúng lỗi 541 khung ở trên.

### 10.3 Điều kiện lùi về đường một-job

Planner không bao giờ ném lỗi ở giai đoạn quyết định; mọi trường hợp sau rơi xuống đường một-job như trước giờ: tắt cờ `CHUNKED_TRANSCODING`, không biết
thời lượng, video không vượt 20 phút, không đọc được nguồn qua HTTP, nguồn VFR (`avg_frame_rate` lệch `r_frame_rate` quá 1%), framerate ngoài 10-120,
hình và tiếng bắt đầu lệch nhau quá 0,25 s, chia ra chưa tới 2 đoạn.

### 10.4 Kết quả đo

**Cục bộ, ffmpeg 8.1** (so với một lần mã hoá liền; 29,97 / 30 / 25 / 23,976 fps, B-frame nặng, `start_time` hình 66 ms, không tiếng, video dọc, MKV):
số segment, độ dài từng segment (trừ cái cuối), tổng thời lượng và hình ở ranh giới khớp; nguồn nháy-bíp 130 s cho độ lệch hình-tiếng **trùng từng phần tử**
qua 10 ranh giới.

**Trên Chrome thật, hls.js** (đầu ra của `verify-pipeline.js`, nguồn nháy-bíp 130 s, 11 đoạn): nạp toàn bộ qua MSE, 0 lỗi; SourceBuffer **tiếng** `[0 – 130,032]` và
**hình** `[0,023 – 130,02]` đều là một dải liền (nếu ranh giới có khe hở, chồng lấn hay khung trùng thì dải sẽ vỡ hoặc hls.js báo lỗi); 30 lần tua sát
10 ranh giới (−0,25 s, +0,01 s, +0,4 s) đều giải mã được hình. Cùng kết quả với nguồn 720p 70 s có đủ 5 mức. Chạy ở chế độ nạp bộ đệm chứ không phát,
vì Chrome chặn `play()` của video không tiếng ở tab ẩn; thứ cần kiểm là timestamp liên tục như MSE nhìn thấy, và nó đo đúng điều đó. Qua HTTP Range cục bộ: `ffprobe` đọc 2,44 MiB trong 1 request cho tệp 587 MiB; job âm thanh đọc 100% tệp; job đoạn chỉ đọc phần của nó
(đoạn chiếm 24% video đọc 26% dung lượng); mọi cờ `-reconnect*`/`-rw_timeout` được ffmpeg chấp nhận.

**Trên Fargate Spot 1 vCPU (staging)**, 6 mức từ nguồn 1080p 4 Mbps: đoạn 5 phút mã hoá với **hệ số 4,47** giây chạy mỗi giây video (67,3 s video / 301 s),
khoảng 22 phút mỗi đoạn, trong khoảng 3,7-5,2 đã ước ở mục 4. Kết quả đo video dài hơn ở mục 10.5.

### 10.5 Thử nghiệm trên AWS

Chạy bằng `transcoder/scripts/staging-chunked-test.js` trên staging, đi đúng đường production: tải lên bucket raw → S3 event → SQS → Lambda → Batch.

**Video 25 phút (đợt khói, 2026-10-07).** Chạy xuyên suốt Lambda → planner → 2 job âm thanh → 5 đoạn song song → job ghép, quyền IAM đủ. Phát hiện lỗi duy nhất của cả
đợt: mỗi ranh giới mất 1,3 s tiếng (xem 10.2 E3 và 10.6), nên bản này **không** được dùng để kết luận; bản sửa được kiểm lại bằng image ở 10.6 rồi bằng video 4 giờ dưới đây.

**Video 4 giờ (2026-10-07/08).** Nguồn 1080p 30 fps CFR, 432.000 khung, 6,92 GiB (hình lặp từ một clip thật 4 Mbps, tiếng sin 128k), tải lên bằng `aws s3 cp` (multipart
tự động) trong 2 phút 3 giây. Image: ffmpeg 8.1.2 tĩnh, quota Fargate Spot 8 vCPU.

| Bước | Thời gian |
|---|---|
| Planner (Lambda → job lập kế hoạch → nộp 4 job) | 0,4 phút |
| Âm thanh 64k / 128k (song song) | 3,6 / **10,2 phút** (các đoạn phải chờ job chậm hơn) |
| 48 đoạn, 8 chạy cùng lúc, 6 lượt | **2,84 giờ**; mỗi đoạn 19,3 / 23,9 / 26,2 / 36,6 phút (nhỏ nhất / trung vị / trung bình / lớn nhất) |
| Job ghép (48 kết quả, 6 playlist, thumbnail, kiểm duyệt, READY) | 1,9 phút |
| **Từ lúc tải lên xong tới READY** | **3 giờ 5 phút** |

20,9 vCPU-giờ cho các đoạn. Hệ số trung bình **5,24** giây chạy mỗi giây video ở 1 vCPU, trong khi các đoạn đầu chạy ở ~4,05: Fargate Spot không đồng đều giữa các host (một đoạn
5 phút mất từ 19 tới 37 phút). Ước tính ở mục 4 (1,9-2,6 giờ ở 8 vCPU) quá lạc quan khoảng 18% ở cận trên; ước tính hợp lý cho video 4 giờ là **~3 giờ ở 8 vCPU**,
~2 giờ ở 12 vCPU, ~1,5 giờ ở 16 vCPU (hai số sau chưa đo). Không đoạn nào lỗi hay phải thử lại.

Kiểm tra kết quả (`staging-chunked-test.js verify`):
- 6 mức, mỗi mức **2.400 segment**, đủ trên S3, tổng **đúng 14.400,000 s**, segment dài nhất 6,000 s; master có BANDWIDTH đo từ segment thật và CODECS đọc từ luồng.
- Rendition 144p tải về phân tích gói tin: **0 khe hở/chồng lấn ở hình, 0 khe hở ở tiếng, 0 chồng lấn bất thường, qua cả 47 ranh giới đoạn**.
- Tệp tạm `work/` đã được dọn.
- **Chrome thật + hls.js**: nạp playlist 14.400 s (2.400 fragment), tua tới sát từng ranh giới trong 47 ranh giới, đợi nạp quanh đó: không lỗi hls.js, SourceBuffer hình và
  tiếng đều là một dải liền ở cả 47 chỗ.

### 10.6 Phiên bản ffmpeg của production

Toàn bộ phép đo ban đầu chạy trên ffmpeg 8.1 của máy phát triển. Image production dựa trên `node:24-slim` (Debian bookworm) và cài ffmpeg bằng apt:
**5.1.9**. Hai bản khác nhau đúng ở các điểm chia đoạn cần chính xác (ffmpeg 7 viết lại bộ điều phối luồng), và phát hiện này chỉ có được nhờ khe hở
1,3 s tiếng trên AWS thật mà cục bộ không tái hiện. Cách tìm ra: dựng chính image bằng Docker rồi chạy kịch bản tái hiện bên trong; tái hiện được
(1,6 s) và loại trừ từng giả thuyết (HTTP so với tệp, độ dài đoạn) cho tới khi chỉ còn `-frames:v`.

Đã làm:
- Mã chia đoạn đúng trên **cả hai** phiên bản (10.2) và được kiểm trên cả hai: ma trận 9 nguồn cùng cả pipeline cục bộ đều đạt 14/14 trong image 5.1.9
  lẫn image 8.1.2.
- Image production chạy ffmpeg **8.1.2 tĩnh** từ `mwader/static-ffmpeg`, ghim theo digest của image đa kiến trúc (tag có thể bị đẩy lại, digest thì không),
  cùng bản 8.1.2 mà pipeline được phát triển. Thay đổi cách mã hoá của MỌI video, kể cả video ngắn: đã kiểm TLS, DNS và đọc Range với URL ký sẵn S3
  thật, libx264, aac, hls; image nhỏ đi từ 1,09 GB xuống 834 MB. Đánh đổi: Trivy (quét thư viện) không nhìn thấy các thư viện codec bên trong binary tĩnh.
- `transcoder/scripts/verify-in-image.sh` dựng hai nguồn thử bằng lavfi **bên trong** một image rồi chạy `verify-chunked.js` và `verify-pipeline.js`. Một
  job CI mới chạy nó trên image dựng từ PR, và bước đẩy lên ECR phải chờ nó, nên đổi image gốc hay phiên bản ffmpeg làm hỏng ranh giới đoạn sẽ bị bắt trước khi lên.
- Nâng cấp ffmpeg về sau = đổi cả tag lẫn digest trong Dockerfile rồi để CI chạy lại kiểm tra trên.

### 10.7 Độ tin cậy của job con

- **Thử lại vô điều kiện.** Job definition chỉ thử lại khi lý do trạng thái khớp `Host EC2*` / `Task failed to start*`, mẫu mà tài liệu AWS chỉ nêu cho Spot trên
  EC2. Mỗi job con khai `retryStrategy` 3 lần không điều kiện khi nộp (đã xác nhận trên AWS: `attempts 3, evaluateOnExit []`). An toàn vì tiến trình bị giết (Spot
  thu hồi, hết bộ nhớ) không kịp đánh ERROR nên lần sau làm tiếp, còn lỗi do mã thì lần sau thấy video không còn PROCESSING và thoát trong vài giây.
- **Chỉ đánh ERROR ở lần thử cuối** (`AWS_BATCH_JOB_ATTEMPT`), để lỗi tạm thời không giết video mà Batch sắp thử lại. Planner không bị thử lại vô điều kiện nên đánh ERROR ngay.

### 10.8 Hàng đợi ưu tiên thấp cho các đoạn

**Vấn đề đo được.** Hạn mức Fargate Spot là 8 vCPU dùng chung. Một video 4 giờ nộp 48 job đoạn cùng lúc và chiếm cả 8 vCPU khoảng 3 giờ. Với một hàng đợi FIFO,
48 job đó đứng trước mọi video nộp sau, nên video 5 phút của người khác chờ cỡ 3 giờ mới được bắt đầu.

**Cách xử lý.** Thêm hàng đợi `<prefix>-transcode-bulk-queue` (priority 1) dùng CHUNG compute environment với hàng đợi chính (nay priority 10). Chỉ array job các đoạn
vào hàng đợi bulk (`bulk: true` trong `pipeline.js`); video mới tới, job lập kế hoạch, hai job âm thanh và job ghép ở lại hàng đợi chính. Mỗi khi một job kết thúc
và nhả vCPU, Batch xét hàng đợi priority cao trước (tài liệu `CreateJobQueue`: hàng đợi có priority lớn hơn được ưu tiên khi cùng compute environment), nên chỗ trống
đó thuộc về video ngắn đang chờ trước các đoạn còn lại. Job ghép ở hàng đợi chính vì nó phải lấy được chỗ ngay khi đoạn cuối xong, không xếp sau đoạn của video khác.

**Đo trên staging** (`transcoder/scripts/staging-queue-priority-test.js`, job `sleep` 90 giây, array 24 phần tử vào hàng bulk, hạn mức 8 vCPU đã đầy rồi mới nộp job thăm dò):

| Job thăm dò | Chờ sau khi nộp | Số phần tử array đã bắt đầu trước nó |
|---|---|---|
| Hàng đợi chính (priority 10) | **87 giây** | 8 / 24 (chỉ đợt đang chạy) |
| Hàng đợi bulk (đối chứng) | 371 giây | 24 / 24 (phải chờ hết) |

- Job ở hàng đợi chính nhảy lên trước 16 phần tử còn chờ, nhưng vẫn phải chờ đợt đang chạy xong (87 giây, xấp xỉ một job 90 giây): **Batch không ngắt job đang chạy**.
  Với video thật, thời gian chờ tối đa của video mới là một đoạn, khoảng 20 phút, thay vì cả video dài.
- Job ở hàng đợi chính phụ thuộc array job ở hàng bulk bắt đầu 20 giây SAU khi phần tử cuối kết thúc, nên dependency chạy được xuyên hàng đợi và job ghép
  vẫn chờ đủ mọi đoạn.

**Chạy thật sau khi lên image mới.** Video 25 phút (1080p, 2,75 GiB) trên staging: hai job âm thanh và job ghép ở hàng đợi chính, mảng 5 đoạn ở hàng bulk; `READY` sau 34 phút 30 giây
(tính cả 4 phút 22 giây tải lên), 250 segment ở cả 6 mức, tổng 1500,000 giây, không khe hở hay chồng lấn hình hoặc tiếng ở các ranh giới đoạn.

**Tương thích.** Biến `BATCH_BULK_JOB_QUEUE` để trống thì mọi job con vào hàng đợi chính như trước, nên hạ tầng và image có thể lên theo thứ tự nào cũng được. Job lập kế hoạch
cần thêm quyền `batch:SubmitJob` trên hàng đợi bulk (module iam), và bộ lọc cảnh báo job FAILED (module monitoring) phải gồm cả hàng đợi này, nếu không đoạn hỏng sẽ không có cảnh báo.

**Giới hạn.** Chỉ chia lại thứ tự, không thêm vCPU: tổng thời gian của video 4 giờ không đổi khi chỉ có nó. Hai video dài nộp cùng lúc vẫn xử lý lần lượt (FIFO trong hàng bulk).
Nâng hạn mức Fargate Spot mới làm cả hai nhanh hơn.

### 10.9 Chia đoạn theo công suất song song

**Số đo nền (production, 2026-10-09, video 25 phút 1080p, hạn mức 8 vCPU).** Từ lúc upload xong đến `READY` mất 36 phút 16 giây:

| Giai đoạn | Thời gian |
|---|---|
| Planner (khởi động Fargate 23 giây + thăm dò) | 50 giây |
| Hai job âm thanh (đoạn phải chờ) | 75 giây |
| 5 đoạn song song | 32,6 phút (89%) |
| Job ghép | 70 giây |

Hai điều cần sửa: (1) chỉ có 5 đoạn nên chỉ dùng 5 trong 8 vCPU; (2) năm đoạn CÙNG khối lượng chạy 18,2 / 18,4 / 21,1 / 28,3 / 32,6 phút,
lệch 1,8 lần vì Fargate Spot không đồng đều giữa các máy, và cả video phải chờ đoạn chậm nhất. Tổng việc là 7.117 vCPU-giây; chia đều cho
8 chỗ thì khoảng 15 phút.

**Cách xử lý.** Planner không còn dùng cố định 50 GOP (5 phút) mà chọn `gopsPerChunk` để ra khoảng `targetParallelism x chunksPerSlot` đoạn
(`chooseGopsPerChunk` trong `src/chunked/plan.js`):

    gopsPerChunk = clamp( ceil(tổngGOP / (chỗ chạy x 3)), tối thiểu 10, tối đa 50 )

- Tối đa 50 giữ hành vi cũ cho video dài: video 4 giờ vẫn ra 48 đoạn 5 phút. Tối thiểu 10 GOP (khoảng 1 phút): mỗi đoạn tốn chừng
  30-40 giây khởi động container và mở nguồn nên không đáng nhỏ hơn.
- Video 25 phút với 8 chỗ ra 23 đoạn khoảng 66 giây thay vì 5 đoạn 5 phút. Máy nhanh xong sớm thì nhận thêm đoạn, nên đoạn chậm nhất chỉ còn
  là một phần nhỏ của tổng việc (xếp lịch động).
- Số chỗ chạy lấy từ `CHUNK_TARGET_PARALLELISM`, Terraform đặt bằng `max_vcpus / job_vcpu` (`modules/batch`). Chưa đặt (0) thì tắt và mọi
  video dùng 50 GOP như trước, nên đổi mã và đổi hạ tầng không cần đi cùng lúc.
- Không ra ít đoạn hơn hành vi cũ ở mọi thời lượng (có test), và không đổi gì ở ranh giới đoạn: các bất biến E1/E2 đã kiểm với 1, 3, 7, 11 và 50 GOP.

**Kết quả đo trên staging (2026-10-10, cùng video 25 phút, hạn mức 8 vCPU, `CHUNK_TARGET_PARALLELISM=8`):**

| | Nền (production, 5 đoạn) | Chia theo công suất (staging, 23 đoạn) |
|---|---|---|
| Pha chunk | 32,6 phút | **19,2 phút** |
| Chunk nhanh nhất / trung vị / chậm nhất | 18,2 / 21,1 / 32,6 phút | 2,1 / 5,0 / 7,6 phút |
| Từ upload xong đến READY | 36 phút 16 giây | **23 phút 37 giây** (nhanh 1,5 lần) |
| Kiểm tra HLS | | 250 segment mỗi mức, 0 khe hở hay chồng lấn hình/tiếng |

Pha chunk dài hơn lý tưởng (khoảng 15 phút = tổng việc chia 8) vì đợt chạy cuối chưa đầy 8 chỗ: 23 đoạn chia 8 chỗ ra khoảng 3 đợt, và đoạn
chậm nhất trong đợt cuối (7,6 phút) quyết định lúc kết thúc. Tăng `CHUNKS_PER_SLOT` sẽ thu hẹp phần đuôi này nhưng tăng chi phí khởi động
(khoảng 25 giây mỗi đoạn); mức 3 là cân bằng hợp lý, chưa cần chỉnh. Phần cố định (planner, âm thanh, ghép) mất khoảng 4,4 phút.

Việc chưa làm: hạ ngưỡng `CHUNK_THRESHOLD_SECONDS` (1200 giây). Video dưới 20 phút vẫn đi một job 1 vCPU: 5 phút video mất khoảng 22 phút;
chia đoạn chỉ tốn cố định khoảng 3,3 phút (planner, âm thanh, ghép). Nên đo rồi mới đổi vì đó là đường mà phần lớn video ngắn đang đi.

### 10.10 Task 4 vCPU cho job chunk

Chunk chạy trên task lớn hơn planner, âm thanh và ghép: `CHUNK_JOB_VCPU` / `CHUNK_JOB_MEMORY` (Terraform `chunk_vcpu` / `chunk_memory`) được planner
ghi đè qua `containerOverrides.resourceRequirements` khi nộp mảng chunk. Số chỗ chạy là `max_vcpus / chunk_vcpu` (8 vCPU: 2 task 4 vCPU), nên
`CHUNK_TARGET_PARALLELISM` đi theo `chunk_vcpu` chứ không theo `job_vcpu`. Cặp vCPU/bộ nhớ sai bị bỏ qua kèm cảnh báo khi nạp cấu hình
(`src/chunked/fargateSize.js`) và bị Terraform từ chối ở bước plan, vì lỗi SubmitJob ở planner xảy ra sau khi video đã `PROCESSING` và sẽ làm
mọi video dài thành `ERROR`.

**Đo trên staging, cùng video 25 phút, hạn mức 8 vCPU:**

| | 23 chunk, task 1 vCPU | 6 chunk, task 4 vCPU |
|---|---|---|
| Chunk trung vị | 302 giây cho 66 giây video (4,6 giây/giây) | 256 giây cho 252 giây video (1,0 giây/giây) |
| Tổng task-giây x vCPU | khoảng 7.270 vCPU-giây | khoảng 6.790 vCPU-giây (ít hơn 7%) |
| Pha chunk | 19,2 phút | 16,8 phút |
| Từ tạo job đến READY | 23 phút 37 giây | **20 phút 23 giây** (nhanh hơn 14%) |
| Kiểm tra HLS | 250 segment mỗi mức, 0 khe hở | 250 segment mỗi mức, 0 khe hở |

**Điều chỉnh ước tính trước đó:** số đo cũ của đường một-job (1 GB: 5.917 giây ở 1 vCPU, 1.080 giây ở 4 vCPU, tức 5,5 lần cho 4 lần tài nguyên)
quá lạc quan với pipeline chunk. Ở đây 4 vCPU nhanh hơn 1 vCPU khoảng 4,7 lần, tức hiệu quả trên mỗi vCPU hơn khoảng 17%, không phải 37%.
Với video 4 giờ nên kỳ vọng khoảng 1,15 lần nhanh hơn (khoảng 2 giờ 40 phút), không phải 1,9 giờ.

Phần còn lại là đuôi: chỉ 2 chỗ chạy và 6 chunk (3 đợt), nên đoạn chậm nhất của đợt cuối (439 giây so với trung vị 256 giây, Fargate Spot lệch 1,7 lần)
quyết định lúc kết thúc; tổng việc chia đều cho 2 chỗ chỉ là 14,2 phút. Làm chunk nhỏ hơn không giúp: chi phí khởi động mỗi chunk (khoảng 25 giây)
cộng lại cân bằng với phần đuôi giảm được. Task 2 vCPU (4 chỗ) có thể cân bằng tốt hơn; chưa đo.

### 10.11 Hai lượt đo tiếp theo: task 2 vCPU và nhiều video cùng lúc

Cùng video 25 phút (1080p, 2,75 GiB), staging, hạn mức Fargate Spot 8 vCPU.

**Task 2 vCPU thay vì 4 vCPU** (`chunk_vcpu=2`, `chunk_memory=4096`, 4 chỗ chạy, 12 chunk 21 GOP):

| | 4 vCPU (6 chunk) | 2 vCPU (12 chunk) |
|---|---|---|
| Chunk trung vị | 256 giây cho 252 giây video | 280 giây cho 126 giây video |
| Chunk chậm nhất | 439 giây | 380 giây |
| Tổng vCPU-giây | 6.792 | 6.816 |
| Pha chunk | 16,8 phút | 16,3 phút |
| Từ tạo job đến ghép xong | 20,4 phút | **20,1 phút** |

Kết luận: cùng thời gian và cùng chi phí. Nhiều chỗ hơn không thu hẹp được phần đuôi vì việc chia vẫn theo từng đợt và một máy chậm của đợt cuối
quyết định lúc xong. Hiệu quả trên mỗi vCPU so với 1 vCPU: 2 vCPU hơn khoảng 7%, 4 vCPU hơn khoảng 17%. Giữ 4 vCPU (ít job hơn, ít khởi động hơn).

**Bốn video 25 phút cùng upload** (tải lên cùng lúc mất 16 phút 55 giây mỗi video vì chung đường truyền; sau đó 4 video vào hàng đợi gần như cùng giây):

| Video | Hàng đợi (thứ tự nộp) | Chunk | READY (phút từ lúc job đầu tiên được tạo) |
|---|---|---|---|
| 1 | 1 | 2,8 đến 19,7 | 21,0 |
| 2 | 2 | 18,4 đến 37,1 | 38,7 |
| 4 | 3 | 35,5 đến 58,5 | 62,9 |
| 3 | 4 | 52,2 đến 71,9 | 73,3 |

- **Thứ tự là FIFO theo thời điểm nộp**: video nộp sớm hơn xong sớm hơn. Trung bình 49 phút chờ, rẻ hơn chia đều (cả bốn xong lúc 73 phút).
- **Thông lượng: 4 video (100 phút video) trong 73,3 phút = 1,36 lần thời gian thực**, so với 1,23 lần khi chạy từng video một (25 / 20,4). Tốt hơn 10% vì
  phần cố định (planner, âm thanh, ghép) của video sau chạy chồng lên chunk của video trước.
- **Hạn mức vẫn là điểm nghẽn:** người thứ tư chờ 73 phút. Công suất tỉ lệ thuận với vCPU (16 vCPU sẽ giảm gần một nửa).
- **Job ghép phải chờ chỗ:** video 4 có chunk xong ở phút 58,5 nhưng job ghép chỉ bắt đầu ở phút 62,1 vì cả 8 vCPU đang do task chunk 4 vCPU của video 3
  giữ; job ghép (1 vCPU) phải đợi một task chunk xong. Hàng đợi chính ưu tiên cao hơn nhưng không ngắt job đang chạy. Cách xử lý đáng thử:
  môi trường Fargate On-Demand nhỏ (khoảng 2 vCPU) chỉ gắn vào hàng đợi chính, để planner, âm thanh và ghép không bao giờ chờ sau task chunk.
- HLS kiểm tra ở video 1 và 3: 250 segment mỗi mức, 0 khe hở hay chồng lấn hình/tiếng.
