# ═══════════════════════════════════════════════════════
# DACNTT Video Transcoder — Multi-stage Dockerfile
# Base: node:18-slim (NOT alpine — FFmpeg needs glibc)
# ═══════════════════════════════════════════════════════

# Stage 1: Builder — Install Node.js dependencies
FROM node:18-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --production

# Stage 2: Runtime — FFmpeg + Node.js runtime
FROM node:18-slim AS runtime

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
