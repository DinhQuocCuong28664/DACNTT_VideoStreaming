import { useRef } from 'react';
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
import useRevealOnScroll from '../hooks/useRevealOnScroll';
import './LandingPage.css';

const LandingPage = () => {
  const { t } = useTranslation();
  const pageRef = useRef(null);
  useRevealOnScroll(pageRef);

  return (
    <div className="landing" ref={pageRef}>
      {/* ── 1. Hero Section ────────────────────────────── */}
      <section className="landing-hero">
        <div className="landing-hero-atmosphere" aria-hidden="true" />

        <div className="landing-inner landing-hero-grid">
          <div className="hero-copy">
            <span className="section-label is-live hero-badge">
              <FiZap className="badge-icon" />
              <span>Cloud-Native HLS Video Streaming Platform</span>
            </span>

            <h1 className="hero-title display-heading">
              {t('landing.heroTitlePrefix')}{' '}
              <span className="hero-title-accent">
                <span className="gradient-text">{t('landing.heroTitleAccent')}</span>
                <span className="gradient-underline" aria-hidden="true" />
              </span>
            </h1>

            <p className="hero-subtitle">
              {t('landing.heroSubtitle')}
            </p>

            <div className="hero-actions">
              <Link to="/" className="btn btn-primary btn-lg">
                <FiPlay /> {t('landing.heroExplore')}
                <FiArrowRight className="btn-arrow" />
              </Link>
              <Link to="/upload" className="btn btn-secondary btn-lg">
                <FiUploadCloud /> {t('landing.heroUpload')}
              </Link>
            </div>
          </div>

          {/* Hero Interactive Player Showcase */}
          <div className="hero-visual">
            <div className="hero-ring" aria-hidden="true" />
            <div className="hero-dot-grid" aria-hidden="true" />
            <div className="hero-corner" aria-hidden="true" />

            <div className="showcase-card">
              <div className="showcase-header">
                <div className="window-dots" aria-hidden="true">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
                <span className="showcase-file font-mono">hls_master.m3u8</span>
              </div>

              <div className="showcase-video-mock">
                <div className="play-pulse-btn" aria-hidden="true">
                  <FiPlay className="play-icon" />
                </div>
                <div className="mock-stream-info">
                  <div className="stream-pill">hls_master.m3u8</div>
                  <div className="stream-pill quality-pill">Auto ABR (1080p)</div>
                </div>
              </div>

              <div className="showcase-footer">
                <div className="step-tag">
                  <span className="step-num">01</span> Direct S3 Upload
                </div>
                <div className="step-tag">
                  <span className="step-num">02</span> SQS → Lambda
                </div>
                <div className="step-tag">
                  <span className="step-num">03</span> Fargate SPOT FFmpeg
                </div>
                <div className="step-tag active-tag">
                  <span className="step-num">04</span> CloudFront CDN Play
                </div>
              </div>
            </div>

            <div className="hero-float hero-float-a">
              <span className="status-badge status-ready">
                <FiCheckCircle /> HLS Master Playlist: READY
              </span>
            </div>
            <div className="hero-float hero-float-b">
              <span className="status-badge status-live">
                <FiActivity /> 1080p 60fps ABR
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. FinOps Benchmark Stats ──────────────────── */}
      <section className="landing-stats">
        <div className="texture-dots" aria-hidden="true" />
        <div className="glow landing-stats-glow" aria-hidden="true" />

        <div className="landing-inner">
          <span className="section-label on-inverted" data-reveal>{t('landing.statsLabel')}</span>

          <div className="stats-grid" data-reveal-stagger>
            <div className="stat-card">
              <div className="stat-value">98.86%</div>
              <div className="stat-label">{t('landing.statCostLabel')}</div>
              <p className="stat-desc">{t('landing.statCostDesc')}</p>
            </div>

            <div className="stat-card">
              <div className="stat-value">&lt; 1.2s</div>
              <div className="stat-label">Time-to-First-Frame</div>
              <p className="stat-desc">{t('landing.statCdnDesc')}</p>
            </div>

            <div className="stat-card">
              <div className="stat-value">360p - 1080p</div>
              <div className="stat-label">Adaptive Bitrate (ABR)</div>
              <p className="stat-desc">{t('landing.statAbrDesc')}</p>
            </div>

            <div className="stat-card">
              <div className="stat-value">100%</div>
              <div className="stat-label">{t('landing.statCicdLabel')}</div>
              <p className="stat-desc">{t('landing.statCicdDesc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Key Feature Cards ───────────────────────── */}
      <section className="landing-section" id="features">
        <div className="landing-inner">
          <header className="section-header" data-reveal>
            <span className="section-label">{t('landing.featuresLabel')}</span>
            <h2 className="section-title display-heading">
              {t('landing.featuresTitlePrefix')} <span className="gradient-text">{t('landing.featuresTitleAccent')}</span>
            </h2>
            <p className="section-subtitle">
              {t('landing.featuresSubtitle')}
            </p>
          </header>

          <div className="features-grid" data-reveal-stagger>
            <article className="feature-card">
              <div className="feature-icon">
                <FiPlay />
              </div>
              <h3 className="feature-title">{t('landing.featureHlsTitle')}</h3>
              <p className="feature-desc">
                {t('landing.featureHlsDesc')}
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon">
                <FiCpu />
              </div>
              <h3 className="feature-title">AWS Serverless Container</h3>
              <p className="feature-desc">
                {t('landing.featureScaleDesc')}
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon">
                <FiLayers />
              </div>
              <h3 className="feature-title">Event-Driven Architecture</h3>
              <p className="feature-desc">
                {t('landing.featureEventDesc')}
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon">
                <FiGlobe />
              </div>
              <h3 className="feature-title">{t('landing.featureCdnTitle')}</h3>
              <p className="feature-desc">
                {t('landing.featureCdnDesc')}
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon">
                <FiMoon />
              </div>
              <h3 className="feature-title">{t('landing.featureThemeTitle')}</h3>
              <p className="feature-desc">
                {t('landing.featureThemeDesc')}
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon">
                <FiShield />
              </div>
              <h3 className="feature-title">DevSecOps &amp; Security Gate</h3>
              <p className="feature-desc">
                {t('landing.featureCicdDesc')}
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ── 4. Interactive Pipeline Architecture Graphic Cards ─ */}
      <section className="landing-section landing-architecture" id="architecture">
        <div className="landing-inner">
          <header className="section-header" data-reveal>
            <span className="section-label">{t('landing.archLabel')}</span>
            <h2 className="section-title display-heading">
              {t('landing.archTitlePrefix')} <span className="gradient-text">{t('landing.archTitleAccent')}</span>
            </h2>
            <p className="section-subtitle">
              {t('landing.archSubtitle')}
            </p>
          </header>

          <ol className="arch-timeline" data-reveal-stagger>
            {/* Step 1 Graphic Card */}
            <li className="arch-card">
              <div className="arch-card-header">
                <span className="step-badge-tag">STEP 01</span>
                <span className="tech-badge">Amazon S3</span>
              </div>

              <div className="arch-card-graphic">
                <div className="graphic-icon-wrap">
                  <FiUploadCloud className="graphic-icon" />
                </div>
                <div className="graphic-preview-box">
                  <div className="preview-row">
                    <span className="preview-label">Direct Upload:</span>
                    <span className="preview-val">Pre-signed PUT URL</span>
                  </div>
                  <div className="preview-progress">
                    <div className="arch-progress-fill" />
                  </div>
                  <div className="preview-sub font-mono">vidshare-raw-bucket/video.mp4</div>
                </div>
              </div>

              <h3 className="arch-card-title">1. Direct S3 Upload</h3>
              <p className="arch-card-desc">
                {t('landing.archStep1')}
              </p>

              <span className="arch-connector" aria-hidden="true"><FiArrowRight /></span>
            </li>

            {/* Step 2 Graphic Card */}
            <li className="arch-card">
              <div className="arch-card-header">
                <span className="step-badge-tag">STEP 02</span>
                <span className="tech-badge">SQS &amp; Lambda</span>
              </div>

              <div className="arch-card-graphic">
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

              <span className="arch-connector" aria-hidden="true"><FiArrowRight /></span>
            </li>

            {/* Step 3 Graphic Card */}
            <li className="arch-card">
              <div className="arch-card-header">
                <span className="step-badge-tag">STEP 03</span>
                <span className="tech-badge">AWS Batch SPOT</span>
              </div>

              <div className="arch-card-graphic">
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

              <span className="arch-connector" aria-hidden="true"><FiArrowRight /></span>
            </li>

            {/* Step 4 Graphic Card */}
            <li className="arch-card">
              <div className="arch-card-header">
                <span className="step-badge-tag">STEP 04</span>
                <span className="tech-badge">CloudFront CDN</span>
              </div>

              <div className="arch-card-graphic">
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
            </li>
          </ol>

          {/* Trích đoạn thật từ infrastructure/modules/lambda/src/index.js —
              không phải code minh hoạ, để chứng minh pipeline ở trên là có
              thật chứ không chỉ là hình vẽ. */}
          <div className="code-showcase" data-reveal>
            <div className="code-showcase-header">
              <span className="code-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
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
        </div>
      </section>

      {/* ── 5. Call To Action (CTA) ────────────────────── */}
      <section className="landing-section landing-cta-section">
        <div className="landing-inner">
          <div className="cta-frame" data-reveal>
            <div className="landing-cta">
              <div className="glow landing-cta-glow" aria-hidden="true" />
              <div className="cta-content">
                <span className="section-label is-live">{t('landing.ctaLabel')}</span>
                <h2 className="cta-title display-heading">{t('landing.ctaTitle')}</h2>
                <p className="cta-desc">
                  {t('landing.ctaSubtitle')}
                </p>
                <div className="cta-buttons">
                  <Link to="/register" className="btn btn-primary btn-lg">
                    <FiCheckCircle /> {t('landing.ctaRegister')}
                    <FiArrowRight className="btn-arrow" />
                  </Link>
                  <Link to="/" className="btn btn-secondary btn-lg">
                    <FiPlay /> {t('landing.ctaBrowse')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
