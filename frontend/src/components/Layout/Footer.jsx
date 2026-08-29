import { Link } from 'react-router-dom';
import { FiGithub, FiZap, FiPlay, FiUploadCloud, FiInfo } from 'react-icons/fi';
import LogoIcon from './LogoIcon';
import './Footer.css';

/**
 * Danh sách công nghệ hiển thị dưới dạng thẻ (chip), KHÔNG phải liên kết.
 *
 * Trước đây các mục này là <Link> nhưng đều trỏ về "/" hoặc "/landing" — bấm
 * vào "CloudFront CDN & OAC" lại nhảy sang trang giới thiệu chung. Người xem
 * nhận ra ngay đó là liên kết giả và cảm giác trang bị độn cho dài. Chúng là
 * thông tin về hệ thống chứ không phải nơi để đi tới, nên trình bày đúng bản
 * chất: nhãn tĩnh, gọn, không giả vờ bấm được.
 */
const TECH_STACK = [
  'Amazon S3',
  'Amazon SQS',
  'AWS Lambda',
  'AWS Batch / Fargate',
  'Amazon ECR',
  'CloudFront CDN',
  'Terraform IaC',
  'GitHub Actions',
];

const Footer = () => {
  return (
    <footer className="app-footer">
      <div className="footer-inner">
        <div className="footer-grid">
          {/* Thương hiệu & trạng thái hệ thống */}
          <div className="footer-col footer-brand">
            <Link to="/" className="footer-logo">
              <div className="logo-icon"><LogoIcon /></div>
              <span className="logo-text">VidShare</span>
            </Link>
            <p className="footer-desc">
              Nền tảng chia sẻ video với hệ thống chuyển mã HLS tự động trên kiến
              trúc Serverless Container và Event-Driven.
            </p>
            <div className="footer-status-badge">
              <span className="status-dot" />
              <FiZap /> Hạ tầng AWS: <strong>đang hoạt động</strong>
            </div>
          </div>

          {/* Điều hướng — chỉ những liên kết thật sự dẫn tới đâu đó */}
          <nav className="footer-col" aria-label="Liên kết chân trang">
            <h4 className="footer-heading">Điều hướng</h4>
            <ul className="footer-links">
              <li>
                <Link to="/">
                  <FiPlay /> Trang chủ
                </Link>
              </li>
              <li>
                <Link to="/upload">
                  <FiUploadCloud /> Tải video lên
                </Link>
              </li>
              <li>
                <Link to="/landing">
                  <FiInfo /> Giới thiệu nền tảng
                </Link>
              </li>
            </ul>
          </nav>

          {/* Công nghệ sử dụng */}
          <div className="footer-col">
            <h4 className="footer-heading">Công nghệ sử dụng</h4>
            <ul className="footer-chips">
              {TECH_STACK.map((tech) => (
                <li key={tech} className="footer-chip">
                  {tech}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="footer-divider" />

        <div className="footer-bottom">
          <div className="footer-copyright">
            <span>
              © {new Date().getFullYear()} VidShare — Đồ án Công nghệ Thông tin 2
            </span>
            <span className="author-credit">
              Đinh Quốc Cường (523H0008) &amp; Võ Huỳnh Minh Đức (523H0014) — GVHD:
              ThS. Mai Văn Mạnh
            </span>
          </div>

          <a
            href="https://github.com/DinhQuocCuong28664/DACNTT_VideoStreaming"
            target="_blank"
            rel="noreferrer"
            className="social-btn"
            title="Mã nguồn trên GitHub"
            aria-label="Mã nguồn trên GitHub"
          >
            <FiGithub />
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
