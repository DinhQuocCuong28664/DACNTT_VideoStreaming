#!/usr/bin/env bash
#
# Kiểm chứng pipeline chia đoạn BÊN TRONG một image transcoder đã build, với đúng bản ffmpeg mà production chạy.
#
#   cd transcoder && bash scripts/verify-in-image.sh <ten-image>
#
# Vì sao phải chạy trong image: ffmpeg cài trên máy phát triển khác bản trong container, và hai bản cho kết quả KHÁC NHAU ở
# đúng chỗ chia đoạn cần chính xác (xem Dockerfile: `-frames:v` trên 5.1 cắt dở tiếng sao chép, chế độ CFR nhân đôi khung
# cuối). Script tự dựng hai nguồn thử bằng lavfi (29,97 và 30 fps, có B-frame, có tiếng sin liên tục để mọi khe hở lộ ra) nên
# không cần tệp nào đi kèm, rồi chạy verify-chunked.js (so lệnh chia đoạn với mã hoá một lần) và verify-pipeline.js (cả
# pipeline với S3/Mongo/Batch giả). Thoát mã khác 0 nếu có sai lệch.
set -euo pipefail

IMAGE="${1:?Cách dùng: bash scripts/verify-in-image.sh <ten-image>}"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"

# Git Bash trên Windows đổi đường dẫn bắt đầu bằng "/" thành đường dẫn Windows; tắt để docker nhận nguyên văn.
export MSYS_NO_PATHCONV=1

echo "ffmpeg trong image: $(docker run --rm --entrypoint ffmpeg "$IMAGE" -version | head -1)"

docker run --rm --entrypoint sh -v "$SCRIPTS_DIR:/app/scripts:ro" "$IMAGE" -c '
set -e
mkdir -p /tmp/src /tmp/out
make_source() { # tên, framerate
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "testsrc2=size=1280x720:rate=$2" -f lavfi -i "sine=frequency=440:sample_rate=44100" \
    -t 70 -c:v libx264 -preset veryfast -bf 3 -pix_fmt yuv420p -c:a aac -b:a 128k "/tmp/src/$1.mp4"
}
make_source ntsc 30000/1001
make_source cfr30 30/1

cd /app
for name in ntsc cfr30; do
  echo "── verify-chunked $name"
  node scripts/verify-chunked.js "/tmp/src/$name.mp4" "/tmp/out/chunked-$name" 3 360p,720p
done
echo "── verify-pipeline ntsc"
node scripts/verify-pipeline.js /tmp/src/ntsc.mp4 /tmp/out/pipeline-ntsc 2 10
' 2>&1 | grep -vE "⏳|injected env|^\s*$" | grep -E "ffmpeg|──|✓|✗|!|LỖI|Lỗi|Error|error"
# Mã thoát của docker nằm ở đầu ống: lấy PIPESTATUS[0]
exit "${PIPESTATUS[0]}"
