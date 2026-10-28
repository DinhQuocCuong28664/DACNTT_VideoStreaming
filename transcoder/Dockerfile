# Transcoder image. Build from the repository root:
#   docker build -f transcoder/Dockerfile -t zelos-transcoder .
#
# Stage "build" builds the shared package and bundles the entry points into single files.
# Stage "runtime" holds Node, a pinned static ffmpeg and the job bundle: no node_modules, no
# ffprobe (probing runs in a Lambda), no build tools, a non-root user. Every Fargate task pulls
# this image, so it is kept small.

FROM mwader/static-ffmpeg:8.1.2@sha256:33f770f812cbfc3de96c547157fc9faf8bd95a36481753439ffa761045167585 AS ffmpeg

FROM node:22-slim AS build
WORKDIR /src
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY transcoder/package.json transcoder/package.json
COPY functions/package.json functions/package.json
RUN npm ci --ignore-scripts
COPY shared/ shared/
COPY transcoder/ transcoder/
RUN npm run build --workspace=@zelos/shared && npm run build --workspace=@zelos/transcoder

FROM node:22-slim AS base
COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
RUN useradd --create-home --shell /usr/sbin/nologin transcoder
WORKDIR /app
COPY --from=build /src/transcoder/dist/main.js /src/transcoder/dist/main.js.map ./dist/
ENV NODE_ENV=production
ENTRYPOINT []

FROM base AS runtime
USER transcoder
CMD ["node", "dist/main.js"]
