import { useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdCheckCircle, MdErrorOutline, MdOutlineAccountCircle, MdOutlinePalette } from 'react-icons/md';
import Avatar from '../components/Common/Avatar';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/useTheme';
import userApi from '../api/userApi';
import GoogleSignInButton from '../components/Auth/GoogleSignInButton';
import { formatDate } from '../utils/format';
import './SettingsPage.css';

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

const TABS = [
  { key: 'account', icon: MdOutlineAccountCircle },
  { key: 'appearance', icon: MdOutlinePalette },
];

/** Tab "Tài khoản": ảnh đại diện, thông tin tài khoản, liên kết Google. */
const AccountTab = () => {
  const { t, i18n } = useTranslation();
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
      setAvatarError(err.response?.data?.message || t('settings.avatarFailed'));
    } finally {
      setUploading(false);
    }
  };

  const rows = [
    [t('settings.usernameLabel'), user?.username],
    [t('settings.displayNameLabel'), user?.displayName || user?.username],
    ['Email', user?.email],
    user?.createdAt && [t('settings.memberSince'), formatDate(i18n.resolvedLanguage, user.createdAt)],
  ].filter(Boolean);

  return (
    <>
      <header className="settings-head">
        <h1 className="settings-title">{t('settings.accountTitle')}</h1>
        <p className="settings-subtitle">{t('settings.accountSubtitle')}</p>
      </header>

      <section className="settings-section">
        <h2 className="settings-section-title">{t('settings.avatarSection')}</h2>
        <div className="settings-section-body">
          <div className="settings-avatar-row">
            <Avatar
              src={user?.avatar}
              className="settings-avatar"
              fallbackClassName="avatar-placeholder settings-avatar"
            >
              {user?.username?.charAt(0).toUpperCase() || '?'}
            </Avatar>
            <div>
              <button
                type="button"
                className="btn btn-ghost settings-avatar-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? t('settings.uploadingAvatar') : t('settings.changeAvatar')}
              </button>
              <p className="field-help">{t('settings.avatarHint')}</p>
              {avatarError && (
                <p className="field-error" role="alert">
                  <MdErrorOutline aria-hidden="true" /> {avatarError}
                </p>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarFileChange}
              hidden
            />
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">{t('settings.accountSection')}</h2>
        <dl className="settings-section-body settings-info-list">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          <div>
            <dt>{t('settings.channelLabel')}</dt>
            <dd>
              <Link to={`/channel/${user?._id}`} className="settings-link">
                {t('nav.viewChannel')}
              </Link>
            </dd>
          </div>
        </dl>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">{t('settings.googleSection')}</h2>
        <div className="settings-section-body">
          {user?.googleId ? (
            <p className="settings-linked-status">
              <MdCheckCircle aria-hidden="true" /> {t('settings.googleLinked', { email: user.email })}
            </p>
          ) : (
            <>
              <p className="settings-desc">{t('settings.googleHint', { email: user?.email })}</p>
              {error && (
                <p className="field-error" role="alert">
                  <MdErrorOutline aria-hidden="true" /> {error}
                </p>
              )}
              {success && (
                <p className="settings-linked-status">
                  <MdCheckCircle aria-hidden="true" /> {success}
                </p>
              )}
              <GoogleSignInButton text="signin_with" onCredential={handleLinkCredential} onError={setError} />
            </>
          )}
        </div>
      </section>
    </>
  );
};

/**
 * Tab "Giao diện": chủ đề và ngôn ngữ. Thay đổi áp dụng ngay nên không có nút
 * Lưu. Menu ảnh đại diện trên thanh trên vẫn giữ lối tắt, cả hai dùng chung
 * một trạng thái (ThemeContext và i18next).
 */
const AppearanceTab = () => {
  const { t, i18n } = useTranslation();
  const { preference, setPreference } = useTheme();

  return (
    <>
      <header className="settings-head">
        <h1 className="settings-title">{t('settings.appearanceTitle')}</h1>
        <p className="settings-subtitle">{t('settings.appearanceSubtitle')}</p>
      </header>

      <section className="settings-section">
        <h2 className="settings-section-title">{t('settings.themeSection')}</h2>
        <div className="settings-section-body">
          <fieldset className="settings-radio-list">
            <legend className="visually-hidden">{t('settings.themeSection')}</legend>
            {['system', 'dark', 'light'].map((mode) => (
              <label key={mode} className="settings-radio">
                <input
                  type="radio"
                  name="theme"
                  value={mode}
                  checked={preference === mode}
                  onChange={() => setPreference(mode)}
                />
                <span>{t(`settings.theme.${mode}`)}</span>
              </label>
            ))}
          </fieldset>
          <p className="field-help">{t('settings.themeHelp')}</p>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">{t('settings.languageSection')}</h2>
        <div className="settings-section-body">
          <label className="studio-field settings-select">
            <span className="studio-field-label">{t('language.label')}</span>
            <select
              value={i18n.resolvedLanguage}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
            >
              <option value="vi">{t('language.vi')}</option>
              <option value="en">{t('language.en')}</option>
            </select>
          </label>
          <p className="field-help">{t('settings.languageHelp')}</p>
        </div>
      </section>
    </>
  );
};

const SettingsPage = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'appearance' ? 'appearance' : 'account';

  const selectTab = (key) => {
    const next = new URLSearchParams(searchParams);
    if (key === 'account') next.delete('tab');
    else next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="settings-page">
      <nav className="settings-nav" aria-label={t('settings.navLabel')}>
        <p className="settings-nav-title">{t('nav.settings')}</p>
        {TABS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className="guide-item settings-nav-item"
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => selectTab(key)}
          >
            <Icon className="guide-icon" aria-hidden="true" />
            <span className="guide-label">{t(`settings.tabs.${key}`)}</span>
          </button>
        ))}
      </nav>

      <div className="settings-content">{tab === 'appearance' ? <AppearanceTab /> : <AccountTab />}</div>
    </div>
  );
};

export default SettingsPage;
