import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MdOutlineFileUpload,
  MdOutlineMemory,
  MdOutlinePublic,
  MdPlayCircleOutline,
  MdOutlineHd,
  MdOutlineCloudQueue,
  MdOutlineAccountTree,
  MdOutlineLock,
  MdOutlineDarkMode,
  MdOutlineVerifiedUser,
} from 'react-icons/md';
import useRevealOnScroll from '../hooks/useRevealOnScroll';
import './LandingPage.css';

/**
 * Số liệu lấy từ báo cáo, không làm tròn cho đẹp:
 * - 90.7%: mức tiết kiệm docs/FINOPS_COST_ANALYSIS.md khuyến nghị trích dẫn
 *   (tính cả CloudFront ở hai vế); 98.87% chỉ là phần compute + lưu trữ.
 * - 110 ms: trung vị TTFF qua CloudFront edge SGN50, bảng tab:ttff-cloudfront
 *   ở chương 6.
 */
const STATS = [
  { value: '90.7%', label: 'landing.statCostLabel', desc: 'landing.statCostDesc' },
  { value: '110 ms', label: 'landing.statTtffLabel', desc: 'landing.statCdnDesc' },
  { value: '360p - 1080p', label: 'landing.statAbrLabel', desc: 'landing.statAbrDesc' },
  { value: '100%', label: 'landing.statCicdLabel', desc: 'landing.statCicdDesc' },
];

const STEPS = [
  { icon: MdOutlineFileUpload, title: 'landing.step1Title', desc: 'landing.archStep1' },
  { icon: MdOutlineMemory, title: 'landing.step2Title', desc: 'landing.archStep3' },
  { icon: MdOutlinePublic, title: 'landing.step3Title', desc: 'landing.archStep4' },
  { icon: MdPlayCircleOutline, title: 'landing.step4Title', desc: 'landing.step4Desc' },
];

const FEATURES = [
  { icon: MdOutlineHd, title: 'landing.featureHlsTitle', desc: 'landing.featureHlsDesc' },
  { icon: MdOutlineCloudQueue, title: 'landing.featureScaleTitle', desc: 'landing.featureScaleDesc' },
  { icon: MdOutlineAccountTree, title: 'landing.featureEventTitle', desc: 'landing.featureEventDesc' },
  { icon: MdOutlineLock, title: 'landing.featureCdnTitle', desc: 'landing.featureCdnDesc' },
  { icon: MdOutlineDarkMode, title: 'landing.featureThemeTitle', desc: 'landing.featureThemeDesc' },
  { icon: MdOutlineVerifiedUser, title: 'landing.featureCicdTitle', desc: 'landing.featureCicdDesc' },
];

/**
 * Trang giới thiệu dự án. Vẫn là trang tiếp thị, nhưng dùng cùng ngôn ngữ
 * phẳng, đơn sắc với phần còn lại của sản phẩm: nút viên thuốc đen, không
 * gradient, không hoạ tiết. Mỗi khu vực hiện dần một lần khi cuộn tới.
 */
const LandingPage = () => {
  const { t } = useTranslation();
  const pageRef = useRef(null);
  useRevealOnScroll(pageRef);

  return (
    <div className="landing" ref={pageRef}>
      {/* 1. Hero */}
      <section className="landing-hero">
        <h1 className="landing-hero-title">{t('landing.heroTitle')}</h1>
        <p className="landing-hero-subtitle">{t('landing.heroSubtitle')}</p>
        <div className="landing-hero-actions">
          <Link to="/" className="btn btn-primary btn-lg">
            {t('landing.heroExplore')}
          </Link>
          <Link to="/upload" className="btn btn-secondary btn-lg">
            {t('nav.uploadVideo')}
          </Link>
        </div>

        {/* Ảnh chụp thật trang danh mục đang chạy, không phải giao diện giả
            dựng bằng các thẻ div. */}
        <figure className="landing-shot">
          <img
            src="/preview-catalogue.jpg"
            alt={t('landing.previewAlt')}
            width="1280"
            height="720"
            fetchPriority="high"
          />
        </figure>
      </section>

      {/* 2. Số liệu */}
      <section className="landing-stats" data-reveal-stagger>
        {STATS.map((s) => (
          <div key={s.label} className="landing-stat">
            <p className="landing-stat-value tabular-nums">{s.value}</p>
            <p className="landing-stat-label">{t(s.label)}</p>
            <p className="landing-stat-desc">{t(s.desc)}</p>
          </div>
        ))}
      </section>

      {/* 3. Cách hoạt động */}
      <section className="landing-section" id="how-it-works">
        <header className="landing-section-head" data-reveal>
          <h2 className="landing-section-title">{t('landing.stepsTitle')}</h2>
          <p className="landing-section-subtitle">{t('landing.archSubtitle')}</p>
        </header>
        <ol className="landing-steps" data-reveal-stagger>
          {STEPS.map(({ icon: Icon, title, desc }, i) => (
            <li key={title} className="landing-step">
              <span className="landing-step-icon" aria-hidden="true">
                <Icon />
              </span>
              <h3 className="landing-step-title">
                <span className="landing-step-num">{i + 1}.</span> {t(title)}
              </h3>
              <p className="landing-step-desc">{t(desc)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 4. Tính năng */}
      <section className="landing-section" id="features">
        <header className="landing-section-head" data-reveal>
          <h2 className="landing-section-title">{t('landing.featuresTitle')}</h2>
          <p className="landing-section-subtitle">{t('landing.featuresSubtitle')}</p>
        </header>
        <div className="landing-features" data-reveal-stagger>
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <article key={title} className="landing-feature">
              <Icon className="landing-feature-icon" aria-hidden="true" />
              <h3 className="landing-feature-title">{t(title)}</h3>
              <p className="landing-feature-desc">{t(desc)}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 5. Kêu gọi hành động */}
      <section className="landing-cta" data-reveal>
        <h2 className="landing-cta-title">{t('landing.ctaTitle')}</h2>
        <p className="landing-cta-desc">{t('landing.ctaSubtitle')}</p>
        <div className="landing-hero-actions">
          <Link to="/register" className="btn btn-primary btn-lg">
            {t('landing.ctaRegister')}
          </Link>
          <Link to="/" className="btn btn-secondary btn-lg">
            {t('landing.heroExplore')}
          </Link>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
