# ═══════════════════════════════════════════════════
# Dockerfile — Backend API Service (Production-ready)
# Multi-stage build with non-root security & dumb-init
# ═══════════════════════════════════════════════════

# Stage 1: Dependency builder
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Stage 2: Production runtime
FROM node:22-alpine AS runner

WORKDIR /app

# Install dumb-init for proper PID 1 signal forwarding (graceful SIGTERM on scale-in)
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production \
    PORT=5000

# Copy node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

# Use built-in unprivileged user 'node' for security
USER node

EXPOSE 5000

# Health check probe against readiness endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/ || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/server.js"]
