/**
 * Những địa chỉ được tin khi chúng khai hộ IP người dùng qua X-Forwarded-For.
 *
 * Đường đi của một request production: trình duyệt → Cloudflare → nginx trên
 * EC2 → Node. Cloudflare ghi IP người dùng vào X-Forwarded-For, nginx nối thêm
 * IP của máy Cloudflare vừa kết nối tới nó ($proxy_add_x_forwarded_for), nên
 * header tới Node có dạng "<IP người dùng>, <IP Cloudflare>".
 *
 * Trước đây server.js đặt `trust proxy` bằng 1, tức lấy mục ngoài cùng bên phải
 * — chính là IP Cloudflare. Mọi người dùng đi qua cùng một máy Cloudflare vì
 * thế bị coi là một: bộ giới hạn đăng nhập 10 lần/15 phút dùng chung cho tất cả
 * (express-rate-limit gọi đây là limiter "biến thành giới hạn toàn cục"), và
 * lượt xem của khách chưa đăng nhập bị gộp lại.
 *
 * Với danh sách, Express đi X-Forwarded-For từ phải sang trái và dừng ở địa chỉ
 * đầu tiên KHÔNG thuộc danh sách (tài liệu "Express behind proxies"). Nhờ vậy:
 * - qua Cloudflare: bỏ qua IP Cloudflare, lấy đúng IP người dùng;
 * - người dùng tự chèn X-Forwarded-For giả: phần giả nằm bên trái IP thật do
 *   Cloudflare ghi, Express dừng trước khi chạm tới nó;
 * - gọi thẳng vào máy chủ, vòng qua Cloudflare: IP của kẻ gọi không thuộc danh
 *   sách nên chính nó là req.ip, không giả mạo được.
 *
 * Danh sách lấy từ https://www.cloudflare.com/ips-v4 và /ips-v6 ngày
 * 2026-09-28. Cloudflare yêu cầu cập nhật định kỳ; khi đổi thì sửa cùng lúc với
 * infrastructure/modules/cloudflare-ips, nơi security group backend của mọi
 * môi trường lấy cùng danh sách này.
 */

const CLOUDFLARE_IPV4 = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
];

const CLOUDFLARE_IPV6 = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

// `loopback` là nginx trên cùng máy (proxy_pass tới 127.0.0.1:5000).
const TRUSTED_PROXIES = ['loopback', ...CLOUDFLARE_IPV4, ...CLOUDFLARE_IPV6];

module.exports = { TRUSTED_PROXIES, CLOUDFLARE_IPV4, CLOUDFLARE_IPV6 };
