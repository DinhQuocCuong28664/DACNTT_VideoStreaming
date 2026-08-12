# ═══════════════════════════════════════════════════════
# DACNTT Video Transcoder — Multi-stage Dockerfile
# Base: node:24-slim (NOT alpine — FFmpeg needs glibc)
# Node 20+ required: the mongodb/mongoose driver needs the global
# Web Crypto API (globalThis.crypto), which isn't available by default
# on Node 18 and causes "crypto is not defined" at connect time.
# Nâng từ node:20-slim lên node:24-slim (2026-08-10): Node 20 đã EOL từ
# 30/4/2026, không còn nhận vá bảo mật. Node 24 là bản Active LTS hiện tại
# (hỗ trợ tới 4/2028) — chọn LTS thay vì bản Current (26) để giữ ổn định
# cho production.
# ═══════════════════════════════════════════════════════

# Stage 1: Builder — Install Node.js dependencies
FROM node:24-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --production

# Stage 2: Runtime — FFmpeg + Node.js runtime
FROM node:24-slim AS runtime

# Install FFmpeg
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

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
