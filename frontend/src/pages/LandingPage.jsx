import { Link } from 'react-router-dom';
import { 
  FiPlay, 
  FiUploadCloud, 
  FiZap, 
  FiShield, 
  FiCpu, 
  FiGlobe, 
  FiCheckCircle, 
  FiArrowRight, 
  FiLayers, 
  FiPieChart, 
  FiActivity,
  FiMoon
} from 'react-icons/fi';
import './LandingPage.css';

const LandingPage = () => {
  return (
    <div className="landing-container">
      {/* ── 1. Hero Section ────────────────────────────── */}
      <section className="landing-hero">
        <div className="hero-badge">
          <span className="badge-pulse" />
          <FiZap className="badge-icon" />
          <span>Cloud-Native HLS Video Streaming Platform</span>
        </div>

        <h1 className="hero-title">
          Nền Tảng Chia Sẻ Video &amp; Chuyển Mã <span className="gradient-text">HLS Tự Động</span>
        </h1>

        <p className="hero-subtitle">
          Hệ thống chuyển mã đa độ phân giải Adaptive Bitrate (360p, 720p, 1080p) bất đồng bộ Event-Driven 
          trên kiến trúc AWS Serverless Container (AWS Batch, Fargate SPOT &amp; CloudFront CDN).
        </p>

        <div className="hero-actions">
          <Link to="/" className="btn btn-hero-primary">
            <FiPlay /> Khám Phá Trực Tiếp
          </Link>
          <Link to="/upload" className="btn btn-hero-secondary">
            <FiUploadCloud /> Tải Video Lên S3
          </Link>
        </div>

        {/* Hero Interactive Player Showcase */}
        <div className="hero-showcase">
          <div className="showcase-card glass-panel">
            <div className="showcase-header">
              <div className="window-dots">
                <span className="dot dot-red" />
                <span className="dot dot-yellow" />
                <span className="dot dot-green" />
              </div>
              <div className="showcase-status">
                <span className="status-badge status-ready">
                  <FiCheckCircle /> HLS Master Playlist: READY
                </span>
                <span className="status-badge status-live">
                  <FiActivity /> 1080p 60fps ABR
                </span>
              </div>
            </div>

            <div className="showcase-body">
              <div className="showcase-video-mock">
                <div className="mock-play-overlay">
                  <div className="play-pulse-btn">
                    <FiPlay className="play-icon" />
                  </div>
                </div>
                <div className="mock-stream-info">
                  <div className="stream-pill">hls_master.m3u8</div>
                  <div className="stream-pill quality-pill">Auto ABR (1080p)</div>
                </div>
              </div>
            </div>

            <div className="showcase-footer">
              <div className="step-tag">
                <span className="step-num">01</span> Direct S3 Upload
              </div>
              <FiArrowRight className="step-arrow" />
              <div className="step-tag">
                <span className="step-num">02</span> SQS → Lambda
              </div>
              <FiArrowRight className="step-arrow" />
              <div className="step-tag">
                <span className="step-num">03</span> Fargate SPOT FFmpeg
              </div>
              <FiArrowRight className="step-arrow" />
              <div className="step-tag active-tag">
                <span className="step-num">04</span> CloudFront CDN Play
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. FinOps Benchmark Stats ──────────────────── */}
      <section className="landing-stats">
        <div className="stats-grid">
          <div className="stat-card glass-panel">
            <div className="stat-value gradient-text">98.86%</div>
            <div className="stat-label">Tiết Giảm Chi Phí AWS</div>
            <p className="stat-desc">Mô hình Fargate SPOT Scale-to-0 so với máy chủ EC2 24/7 nhàn rỗi.</p>
          </div>

          <div className="stat-card glass-panel">
            <div className="stat-value gradient-text">&lt; 1.2s</div>
            <div className="stat-label">Time-to-First-Frame</div>
            <p className="stat-desc">Tốc độ phát video HLS mượt mà qua CloudFront CDN Origin Access Control.</p>
          </div>

          <div className="stat-card glass-panel">
            <div className="stat-value gradient-text">360p - 1080p</div>
            <div className="stat-label">Adaptive Bitrate (ABR)</div>
            <p className="stat-desc">Tự động điều chỉnh độ phân giải theo băng thông mạng người dùng.</p>
          </div>

          <div className="stat-card glass-panel">
            <div className="stat-value gradient-text">100%</div>
            <div className="stat-label">Tự Động Hóa CI/CD</div>
            <p className="stat-desc">11 Terraform Modules (IaC) &amp; 5 GitHub Actions Workflows tích hợp DevSecOps.</p>
          </div>
        </div>
      </section>

      {/* ── 3. Key Feature Cards ───────────────────────── */}
      <section className="landing-features" id="features">
        <div className="section-header">
          <h2 className="section-title">
            Tính Năng Nổi Bật Dành Cho <span className="gradient-text">Nền Tảng Video Thế Hệ Mới</span>
          </h2>
          <p className="section-subtitle">
            Giải pháp toàn diện từ khâu tải lên, nén video bất đồng bộ đến phân phối đa luồng bảo mật trên AWS Cloud.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-card glass-panel">
            <div className="feature-icon icon-purple">
              <FiPlay />
            </div>
            <h3 className="feature-title">Chuyển Mã HLS &amp; ABR Tự Động</h3>
            <p className="feature-desc">
              Container FFmpeg tự động phân tách video gốc thành các đoạn `.ts` (6s) và khởi tạo file `master.m3u8` nén 3 độ phân giải (360p, 720p, 1080p).
            </p>
          </div>

          <div className="feature-card glass-panel">
            <div className="feature-icon icon-cyan">
              <FiCpu />
            </div>
            <h3 className="feature-title">AWS Serverless Container</h3>
            <p className="feature-desc">
              Khởi tạo AWS Batch Job trên Fargate SPOT giải phóng 100% tài nguyên khi không có video (Scale to 0), tối ưu hóa bài toán Idle Resource Cost.
            </p>
          </div>

          <div className="feature-card glass-panel">
            <div className="feature-icon icon-green">
              <FiLayers />
            </div>
            <h3 className="feature-title">Event-Driven Architecture</h3>
            <p className="feature-desc">
              Luồng xử lý bất đồng bộ kết nối Amazon S3 Event Notification, Amazon SQS Queue, AWS Lambda Submitter &amp; CSDL MongoDB Atlas.
            </p>
          </div>

          <div className="feature-card glass-panel">
            <div className="feature-icon icon-amber">
              <FiGlobe />
            </div>
            <h3 className="feature-title">Phân Phối CloudFront CDN &amp; OAC</h3>
            <p className="feature-desc">
              Bảo mật S3 Processed Bucket bằng Origin Access Control (OAC), chặn hoàn toàn truy cập public trực tiếp, phát video tốc độ cao toàn cầu.
            </p>
          </div>

          <div className="feature-card glass-panel">
            <div className="feature-icon icon-blue">
              <FiMoon />
            </div>
            <h3 className="feature-title">Giao Diện Dark / Light Theme</h3>
            <p className="feature-desc">
              Thiết kế trải nghiệm người dùng hiện đại kiểu YouTube, hỗ trợ chuyển đổi chủ đề Sáng/Tối mượt mà tự động lưu bộ nhớ trình duyệt.
            </p>
          </div>

          <div className="feature-card glass-panel">
            <div className="feature-icon icon-red">
              <FiShield />
            </div>
            <h3 className="feature-title">DevSecOps &amp; Security Gate</h3>
            <p className="feature-desc">
              Tự động hóa kiểm thử Jest Unit Tests (13/13 Pass), rà soát mã nguồn Gitleaks, quét container Trivy SCA và kiểm thử tải k6 Stress Test.
            </p>
          </div>
        </div>
      </section>

      {/* ── 4. Interactive Pipeline Architecture ───────── */}
      <section className="landing-architecture" id="architecture">
        <div className="section-header">
          <h2 className="section-title">
            Kiến Trúc Hệ Thống <span className="gradient-text">Event-Driven &amp; Serverless</span>
          </h2>
          <p className="section-subtitle">
            Quy trình tự động hóa 6 bước từ khi người dùng tải video lên S3 đến khi sẵn sàng phát trên Web.
          </p>
        </div>

        <div className="arch-flow glass-panel">
          <div className="flow-step">
            <div className="step-badge">Step 1</div>
            <h4>Direct S3 Upload</h4>
            <p>Khởi tạo Pre-signed PUT URL, upload trực tiếp từ trình duyệt lên `vidshare-raw-bucket`.</p>
          </div>

          <div className="flow-connector"><FiArrowRight /></div>

          <div className="flow-step">
            <div className="step-badge">Step 2</div>
            <h4>SQS &amp; Lambda Trigger</h4>
            <p>S3 push sự kiện `ObjectCreated` sang SQS Queue, kích hoạt Lambda `SubmitJob` sang AWS Batch.</p>
          </div>

          <div className="flow-connector"><FiArrowRight /></div>

          <div className="flow-step">
            <div className="step-badge">Step 3</div>
            <h4>Fargate SPOT FFmpeg</h4>
            <p>Container nén HLS 360p/720p/1080p, tạo `master.m3u8` &amp; đẩy kết quả lên Processed Bucket.</p>
          </div>

          <div className="flow-connector"><FiArrowRight /></div>

          <div className="flow-step">
            <div className="step-badge">Step 4</div>
            <h4>CloudFront &amp; React HLS</h4>
            <p>Cập nhật trạng thái `READY` lên MongoDB Atlas. Phân phối HLS qua CloudFront CDN tới `HLS.js` Player.</p>
          </div>
        </div>
      </section>

      {/* ── 5. Call To Action (CTA) ────────────────────── */}
      <section className="landing-cta glass-panel">
        <div className="cta-content">
          <h2 className="cta-title">Sẵn Sàng Trải Nghiệm Hệ Thống Phát Video HLS Thế Hệ Mới?</h2>
          <p className="cta-desc">
            Trải nghiệm nền tảng chia sẻ video trực tuyến với công nghệ chuyển mã HLS tự động và giao diện hiện đại ngay hôm nay.
          </p>
          <div className="cta-buttons">
            <Link to="/register" className="btn btn-hero-primary">
              <FiCheckCircle /> Đăng Ký Tài Khoản
            </Link>
            <Link to="/" className="btn btn-hero-secondary">
              <FiPlay /> Xem Danh Sách Video
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
