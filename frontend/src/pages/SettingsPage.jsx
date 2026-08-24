import { useState, useRef } from 'react';
import { FiCheckCircle, FiCamera } from 'react-icons/fi';
import { useAuth } from '../context/useAuth';
import userApi from '../api/userApi';
import GoogleSignInButton from '../components/Auth/GoogleSignInButton';
import './SettingsPage.css';

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

const SettingsPage = () => {
  const { user, linkGoogleAccount, updateUser } = useAuth();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleLinkCredential = async (credential) => {
    setError('');
    setSuccess('');
    await linkGoogleAccount(credential);
    setSuccess('Đã liên kết tài khoản Google thành công.');
  };

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại đúng file đó lần sau nếu cần
    if (!file) return;

    setAvatarError('');

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setAvatarError('Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.');
      return;
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setAvatarError('Ảnh vượt quá dung lượng tối đa 5MB.');
      return;
    }

    setUploading(true);
    try {
      const presignRes = await userApi.presignAvatarUpload(file.name, file.type, file.size);
      const { uploadUrl, key } = presignRes.data.data;

      await userApi.uploadToS3(uploadUrl, file);

      const confirmRes = await userApi.updateAvatar(key);
      updateUser(confirmRes.data.data.user);
    } catch (err) {
      setAvatarError(
        err.response?.data?.message || 'Tải ảnh đại diện thất bại. Vui lòng thử lại.'
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container settings-page">
      <h1 className="settings-title">Cài đặt tài khoản</h1>

      <div className="card settings-card">
        <h2 className="settings-section-title">Ảnh đại diện</h2>

        <div className="settings-avatar-row">
          {user?.avatar ? (
            <img src={user.avatar} alt="" className="settings-avatar-preview" />
          ) : (
            <div className="avatar-placeholder settings-avatar-preview">
              {user?.username?.charAt(0).toUpperCase() || '?'}
            </div>
          )}

          <div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <FiCamera /> {uploading ? 'Đang tải lên...' : 'Đổi ảnh đại diện'}
            </button>
            <p className="settings-section-desc settings-avatar-hint">
              JPEG, PNG hoặc WebP, tối đa 5MB.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleAvatarFileChange}
            hidden
          />
        </div>

        {avatarError && <div className="settings-error">{avatarError}</div>}
      </div>

      <div className="card settings-card">
        <h2 className="settings-section-title">Thông tin tài khoản</h2>
        <dl className="settings-info-list">
          <div>
            <dt>Tên người dùng</dt>
            <dd>{user?.username}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
          </div>
        </dl>
      </div>

      <div className="card settings-card">
        <h2 className="settings-section-title">Đăng nhập bằng Google</h2>

        {user?.googleId ? (
          <p className="settings-linked-status">
            <FiCheckCircle /> Đã liên kết với tài khoản Google ({user.email})
          </p>
        ) : (
          <>
            <p className="settings-section-desc">
              Liên kết để có thể đăng nhập nhanh bằng Google thay vì mật khẩu,
              dùng đúng địa chỉ email hiện tại của bạn ({user?.email}).
            </p>
            {error && <div className="settings-error">{error}</div>}
            {success && <p className="settings-linked-status"><FiCheckCircle /> {success}</p>}
            <GoogleSignInButton
              text="signin_with"
              onCredential={handleLinkCredential}
              onError={setError}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
