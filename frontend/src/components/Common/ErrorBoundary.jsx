import { Component } from 'react';
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
    console.error('Lỗi render không bắt được:', error, info?.componentStack);
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

          <h1 className="eb-title">Đã có lỗi xảy ra</h1>
          <p className="eb-message">
            Giao diện gặp sự cố ngoài dự kiến nên không hiển thị tiếp được.
            Lỗi này nằm ở phía trình duyệt, video và dữ liệu của bạn không bị
            ảnh hưởng.
          </p>

          <div className="eb-actions">
            <button type="button" className="btn btn-primary" onClick={this.handleReload}>
              Về trang chủ
            </button>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Tải lại trang
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

export default ErrorBoundary;
