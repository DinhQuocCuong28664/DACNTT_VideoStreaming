# ═══════════════════════════════════════════════════════
# DACNTT Video Transcoder — Multi-stage Dockerfile
# Base: node:24-slim (glibc, không phải alpine; FFmpeg là bản dựng tĩnh lấy từ Stage 0)
# Node 20+ required: the mongodb/mongoose driver needs the global
# Web Crypto API (globalThis.crypto), which isn't available by default
# on Node 18 and causes "crypto is not defined" at connect time.
# Nâng từ node:20-slim lên node:24-slim (2026-08-10): Node 20 đã EOL từ
# 30/4/2026, không còn nhận vá bảo mật. Node 24 là bản Active LTS hiện tại
# (hỗ trợ tới 4/2028) — chọn LTS thay vì bản Current (26) để giữ ổn định
# cho production.
# ═══════════════════════════════════════════════════════

# Stage 0: FFmpeg — bản dựng tĩnh, GHIM theo digest
#
# Trước đây ffmpeg cài bằng apt, tức bản của Debian trong image gốc: node:24-slim dựa trên Debian
# bookworm nên là 5.1.9, trong khi toàn bộ phép đo của pipeline chia đoạn chạy trên máy phát triển
# là 8.1. Hai bản cho kết quả KHÁC NHAU ở đúng chỗ chia đoạn cần chính xác (ffmpeg 7 viết lại bộ điều
# phối luồng): `-frames:v` trên 5.1 đóng mọi luồng của đầu ra nên cắt dở tiếng sao chép, và chế độ CFR
# nhân đôi khung cuối. Mã nay đúng trên cả hai (xem buildChunkArgs), nhưng production phải chạy đúng bản
# đã đo, và không được đổi phiên bản âm thầm mỗi khi Debian cập nhật image gốc.
#
# Ghim theo digest của image đa kiến trúc (không phải theo tag): tag có thể bị đẩy lại, digest thì
# không. Nâng cấp = đổi cả tag lẫn digest, rồi chạy lại scripts/verify-chunked.js trong image mới.
# Nguồn: https://github.com/wader/static-ffmpeg (dựng từ mã nguồn, có x264, libx264 GPL).
# Bản này chỉ chạy nội bộ trong job Batch, không phân phối lại.
FROM mwader/static-ffmpeg:8.1.2@sha256:33f770f812cbfc3de96c547157fc9faf8bd95a36481753439ffa761045167585 AS ffmpeg

# Stage 1: Builder — Install Node.js dependencies
FROM node:24-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --production

# Stage 2: Runtime — FFmpeg + Node.js runtime
FROM node:24-slim AS runtime

# FFmpeg tĩnh từ Stage 0, thay cho gói apt (xem ghi chú ở Stage 0). Không cần thư viện hệ thống nào đi kèm.
COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe

# node:24-slim bundles an npm CLI whose vendored node-tar has a known CRITICAL
# CVE (gzip bomb DoS, fixed upstream in tar 7.5.19). Update the global npm CLI
# to pull in the patched dependency — the app's own node_modules (installed
# via `npm ci` in the builder stage) are unaffected, this only touches the
# CLI tool baked into the base image.
RUN npm install -g npm@latest

# Create app user (security: don't run as root)
RUN useradd --create-home --shell /bin/bash appuser

WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY src/ ./src/
COPY package.json ./

# Create temp directory for transcoding workspace
RUN mkdir -p /tmp/vidshare-transcoder && chown appuser:appuser /tmp/vidshare-transcoder

USER appuser

# Default command: AWS Batch mode
CMD ["node", "src/index.js", "batch"]
