# Mục lục số liệu đo

Tệp này do `scripts/results/build-report-tables.py` sinh ra; đừng sửa tay. Số liệu gốc là các tệp JSON trong `docs/results/`.
Chạy lại: `PYTHONUTF8=1 python scripts/results/build-report-tables.py`.

## Bảng của báo cáo và nguồn của chúng

| Tệp bảng (`report/generated/`) | Nội dung | Dùng ở | Lượt đo nguồn |
|---|---|---|---|
| `tab-chunk-config-25min.tex` | 25-minute video, chunked path, by chunk configuration | Chương đánh giá, mục chuyển mã chia đoạn | 2026-10-09-production-25min-5x1, 2026-10-10-staging-25min-12x2, 2026-10-10-staging-25min-23x1, 2026-10-10-staging-25min-6x4, 2026-10-13-staging-s2a-25min-1080p-r1, 2026-10-13-staging-s2b-25min-1080p-r1, 2026-10-13-staging-s2b-25min-1080p-r2, 2026-10-staging-25min-5x1-bulk-queue |
| `tab-concurrent-four-videos.tex` | Four 25-minute videos submitted together | Chương đánh giá, mục nhiều video cùng lúc | 2026-10-10-staging-25min-x4-video1, 2026-10-10-staging-25min-x4-video2, 2026-10-10-staging-25min-x4-video3, 2026-10-10-staging-25min-x4-video4 |
| `tab-four-hour-breakdown.tex` | Four-hour video, time per step | Chương đánh giá, mục video 4 giờ | 2026-10-08-staging-4h-8vcpu-1vcpu-chunks |
| `tab-single-vs-chunked.tex` | Single-job path against chunked path, 5 to 15 minutes | Chương đánh giá, mục ngưỡng chia đoạn | 2026-10-10-staging-10min-chunked, 2026-10-10-staging-10min-single-estimated, 2026-10-10-staging-15min-chunked, 2026-10-10-staging-15min-single-estimated, 2026-10-10-staging-5min-chunked, 2026-10-10-staging-5min-single |
| `tab-transcode-timing-single-job.tex` | Single-job path, 100 MB to 1 GB, 1 vCPU against 4 vCPU | Chương đánh giá, mục thời gian chuyển mã theo dung lượng | transcode-timing |

## Các lượt đo trong `docs/results/runs/`

| Mã lượt đo | Ngày | Môi trường | Đường | Video | Đồng thời | READY (phút) | Mức chắc chắn | Nguồn |
|---|---|---|---|---|---|---|---|---|
| `2026-10-queue-priority-probe` | 2026-10 | staging | probe | sleep-90s-array-24 | 1 | - | measured | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.8` |
| `2026-10-staging-25min-5x1-bulk-queue` | 2026-10 | staging | chunked | 25min-1080p | 1 | 30.1 | derived | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.8` |
| `2026-10-08-staging-4h-8vcpu-1vcpu-chunks` | 2026-10-08 | staging | chunked | 4h-1080p30 | 1 | 185.0 | measured | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.5` |
| `2026-10-09-production-25min-5x1` | 2026-10-09 | production | chunked | 25min-1080p | 1 | 36.3 | derived | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.9` |
| `2026-10-10-staging-10min-chunked` | 2026-10-10 | staging | chunked | 10min-1080p30 | 3 | 27.2 | derived | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.12` |
| `2026-10-10-staging-10min-single-estimated` | 2026-10-10 | staging | single | 10min-1080p30 | 1 | 53.0 | estimated | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.12` |
| `2026-10-10-staging-15min-chunked` | 2026-10-10 | staging | chunked | 15min-1080p30 | 3 | 17.4 | derived | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.12` |
| `2026-10-10-staging-15min-single-estimated` | 2026-10-10 | staging | single | 15min-1080p30 | 1 | 80.0 | estimated | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.12` |
| `2026-10-10-staging-25min-12x2` | 2026-10-10 | staging | chunked | 25min-1080p | 1 | 20.1 | derived | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.11` |
| `2026-10-10-staging-25min-23x1` | 2026-10-10 | staging | chunked | 25min-1080p | 1 | 23.6 | derived | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.9` |
| `2026-10-10-staging-25min-6x4` | 2026-10-10 | staging | chunked | 25min-1080p | 1 | 20.4 | derived | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.10` |
| `2026-10-10-staging-25min-x4-video1` | 2026-10-10 | staging | chunked | 25min-1080p | 4 | 21.0 | derived | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.11` |
| `2026-10-10-staging-25min-x4-video2` | 2026-10-10 | staging | chunked | 25min-1080p | 4 | 38.7 | derived | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.11` |
| `2026-10-10-staging-25min-x4-video3` | 2026-10-10 | staging | chunked | 25min-1080p | 4 | 73.3 | derived | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.11` |
| `2026-10-10-staging-25min-x4-video4` | 2026-10-10 | staging | chunked | 25min-1080p | 4 | 62.9 | derived | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.11` |
| `2026-10-10-staging-5min-chunked` | 2026-10-10 | staging | chunked | 5min-1080p30 | 3 | 11.9 | derived | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.12` |
| `2026-10-10-staging-5min-single` | 2026-10-10 | staging | single | 5min-1080p30 | 1 | 26.7 | derived | `docs/CHUNKED_TRANSCODING_DESIGN.md#10.12` |
| `2026-10-13-staging-s0-spillover` | 2026-10-13 | staging | probe | sleep-240s-array-16 | 1 | - | measured | `scripts/bench/s0-spillover.js` |
| `2026-10-13-staging-s1-100mb-r1` | 2026-10-13 | staging | single | 100MB | 1 | 6.4 | measured | `transcoder/scripts/staging-measure-set.js (S1)` |
| `2026-10-13-staging-s1-100mb-r2` | 2026-10-13 | staging | single | 100MB | 1 | 11.8 | measured | `transcoder/scripts/staging-measure-set.js (S1)` |
| `2026-10-13-staging-s1-100mb-r3` | 2026-10-13 | staging | single | 100MB | 1 | 10.3 | measured | `transcoder/scripts/staging-measure-set.js (S1)` |
| `2026-10-13-staging-s1-1gb-r1` | 2026-10-13 | staging | chunked | 1GB | 1 | 19.2 | measured | `transcoder/scripts/staging-measure-set.js (S1)` |
| `2026-10-13-staging-s1-1gb-r2` | 2026-10-13 | staging | chunked | 1GB | 1 | 20.3 | measured | `transcoder/scripts/staging-measure-set.js (S1)` |
| `2026-10-13-staging-s1-500mb-r1` | 2026-10-13 | staging | chunked | 500MB | 1 | 10.4 | measured | `transcoder/scripts/staging-measure-set.js (S1)` |
| `2026-10-13-staging-s1-500mb-r2` | 2026-10-13 | staging | chunked | 500MB | 1 | 10.1 | measured | `transcoder/scripts/staging-measure-set.js (S1)` |
| `2026-10-13-staging-s2a-25min-1080p-r1` | 2026-10-13 | staging | chunked | 25min-1080p | 1 | 18.0 | measured | `transcoder/scripts/staging-measure-set.js (S2a)` |
| `2026-10-13-staging-s2b-25min-1080p-r1` | 2026-10-13 | staging | chunked | 25min-1080p | 1 | 15.3 | measured | `transcoder/scripts/staging-measure-set.js (S2b)` |
| `2026-10-13-staging-s2b-25min-1080p-r2` | 2026-10-13 | staging | chunked | 25min-1080p | 1 | 14.7 | measured | `transcoder/scripts/staging-measure-set.js (S2b)` |

Mức chắc chắn: `measured` đo trực tiếp, `derived` tính từ số đo (ví dụ đổi phút ra giây), `estimated` suy ra bằng tỉ lệ và chưa đo; bản ghi `estimated` phải được ghi rõ là ước tính khi đưa vào báo cáo.
