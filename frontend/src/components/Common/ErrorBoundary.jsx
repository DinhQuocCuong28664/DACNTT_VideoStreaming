import { Component } from 'react';
import { withTranslation } from 'react-i18next';
import { MdErrorOutline } from 'react-icons/md';
import LogoIcon from '../Layout/LogoIcon';
import '../Layout/Logo.css';
import './ErrorBoundary.css';

/**
 * Bắt lỗi render trong toàn bộ cây component.
 *
 * Không có lớp này, một lỗi ném ra khi render sẽ khiến React gỡ bỏ toàn bộ cây
 * và để lại một trang trắng hoàn toàn — không thông báo, không đường quay lại,
 * và người dùng không biết chuyện gì đã xảy ra.
 *
 * Phải là component lớp: React chưa có hook tương đương cho error boundary.
 * Lớp này nằm ngoài Router nên không dùng được <Link> hay component Logo; logo
 * được dựng lại bằng thẻ <a> thường.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Giữ lại trong console để còn lần ra được khi người dùng báo lỗi.
    console.error('Uncaught render error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const { t } = this.props;

    return (
      <div className="status-page">
        <header className="status-topbar">
          <a href="/" className="brand-logo" aria-label="VidShare">
            <span className="brand-logo-tile">
              <LogoIcon size={18} />
            </span>
            <span className="brand-logo-text">VidShare</span>
          </a>
        </header>

        <main className="status-content">
          <MdErrorOutline className="status-icon" aria-hidden="true" />
          <h1 className="status-message">{t('errorBoundary.title')}</h1>
          <p className="status-submessage">{t('errorBoundary.body')}</p>

          <div className="status-actions">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              {t('errorBoundary.reload')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => window.location.assign('/')}>
              {t('errorBoundary.home')}
            </button>
          </div>

          {/* Chi tiết kỹ thuật chỉ hiện khi chạy dev — người dùng cuối không
              làm gì được với nó, còn khi phát triển thì đây là thứ cần nhất. */}
          {import.meta.env.DEV && this.state.error && (
            <details className="eb-details">
              <summary>{t('errorBoundary.details')}</summary>
              <pre>{String(this.state.error?.stack || this.state.error)}</pre>
            </details>
          )}
        </main>
      </div>
    );
  }
}

// withTranslation cấp prop `t` cho component lớp, vì error boundary bắt buộc
// phải là lớp và do đó không dùng được hook useTranslation.
const TranslatedErrorBoundary = withTranslation()(ErrorBoundary);

export default TranslatedErrorBoundary;
