/**
 * Icon play bo góc dùng trong logo VidShare — thay cho ký tự Unicode "▶" thô
 * trước đây (render không nhất quán giữa các font/hệ điều hành, trông sơ
 * sài). Chỉ vẽ hình tam giác; nền gradient + bo góc do `.logo-icon` (CSS)
 * của khung chứa đảm nhiệm, nên component này không tự vẽ nền.
 */
const LogoIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path
      d="M 13.29 10.09 Q 11.50 9.00 11.50 11.10 L 11.50 20.90 Q 11.50 23.00 13.29 21.91 L 21.21 17.09 Q 23.00 16.00 21.21 14.91 Z"
      fill="currentColor"
    />
  </svg>
);

export default LogoIcon;
