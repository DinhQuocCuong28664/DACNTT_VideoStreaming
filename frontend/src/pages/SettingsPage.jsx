import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheckCircle, FiCamera } from 'react-icons/fi';
import { useAuth } from '../context/useAuth';
import userApi from '../api/userApi';
import GoogleSignInButton from '../components/Auth/GoogleSignInButton';
import './SettingsPage.css';

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

const SettingsPage = () => {
  const { t } = useTranslation();
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
    setSuccess(t('settings.googleLinkedNow'));
  };

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại đúng file đó lần sau nếu cần
    if (!file) return;

    setAvatarError('');

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setAvatarError(t('settings.avatarBadType'));
      return;
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setAvatarError(t('settings.avatarTooLarge'));
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
        err.response?.data?.message || t('settings.avatarFailed')
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container settings-page">
      <h1 className="settings-title">{t('settings.title')}</h1>

      <div className="card settings-card">
        <h2 className="settings-section-title">{t('settings.avatarSection')}</h2>

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
              <FiCamera /> {uploading ? t('settings.uploadingAvatar') : t('settings.changeAvatar')}
            </button>
            <p className="settings-section-desc settings-avatar-hint">
              {t('settings.avatarHint')}
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
        <h2 className="settings-section-title">{t('settings.accountSection')}</h2>
        <dl className="settings-info-list">
          <div>
            <dt>{t('settings.usernameLabel')}</dt>
            <dd>{user?.username}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
          </div>
        </dl>
      </div>

      <div className="card settings-card">
        <h2 className="settings-section-title">{t('settings.googleSection')}</h2>

        {user?.googleId ? (
          <p className="settings-linked-status">
            <FiCheckCircle /> {t('settings.googleLinked', { email: user.email })}
          </p>
        ) : (
          <>
            <p className="settings-section-desc">
              {t('settings.googleHint', { email: user?.email })}
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
