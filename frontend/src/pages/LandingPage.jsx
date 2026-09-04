import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

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
          {t('landing.heroTitlePrefix')} <span className="gradient-text">{t('landing.heroTitleAccent')}</span>
        </h1>

        <p className="hero-subtitle">
          {t('landing.heroSubtitle')}
        </p>

        <div className="hero-actions">
          <Link to="/" className="btn btn-hero-primary">
            <FiPlay /> {t('landing.heroExplore')}
          </Link>
          <Link to="/upload" className="btn btn-hero-secondary">
            <FiUploadCloud /> {t('landing.heroUpload')}
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
            <div className="stat-label">{t('landing.statCostLabel')}</div>
            <p className="stat-desc">{t('landing.statCostDesc')}</p>
          </div>

          <div className="stat-card glass-panel">
            <div className="stat-value gradient-text">&lt; 1.2s</div>
            <div className="stat-label">Time-to-First-Frame</div>
            <p className="stat-desc">{t('landing.statCdnDesc')}</p>
          </div>

          <div className="stat-card glass-panel">
            <div className="stat-value gradient-text">360p - 1080p</div>
            <div className="stat-label">Adaptive Bitrate (ABR)</div>
            <p className="stat-desc">{t('landing.statAbrDesc')}</p>
          </div>

          <div className="stat-card glass-panel">
            <div className="stat-value gradient-text">100%</div>
            <div className="stat-label">{t('landing.statCicdLabel')}</div>
            <p className="stat-desc">{t('landing.statCicdDesc')}</p>
          </div>
        </div>
      </section>

      {/* ── 3. Key Feature Cards ───────────────────────── */}
      <section className="landing-features" id="features">
        <div className="section-header">
          <h2 className="section-title">
            {t('landing.featuresTitlePrefix')} <span className="gradient-text">{t('landing.featuresTitleAccent')}</span>
          </h2>
          <p className="section-subtitle">
            {t('landing.featuresSubtitle')}
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-card glass-panel">
            <div className="feature-icon icon-purple">
              <FiPlay />
            </div>
            <h3 className="feature-title">{t('landing.featureHlsTitle')}</h3>
            <p className="feature-desc">
              {t('landing.featureHlsDesc')}
            </p>
          </div>

          <div className="feature-card glass-panel">
            <div className="feature-icon icon-cyan">
              <FiCpu />
            </div>
            <h3 className="feature-title">AWS Serverless Container</h3>
            <p className="feature-desc">
              {t('landing.featureScaleDesc')}
            </p>
          </div>

          <div className="feature-card glass-panel">
            <div className="feature-icon icon-green">
              <FiLayers />
            </div>
            <h3 className="feature-title">Event-Driven Architecture</h3>
            <p className="feature-desc">
              {t('landing.featureEventDesc')}
            </p>
          </div>

          <div className="feature-card glass-panel">
            <div className="feature-icon icon-amber">
              <FiGlobe />
            </div>
            <h3 className="feature-title">{t('landing.featureCdnTitle')}</h3>
            <p className="feature-desc">
              {t('landing.featureCdnDesc')}
            </p>
          </div>

          <div className="feature-card glass-panel">
            <div className="feature-icon icon-blue">
              <FiMoon />
            </div>
            <h3 className="feature-title">{t('landing.featureThemeTitle')}</h3>
            <p className="feature-desc">
              {t('landing.featureThemeDesc')}
            </p>
          </div>

          <div className="feature-card glass-panel">
            <div className="feature-icon icon-red">
              <FiShield />
            </div>
            <h3 className="feature-title">DevSecOps &amp; Security Gate</h3>
            <p className="feature-desc">
              {t('landing.featureCicdDesc')}
            </p>
          </div>
        </div>
      </section>

      {/* ── 4. Interactive Pipeline Architecture Graphic Cards ─ */}
      <section className="landing-architecture" id="architecture">
        <div className="section-header">
          <h2 className="section-title">
            {t('landing.archTitlePrefix')} <span className="gradient-text">{t('landing.archTitleAccent')}</span>
          </h2>
          <p className="section-subtitle">
            {t('landing.archSubtitle')}
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
              {t('landing.archStep1')}
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
              {t('landing.archStep2')}
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
              {t('landing.archStep3')}
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
              {t('landing.archStep4')}
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
            <span className="code-showcase-tag">{t('landing.codeTag')}</span>
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
          <h2 className="cta-title">{t('landing.ctaTitle')}</h2>
          <p className="cta-desc">
            {t('landing.ctaSubtitle')}
          </p>
          <div className="cta-buttons">
            <Link to="/register" className="btn btn-hero-primary">
              <FiCheckCircle /> {t('landing.ctaRegister')}
            </Link>
            <Link to="/" className="btn btn-hero-secondary">
              <FiPlay /> {t('landing.ctaBrowse')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
