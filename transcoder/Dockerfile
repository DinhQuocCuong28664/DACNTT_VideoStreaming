# Transcoder image. Build from the repository root:
#   docker build -f transcoder/Dockerfile -t zelos-transcoder .                 # runtime image
#   docker build -f transcoder/Dockerfile --target smoke -t zelos-smoke .       # CI smoke test
#
# Base images are pinned by digest (node 22.23.4, ffmpeg 8.1.2) so every build is the same.
# Stage "build" builds the shared package and bundles the entry points into single files.
# Stage "runtime" holds Node, a pinned static ffmpeg and the job bundle: no node_modules, no
# ffprobe (probing runs in a Lambda), no build tools, a non-root user. Every Fargate task pulls
# this image, so it is kept small. Stage "smoke" adds ffprobe and the smoke test on top.

FROM mwader/static-ffmpeg:8.1.2@sha256:33f770f812cbfc3de96c547157fc9faf8bd95a36481753439ffa761045167585 AS ffmpeg

FROM node:22-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS build
WORKDIR /src
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY transcoder/package.json transcoder/package.json
COPY functions/package.json functions/package.json
RUN npm ci --ignore-scripts
COPY shared/ shared/
COPY transcoder/ transcoder/
RUN npm run build --workspace=@zelos/shared && npm run build --workspace=@zelos/transcoder

FROM node:22-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS base
COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
RUN useradd --create-home --shell /usr/sbin/nologin transcoder
WORKDIR /app
COPY --from=build /src/transcoder/dist/main.js /src/transcoder/dist/main.js.map ./dist/
ENV NODE_ENV=production
ENTRYPOINT []

FROM base AS smoke
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe
COPY --from=build /src/transcoder/dist/smoke.js ./dist/
USER transcoder
CMD ["node", "dist/smoke.js"]

# Last stage = the default target, so a build without --target never ships the smoke tools.
FROM base AS runtime
USER transcoder
CMD ["node", "dist/main.js"]
