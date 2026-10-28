# Transcoder image. Build from the repository root:
#   docker build -f transcoder/Dockerfile -t zelos-transcoder .
#
# Stage 1 builds the shared package and bundles the container entry point into one file.
# The runtime stage holds Node, a pinned static FFmpeg and that bundle: no node_modules,
# no build tools, a non-root user.

FROM mwader/static-ffmpeg:8.1.2@sha256:33f770f812cbfc3de96c547157fc9faf8bd95a36481753439ffa761045167585 AS ffmpeg

FROM node:22-slim AS build
WORKDIR /src
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY transcoder/package.json transcoder/package.json
RUN npm ci --ignore-scripts
COPY shared/ shared/
COPY transcoder/ transcoder/
RUN npm run build --workspace=@zelos/shared && npm run build --workspace=@zelos/transcoder

FROM node:22-slim AS runtime
COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe
RUN useradd --create-home --shell /usr/sbin/nologin transcoder
WORKDIR /app
COPY --from=build /src/transcoder/dist/ ./dist/
USER transcoder
ENV NODE_ENV=production
ENTRYPOINT []
CMD ["node", "dist/main.js"]
