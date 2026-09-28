# ═══════════════════════════════════════════════════
# Module: cloudflare-ips — dải IPv4 mà Cloudflare dùng để kết nối về máy chủ gốc
#
# Không tạo tài nguyên nào. Security group backend của mọi môi trường chỉ nhận
# cổng 80/443 từ các dải này (bản ghi api* là proxied trên Cloudflare).
#
# Lấy từ https://www.cloudflare.com/ips-v4 ngày 2026-09-28. Cloudflare yêu cầu
# cập nhật định kỳ; khi đổi thì sửa cùng lúc với backend/src/config/
# trustedProxies.js, nơi Express dùng cùng danh sách để đọc đúng IP người dùng.
# ═══════════════════════════════════════════════════

output "ipv4_cidrs" {
  value = [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
  ]
}
