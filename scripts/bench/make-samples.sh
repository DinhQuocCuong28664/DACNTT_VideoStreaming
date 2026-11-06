#!/usr/bin/env bash
# Recreates the synthetic inputs of the S5 measurements, so they need not stay on disk.
# All are 1080p30 H.264 test patterns; the 4-hour one has moving content (testsrc2) and audio
# so it takes the chunked path with an audio job, like a real long video.
#
#   scripts/bench/make-samples.sh [names...]   names: 100mb 500mb 1gb qoe 4h (default: all)
#   OUT_DIR=... to write elsewhere (default: samples/, git-ignored)
#
# Parameters match the files used on 2026-11-04 (ffprobe of the originals):
#   100mb  120 s, ~6.7 Mbit/s      500mb  600 s, ~6.7 Mbit/s     qoe  180 s, ~6.7 Mbit/s
#   1gb    1600 s, ~5.35 Mbit/s    4h     14400 s, ~3.1 Mbit/s + AAC 128 kbit/s (~5.3 GiB)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT/samples}"
mkdir -p "$OUT_DIR"
NAMES=("$@")
[ ${#NAMES[@]} -eq 0 ] && NAMES=(100mb 500mb 1gb qoe 4h)

pattern() { # file seconds bitrate
  ffmpeg -hide_banner -loglevel error -stats -f lavfi -i "testsrc=size=1920x1080:rate=30" \
    -t "$2" -c:v libx264 -b:v "$3" -pix_fmt yuv420p -y "$OUT_DIR/$1"
}

for n in "${NAMES[@]}"; do
  case "$n" in
    100mb) pattern video-100mb.mp4 120 7M ;;
    500mb) pattern video-500mb.mp4 600 7M ;;
    1gb)   pattern video-1gb.mp4 1600 5.6M ;;
    qoe)   pattern qoe-test-3min.mp4 180 7M ;;
    4h)
      ffmpeg -hide_banner -loglevel error -stats \
        -f lavfi -i "testsrc2=size=1920x1080:rate=30" -f lavfi -i "sine=frequency=440:sample_rate=48000" \
        -t 14400 -c:v libx264 -preset ultrafast -b:v 3M -maxrate 3M -bufsize 6M -g 60 -pix_fmt yuv420p \
        -c:a aac -b:a 128k -y "$OUT_DIR/4h-1080p30.mp4" ;;
    *) echo "unknown sample: $n" >&2; exit 1 ;;
  esac
  echo "made $n"
done
