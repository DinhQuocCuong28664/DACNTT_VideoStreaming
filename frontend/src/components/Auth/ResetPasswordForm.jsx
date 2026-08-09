import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import authApi from '../../api/authApi';
import './AuthForm.css';

const ResetPasswordForm = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await authApi.resetPassword(token, formData.password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(
        err.response?.data?.message || 'Liên kết không hợp lệ hoặc đã hết hạn.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-icon">▶</div>
          <span className="logo-text">VidShare</span>
        </div>
        <h1 className="auth-title">Đặt lại mật khẩu</h1>
        <p className="auth-subtitle">Nhập mật khẩu mới cho tài khoản của bạn</p>

        {error && <div className="auth-error">{error}</div>}

        {done ? (
          <div className="auth-error" style={{ background: 'rgba(0, 206, 201, 0.1)', borderColor: 'rgba(0, 206, 201, 0.25)', color: 'var(--text-primary)' }}>
            Đặt lại mật khẩu thành công! Đang chuyển đến trang đăng nhập...
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="label" htmlFor="password">Mật khẩu mới</label>
              <input
                id="password"
                name="password"
                type="password"
                className="input"
                placeholder="Tối thiểu 6 ký tự"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={6}
              />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="confirmPassword">Xác nhận mật khẩu mới</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                className="input"
                placeholder="Nhập lại mật khẩu mới"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                minLength={6}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
            </button>
          </form>
        )}

        <p className="auth-footer">
          <Link to="/login">← Quay lại đăng nhập</Link>
        </p>
      </div>
    </div>
  );
};

export default ResetPasswordForm;
