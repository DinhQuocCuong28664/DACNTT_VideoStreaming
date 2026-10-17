# Mục lục số liệu đo

Tệp này do `scripts/results/build-report-tables.py` sinh ra; đừng sửa tay. Số liệu gốc là các tệp JSON trong `docs/results/`.
Chạy lại: `PYTHONUTF8=1 python scripts/results/build-report-tables.py`.

## Bảng của báo cáo và nguồn của chúng

| Tệp sinh ra (`report/generated/`) | Nội dung | Dùng ở | Lượt đo nguồn |
|---|---|---|---|
| `chart-chunk-config-25min.json` | 25-minute video, time to READY and compute by chunk configuration | Biểu đồ trong chương đánh giá | 2026-10-09-production-25min-5x1, 2026-10-10-staging-25min-12x2, 2026-10-10-staging-25min-23x1, 2026-10-10-staging-25min-6x4, 2026-10-13-staging-s2a-25min-1080p-r1, 2026-10-13-staging-s2b-25min-1080p-r1, 2026-10-13-staging-s2b-25min-1080p-r2, 2026-10-14-staging-s3-25min-1080p-r1, 2026-10-14-staging-s3-25min-1080p-r2, 2026-10-staging-25min-5x1-bulk-queue |
| `chart-concurrent-four-videos.json` | Four 25-minute videos submitted together, per video | Biểu đồ trong chương đánh giá | 2026-10-10-staging-25min-x4-video1, 2026-10-10-staging-25min-x4-video2, 2026-10-10-staging-25min-x4-video3, 2026-10-10-staging-25min-x4-video4, 2026-10-14-staging-s5a-25min-1080p-v1, 2026-10-14-staging-s5a-25min-1080p-v2, 2026-10-14-staging-s5a-25min-1080p-v3, 2026-10-14-staging-s5a-25min-1080p-v4 |
| `chart-four-hour-breakdown.json` | Four-hour video, minutes per step at each capacity | Biểu đồ trong chương đánh giá | 2026-10-13-staging-s4-4h-1080p30-r1, 2026-10-14-staging-s4b-4h-1080p30-r1 |
| `tab-burst-summary.tex` | Simultaneous submissions: whole-batch time and per-video latency | Chương đánh giá, mục nhiều video đồng thời | 2026-10-14-staging-s5a-25min-1080p-summary, 2026-10-14-staging-s5b-60s-1080p-summary |
| `tab-chunk-config-25min.tex` | 25-minute video, chunked path, by chunk configuration | Chương đánh giá, mục chuyển mã chia đoạn | 2026-10-09-production-25min-5x1, 2026-10-10-staging-25min-12x2, 2026-10-10-staging-25min-23x1, 2026-10-10-staging-25min-6x4, 2026-10-13-staging-s2a-25min-1080p-r1, 2026-10-13-staging-s2b-25min-1080p-r1, 2026-10-13-staging-s2b-25min-1080p-r2, 2026-10-14-staging-s3-25min-1080p-r1, 2026-10-14-staging-s3-25min-1080p-r2, 2026-10-staging-25min-5x1-bulk-queue |
| `tab-concurrent-four-videos.tex` | Four 25-minute videos submitted together | Chương đánh giá, mục nhiều video cùng lúc | 2026-10-10-staging-25min-x4-video1, 2026-10-10-staging-25min-x4-video2, 2026-10-10-staging-25min-x4-video3, 2026-10-10-staging-25min-x4-video4, 2026-10-14-staging-s5a-25min-1080p-v1, 2026-10-14-staging-s5a-25min-1080p-v2, 2026-10-14-staging-s5a-25min-1080p-v3, 2026-10-14-staging-s5a-25min-1080p-v4 |
| `tab-four-hour-breakdown.tex` | Four-hour video, time per step | Chương đánh giá, mục video 4 giờ | 2026-10-13-staging-s4-4h-1080p30-r1, 2026-10-14-staging-s4b-4h-1080p30-r1 |
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
| `2026-10-13-staging-s4-4h-1080p30-r1` | 2026-10-13 | staging | chunked | 4h-1080p30 | 1 | 85.3 | measured | `transcoder/scripts/staging-measure-set.js (S4)` |
| `2026-10-14-staging-s3-25min-1080p-r1` | 2026-10-14 | staging | chunked | 25min-1080p | 1 | 26.0 | measured | `transcoder/scripts/staging-measure-set.js (S3)` |
| `2026-10-14-staging-s3-25min-1080p-r2` | 2026-10-14 | staging | chunked | 25min-1080p | 1 | 22.5 | measured | `transcoder/scripts/staging-measure-set.js (S3)` |
| `2026-10-14-staging-s4b-4h-1080p30-r1` | 2026-10-14 | staging | chunked | 4h-1080p30 | 1 | 135.3 | measured | `transcoder/scripts/staging-measure-set.js (S4b)` |
| `2026-10-14-staging-s5a-25min-1080p-summary` | 2026-10-14 | staging | burst | 25min-1080p | 4 | 44.3 | measured | `transcoder/scripts/staging-burst-test.js (S5a)` |
| `2026-10-14-staging-s5a-25min-1080p-v1` | 2026-10-14 | staging | chunked | 25min-1080p | 4 | 36.1 | measured | `transcoder/scripts/staging-burst-test.js (S5a)` |
| `2026-10-14-staging-s5a-25min-1080p-v2` | 2026-10-14 | staging | chunked | 25min-1080p | 4 | 17.7 | measured | `transcoder/scripts/staging-burst-test.js (S5a)` |
| `2026-10-14-staging-s5a-25min-1080p-v3` | 2026-10-14 | staging | chunked | 25min-1080p | 4 | 25.7 | measured | `transcoder/scripts/staging-burst-test.js (S5a)` |
| `2026-10-14-staging-s5a-25min-1080p-v4` | 2026-10-14 | staging | chunked | 25min-1080p | 4 | 44.3 | measured | `transcoder/scripts/staging-burst-test.js (S5a)` |
| `2026-10-14-staging-s5b-60s-1080p-summary` | 2026-10-14 | staging | burst | 60s-1080p | 100 | 35.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v1` | 2026-10-14 | staging | single | 60s-1080p | 100 | 6.2 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v10` | 2026-10-14 | staging | single | 60s-1080p | 100 | 5.9 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v100` | 2026-10-14 | staging | single | 60s-1080p | 100 | 30.9 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v11` | 2026-10-14 | staging | single | 60s-1080p | 100 | 10.0 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v12` | 2026-10-14 | staging | single | 60s-1080p | 100 | 4.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v13` | 2026-10-14 | staging | single | 60s-1080p | 100 | 6.1 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v14` | 2026-10-14 | staging | single | 60s-1080p | 100 | 10.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v15` | 2026-10-14 | staging | single | 60s-1080p | 100 | 9.3 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v16` | 2026-10-14 | staging | single | 60s-1080p | 100 | 3.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v17` | 2026-10-14 | staging | single | 60s-1080p | 100 | 5.9 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v18` | 2026-10-14 | staging | single | 60s-1080p | 100 | 5.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v19` | 2026-10-14 | staging | single | 60s-1080p | 100 | 5.2 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v2` | 2026-10-14 | staging | single | 60s-1080p | 100 | 6.0 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v20` | 2026-10-14 | staging | single | 60s-1080p | 100 | 10.0 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v21` | 2026-10-14 | staging | single | 60s-1080p | 100 | 6.2 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v22` | 2026-10-14 | staging | single | 60s-1080p | 100 | 6.3 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v23` | 2026-10-14 | staging | single | 60s-1080p | 100 | 11.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v24` | 2026-10-14 | staging | single | 60s-1080p | 100 | 9.7 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v25` | 2026-10-14 | staging | single | 60s-1080p | 100 | 7.5 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v26` | 2026-10-14 | staging | single | 60s-1080p | 100 | 11.9 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v27` | 2026-10-14 | staging | single | 60s-1080p | 100 | 11.7 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v28` | 2026-10-14 | staging | single | 60s-1080p | 100 | 11.7 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v29` | 2026-10-14 | staging | single | 60s-1080p | 100 | 12.4 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v3` | 2026-10-14 | staging | single | 60s-1080p | 100 | 5.7 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v30` | 2026-10-14 | staging | single | 60s-1080p | 100 | 12.5 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v31` | 2026-10-14 | staging | single | 60s-1080p | 100 | 10.1 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v32` | 2026-10-14 | staging | single | 60s-1080p | 100 | 11.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v33` | 2026-10-14 | staging | single | 60s-1080p | 100 | 13.0 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v34` | 2026-10-14 | staging | single | 60s-1080p | 100 | 14.7 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v35` | 2026-10-14 | staging | single | 60s-1080p | 100 | 15.9 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v36` | 2026-10-14 | staging | single | 60s-1080p | 100 | 13.6 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v37` | 2026-10-14 | staging | single | 60s-1080p | 100 | 17.5 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v38` | 2026-10-14 | staging | single | 60s-1080p | 100 | 17.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v39` | 2026-10-14 | staging | single | 60s-1080p | 100 | 17.9 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v4` | 2026-10-14 | staging | single | 60s-1080p | 100 | 5.9 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v40` | 2026-10-14 | staging | single | 60s-1080p | 100 | 15.7 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v41` | 2026-10-14 | staging | single | 60s-1080p | 100 | 17.0 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v42` | 2026-10-14 | staging | single | 60s-1080p | 100 | 18.2 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v43` | 2026-10-14 | staging | single | 60s-1080p | 100 | 16.0 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v44` | 2026-10-14 | staging | single | 60s-1080p | 100 | 15.0 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v45` | 2026-10-14 | staging | single | 60s-1080p | 100 | 17.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v46` | 2026-10-14 | staging | single | 60s-1080p | 100 | 17.2 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v47` | 2026-10-14 | staging | single | 60s-1080p | 100 | 18.2 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v48` | 2026-10-14 | staging | single | 60s-1080p | 100 | 17.5 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v49` | 2026-10-14 | staging | single | 60s-1080p | 100 | 15.3 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v5` | 2026-10-14 | staging | single | 60s-1080p | 100 | 5.7 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v50` | 2026-10-14 | staging | single | 60s-1080p | 100 | 18.6 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v51` | 2026-10-14 | staging | single | 60s-1080p | 100 | 20.1 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v52` | 2026-10-14 | staging | single | 60s-1080p | 100 | 18.6 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v53` | 2026-10-14 | staging | single | 60s-1080p | 100 | 19.9 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v54` | 2026-10-14 | staging | single | 60s-1080p | 100 | 21.4 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v55` | 2026-10-14 | staging | single | 60s-1080p | 100 | 19.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v56` | 2026-10-14 | staging | single | 60s-1080p | 100 | 21.2 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v57` | 2026-10-14 | staging | single | 60s-1080p | 100 | 21.4 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v58` | 2026-10-14 | staging | single | 60s-1080p | 100 | 23.3 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v59` | 2026-10-14 | staging | single | 60s-1080p | 100 | 23.1 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v6` | 2026-10-14 | staging | single | 60s-1080p | 100 | 12.0 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v60` | 2026-10-14 | staging | single | 60s-1080p | 100 | 23.5 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v61` | 2026-10-14 | staging | single | 60s-1080p | 100 | 23.4 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v62` | 2026-10-14 | staging | single | 60s-1080p | 100 | 23.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v63` | 2026-10-14 | staging | single | 60s-1080p | 100 | 23.5 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v64` | 2026-10-14 | staging | single | 60s-1080p | 100 | 27.1 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v65` | 2026-10-14 | staging | single | 60s-1080p | 100 | 24.0 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v66` | 2026-10-14 | staging | single | 60s-1080p | 100 | 24.3 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v67` | 2026-10-14 | staging | single | 60s-1080p | 100 | 29.2 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v68` | 2026-10-14 | staging | single | 60s-1080p | 100 | 25.6 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v69` | 2026-10-14 | staging | single | 60s-1080p | 100 | 23.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v7` | 2026-10-14 | staging | single | 60s-1080p | 100 | 3.9 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v70` | 2026-10-14 | staging | single | 60s-1080p | 100 | 27.1 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v71` | 2026-10-14 | staging | single | 60s-1080p | 100 | 22.7 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v72` | 2026-10-14 | staging | single | 60s-1080p | 100 | 27.3 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v73` | 2026-10-14 | staging | single | 60s-1080p | 100 | 29.5 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v74` | 2026-10-14 | staging | single | 60s-1080p | 100 | 23.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v75` | 2026-10-14 | staging | single | 60s-1080p | 100 | 23.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v76` | 2026-10-14 | staging | single | 60s-1080p | 100 | 27.1 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v77` | 2026-10-14 | staging | single | 60s-1080p | 100 | 29.4 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v78` | 2026-10-14 | staging | single | 60s-1080p | 100 | 27.9 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v79` | 2026-10-14 | staging | single | 60s-1080p | 100 | 27.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v8` | 2026-10-14 | staging | single | 60s-1080p | 100 | 11.7 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v80` | 2026-10-14 | staging | single | 60s-1080p | 100 | 29.6 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v81` | 2026-10-14 | staging | single | 60s-1080p | 100 | 29.7 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v82` | 2026-10-14 | staging | single | 60s-1080p | 100 | 29.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v83` | 2026-10-14 | staging | single | 60s-1080p | 100 | 29.6 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v84` | 2026-10-14 | staging | single | 60s-1080p | 100 | 30.0 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v85` | 2026-10-14 | staging | single | 60s-1080p | 100 | 33.0 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v86` | 2026-10-14 | staging | single | 60s-1080p | 100 | 30.2 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v87` | 2026-10-14 | staging | single | 60s-1080p | 100 | 32.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v88` | 2026-10-14 | staging | single | 60s-1080p | 100 | 35.5 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v89` | 2026-10-14 | staging | single | 60s-1080p | 100 | 29.9 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v9` | 2026-10-14 | staging | single | 60s-1080p | 100 | 5.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v90` | 2026-10-14 | staging | single | 60s-1080p | 100 | 35.3 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v91` | 2026-10-14 | staging | single | 60s-1080p | 100 | 33.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v92` | 2026-10-14 | staging | single | 60s-1080p | 100 | 35.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v93` | 2026-10-14 | staging | single | 60s-1080p | 100 | 35.7 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v94` | 2026-10-14 | staging | single | 60s-1080p | 100 | 33.5 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v95` | 2026-10-14 | staging | single | 60s-1080p | 100 | 35.3 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v96` | 2026-10-14 | staging | single | 60s-1080p | 100 | 34.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v97` | 2026-10-14 | staging | single | 60s-1080p | 100 | 35.4 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v98` | 2026-10-14 | staging | single | 60s-1080p | 100 | 33.8 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |
| `2026-10-14-staging-s5b-60s-1080p-v99` | 2026-10-14 | staging | single | 60s-1080p | 100 | 32.0 | measured | `transcoder/scripts/staging-burst-test.js (S5b)` |

Mức chắc chắn: `measured` đo trực tiếp, `derived` tính từ số đo (ví dụ đổi phút ra giây), `estimated` suy ra bằng tỉ lệ và chưa đo; bản ghi `estimated` phải được ghi rõ là ước tính khi đưa vào báo cáo.
