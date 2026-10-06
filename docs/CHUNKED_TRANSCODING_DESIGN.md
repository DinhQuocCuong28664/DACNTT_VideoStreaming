# Thiết kế: chuyển mã song song theo đoạn cho video dài

> Trạng thái: **đề xuất, chờ duyệt**. Chưa có dòng code nào của pipeline này được viết.
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
