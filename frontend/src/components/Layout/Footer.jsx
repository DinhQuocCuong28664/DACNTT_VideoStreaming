import { Link } from 'react-router-dom';
import { 
  FiPlay, 
  FiGithub, 
  FiZap, 
  FiShield, 
  FiCpu, 
  FiLayers, 
  FiGlobe, 
  FiCheckCircle
} from 'react-icons/fi';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="app-footer">
      <div className="footer-inner">
        {/* Upper Footer Grid */}
        <div className="footer-grid">
          {/* Column 1: Brand & Status */}
          <div className="footer-col footer-brand">
            <Link to="/" className="footer-logo">
              <div className="logo-icon">▶</div>
              <span className="logo-text">VidShare</span>
            </Link>
            <p className="footer-desc">
              Nền tảng chia sẻ video trực tuyến &amp; chuyển mã HLS tự động trên kiến trúc Serverless Container và Event-Driven trên AWS Cloud.
            </p>
            <div className="footer-status-badge">
              <span className="status-dot" />
              <FiZap /> AWS Infrastructure: <strong>OPERATIONAL (100%)</strong>
            </div>
          </div>

          {/* Column 2: Core Products */}
          <div className="footer-col">
            <h4 className="footer-heading">Sản Phẩm &amp; Đồ Án</h4>
            <ul className="footer-links">
              <li><Link to="/"><FiPlay /> Trình Phát HLS ABR Player</Link></li>
              <li><Link to="/upload"><FiZap /> Pre-signed S3 Upload</Link></li>
              <li><Link to="/landing"><FiCpu /> Transcoder Container Engine</Link></li>
              <li><Link to="/landing"><FiGlobe /> CloudFront CDN &amp; OAC</Link></li>
              <li><Link to="/landing"><FiShield /> DevSecOps &amp; Security Scan</Link></li>
            </ul>
          </div>

          {/* Column 3: Solutions & FinOps */}
          <div className="footer-col">
            <h4 className="footer-heading">Giải Pháp Cloud-Native</h4>
            <ul className="footer-links">
              <li><Link to="/landing"><FiLayers /> Event-Driven Architecture</Link></li>
              <li><Link to="/landing"><FiCheckCircle /> FinOps (-98.86% Cost Savings)</Link></li>
              <li><Link to="/landing"><FiCpu /> AWS Batch Fargate SPOT</Link></li>
              <li><Link to="/landing"><FiGlobe /> Adaptive Bitrate (360p-1080p)</Link></li>
              <li><Link to="/landing"><FiShield /> Strict Quality Gate CI/CD</Link></li>
            </ul>
          </div>

          {/* Column 4: AWS Infrastructure */}
          <div className="footer-col">
            <h4 className="footer-heading">Hạ Tầng AWS Cloud</h4>
            <ul className="footer-links">
              <li><span className="footer-static-item">Amazon S3 Raw &amp; Processed</span></li>
              <li><span className="footer-static-item">Amazon SQS Event Queue</span></li>
              <li><span className="footer-static-item">AWS Lambda Submitter</span></li>
              <li><span className="footer-static-item">Amazon ECR Docker Registry</span></li>
              <li><span className="footer-static-item">11 Terraform Modules (IaC)</span></li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="footer-divider" />

        {/* Bottom Bar */}
        <div className="footer-bottom">
          <div className="footer-copyright">
            © {new Date().getFullYear()} VidShare Platform. Đồ Án Công Nghệ Thông Tin 2 (DACNTT).
            <span className="author-credit">
              Thực hiện bởi: <strong>Đinh Quốc Cường (523H0008)</strong> &amp; <strong>Võ Huỳnh Minh Đức (523H0014)</strong> — GVHD: <strong>ThS. Mai Văn Mạnh</strong>.
            </span>
          </div>

          <div className="footer-socials">
            <a 
              href="https://github.com/DinhQuocCuong28664/DACNTT_VideoStreaming" 
              target="_blank" 
              rel="noreferrer"
              className="social-btn"
              title="GitHub Monorepo Repository"
            >
              <FiGithub />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
