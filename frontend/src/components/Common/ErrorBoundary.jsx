import { Component } from 'react';
import { withTranslation } from 'react-i18next';
import LogoIcon from '../Layout/LogoIcon';
import './ErrorBoundary.css';

/**
 * Bắt lỗi render trong toàn bộ cây component.
 *
 * Không có lớp này, một lỗi ném ra khi render sẽ khiến React gỡ bỏ toàn bộ cây
 * và để lại một trang trắng hoàn toàn — không thông báo, không đường quay lại,
 * và người dùng không biết chuyện gì đã xảy ra. Ứng dụng đã có trang 403 và 404
 * được thiết kế tử tế, nên để lỗi thật hiện ra dưới dạng màn hình trắng là chỗ
 * hụt duy nhất trong cách xử lý lỗi của giao diện.
 *
 * Phải là component lớp: React chưa có hook tương đương cho error boundary.
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

  handleReload = () => {
    window.location.assign('/');
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="eb-page">
        <div className="eb-card">
          <div className="eb-brand">
            <LogoIcon />
            <span>VidShare</span>
          </div>

          <h1 className="eb-title">{this.props.t('errorBoundary.title')}</h1>
          <p className="eb-message">
            {this.props.t('errorBoundary.body')}
          </p>

          <div className="eb-actions">
            <button type="button" className="btn btn-primary" onClick={this.handleReload}>
              {this.props.t('errorBoundary.home')}
            </button>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              {this.props.t('errorBoundary.reload')}
            </button>
          </div>

          {/* Chi tiết kỹ thuật chỉ hiện khi chạy dev — người dùng cuối không
              làm gì được với nó, còn khi phát triển thì đây là thứ cần nhất. */}
          {import.meta.env.DEV && this.state.error && (
            <pre className="eb-detail">{String(this.state.error?.stack || this.state.error)}</pre>
          )}
        </div>
      </div>
    );
  }
}

// withTranslation cấp prop `t` cho component lớp, vì error boundary bắt buộc
// phải là lớp và do đó không dùng được hook useTranslation.
const TranslatedErrorBoundary = withTranslation()(ErrorBoundary);

export default TranslatedErrorBoundary;
