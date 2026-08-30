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
  FiActivity,
  FiMoon,
  FiCode
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

      {/* ── 4. Interactive Pipeline Architecture Graphic Cards ─ */}
      <section className="landing-architecture" id="architecture">
        <div className="section-header">
          <h2 className="section-title">
            Kiến Trúc Hệ Thống <span className="gradient-text">Event-Driven &amp; Serverless</span>
          </h2>
          <p className="section-subtitle">
            Quy trình nén và phát video tự động 4 bước với các thành phần hạ tầng AWS Cloud tiên tiến.
          </p>
        </div>

        <div className="arch-cards-grid">
          {/* Step 1 Graphic Card */}
          <div className="arch-card glass-panel">
            <div className="arch-card-header">
              <span className="step-badge-tag">STEP 01</span>
              <span className="tech-badge badge-s3">Amazon S3</span>
            </div>

            <div className="arch-card-graphic graphic-s3">
              <div className="graphic-icon-wrap">
                <FiUploadCloud className="graphic-icon" />
              </div>
              <div className="graphic-preview-box">
                <div className="preview-row">
                  <span className="preview-label">Direct Upload:</span>
                  <span className="preview-val">Pre-signed PUT URL</span>
                </div>
                <div className="preview-progress">
                  <div className="arch-progress-fill" style={{ width: '85%' }} />
                </div>
                <div className="preview-sub font-mono">vidshare-raw-bucket/video.mp4</div>
              </div>
            </div>

            <h3 className="arch-card-title">1. Direct S3 Upload</h3>
            <p className="arch-card-desc">
              Tải trực tiếp video từ trình duyệt người dùng lên Amazon S3 qua Pre-signed URL, loại bỏ nút thắt nghẽn Server Backend.
            </p>
          </div>

          <div className="arch-card-arrow"><FiArrowRight /></div>

          {/* Step 2 Graphic Card */}
          <div className="arch-card glass-panel">
            <div className="arch-card-header">
              <span className="step-badge-tag">STEP 02</span>
              <span className="tech-badge badge-sqs">SQS &amp; Lambda</span>
            </div>

            <div className="arch-card-graphic graphic-sqs">
              <div className="graphic-icon-wrap">
                <FiLayers className="graphic-icon" />
              </div>
              <div className="graphic-preview-box">
                <div className="preview-row">
                  <span className="preview-label">Event Notification:</span>
                  <span className="preview-val">ObjectCreated</span>
                </div>
                <div className="preview-tags font-mono">
                  <span className="mini-tag">SQS Queue</span>
                  <span className="mini-tag">Lambda Submit</span>
                </div>
              </div>
            </div>

            <h3 className="arch-card-title">2. Event Notification Queue</h3>
            <p className="arch-card-desc">
              S3 tự động gửi sự kiện sang Amazon SQS Queue, kích hoạt AWS Lambda khởi tạo Job chuyển mã bất đồng bộ.
            </p>
          </div>

          <div className="arch-card-arrow"><FiArrowRight /></div>

          {/* Step 3 Graphic Card */}
          <div className="arch-card glass-panel">
            <div className="arch-card-header">
              <span className="step-badge-tag">STEP 03</span>
              <span className="tech-badge badge-batch">AWS Batch SPOT</span>
            </div>

            <div className="arch-card-graphic graphic-batch">
              <div className="graphic-icon-wrap">
                <FiCpu className="graphic-icon" />
              </div>
              <div className="graphic-preview-box">
                <div className="preview-row">
                  <span className="preview-label">FFmpeg Transcoder:</span>
                  <span className="preview-val val-green">Scale to 0</span>
                </div>
                <div className="preview-tags font-mono">
                  <span className="mini-tag tag-abr">360p</span>
                  <span className="mini-tag tag-abr">720p</span>
                  <span className="mini-tag tag-abr">1080p</span>
                </div>
              </div>
            </div>

            <h3 className="arch-card-title">3. Fargate SPOT Container</h3>
            <p className="arch-card-desc">
              Container Docker FFmpeg tự động khởi tạo trên Fargate SPOT nén HLS m3u8 và tự giải phóng 100% tài nguyên sau khi làm xong.
            </p>
          </div>

          <div className="arch-card-arrow"><FiArrowRight /></div>

          {/* Step 4 Graphic Card */}
          <div className="arch-card glass-panel">
            <div className="arch-card-header">
              <span className="step-badge-tag">STEP 04</span>
              <span className="tech-badge badge-cdn">CloudFront CDN</span>
            </div>

            <div className="arch-card-graphic graphic-cdn">
              <div className="graphic-icon-wrap">
                <FiGlobe className="graphic-icon" />
              </div>
              <div className="graphic-preview-box">
                <div className="preview-row">
                  <span className="preview-label">Origin Security:</span>
                  <span className="preview-val">OAC Active</span>
                </div>
                <div className="preview-tags font-mono">
                  <span className="mini-tag tag-ready"><FiCheckCircle /> READY</span>
                  <span className="mini-tag">HLS.js Play</span>
                </div>
              </div>
            </div>

            <h3 className="arch-card-title">4. CloudFront &amp; HLS Player</h3>
            <p className="arch-card-desc">
              Phân phối luồng video HLS siêu mượt qua CloudFront CDN toàn cầu bảo mật OAC tới trình phát HLS.js trên Web UI.
            </p>
          </div>
        </div>

        {/* Trích đoạn thật từ infrastructure/modules/lambda/src/index.js —
            không phải code minh hoạ, để chứng minh pipeline ở trên là có
            thật chứ không chỉ là hình vẽ. */}
        <div className="code-showcase glass-panel">
          <div className="code-showcase-header">
            <FiCode />
            <span>infrastructure/modules/lambda/src/index.js</span>
            <span className="code-showcase-tag">Lambda Job Submitter — mã nguồn thật</span>
          </div>
          <pre className="code-showcase-body font-mono">
            <code>{`const submitCommand = new SubmitJobCommand({
  jobName: \`transcode-\${videoId}-\${Date.now()}\`,
  jobQueue: process.env.BATCH_JOB_QUEUE,
  jobDefinition: process.env.BATCH_JOB_DEFINITION,
  containerOverrides: {
    environment: [
      { name: 'VIDEO_ID', value: videoId },
      { name: 'RAW_S3_KEY', value: key },
      { name: 'RAW_S3_BUCKET', value: bucket },
    ],
  },
});

const response = await batchClient.send(submitCommand);
// → Fargate Spot container khởi tạo, bắt đầu chuyển mã HLS`}</code>
          </pre>
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
