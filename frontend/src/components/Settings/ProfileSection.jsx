import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MdCheckCircle, MdErrorOutline } from 'react-icons/md';
import { useAuth } from '../../context/useAuth';
import userApi from '../../api/userApi';
import { formatDate } from '../../utils/format';

const USERNAME_MIN = 3;
const USERNAME_MAX = 30;
const DISPLAY_NAME_MAX = 50;
const DESCRIPTION_MAX = 1000;

/**
 * Edit the username, display name and channel description.
 *
 * The server allows two username changes in fourteen days; the allowance is
 * read when the section opens and after every save, and the username field is
 * locked with the date it frees up once both changes are used. Only the
 * fields that differ from the saved profile are sent.
 */
const ProfileSection = () => {
  const { t, i18n } = useTranslation();
  const { user, updateUser } = useAuth();
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState({ username: '', displayName: '', channelDescription: '' });
  const [allowance, setAllowance] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fill = (profile) => {
    const values = {
      username: profile.username || '',
      displayName: profile.displayName || '',
      channelDescription: profile.channelDescription || '',
    };
    setSaved(values);
    setForm(values);
  };

  useEffect(() => {
    let active = true;
    userApi
      .getOwnProfile()
      .then((res) => {
        if (!active) return;
        fill(res.data.data.user);
        setAllowance(res.data.data.username);
        setStatus('idle');
      })
      .catch(() => {
        if (!active) return;
        if (user) fill(user);
        setStatus('loadFailed');
      });
    return () => {
      active = false;
    };
    // Load once when the section opens; later changes come back from save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setMessage('');
    setError('');
  };

  const changes = saved
    ? Object.fromEntries(
        Object.entries(form).filter(([key, value]) => value.trim() !== saved[key].trim())
      )
    : {};
  const usernameLocked = allowance?.remaining === 0;
  const usernameTooShort = form.username.trim().length < USERNAME_MIN;
  const canSave = Object.keys(changes).length > 0 && !usernameTooShort && status !== 'saving';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setStatus('saving');
    setError('');
    setMessage('');
    try {
      const res = await userApi.updateProfile(changes);
      const { user: updated, username } = res.data.data;
      updateUser({ ...user, ...updated });
      fill(updated);
      setAllowance(username);
      setMessage(t('settings.profileSaved'));
    } catch (err) {
      setError(err.response?.data?.message || t('settings.profileFailed'));
    } finally {
      setStatus('idle');
    }
  };

  let usernameHelp = t('settings.usernameHelp');
  if (usernameLocked && allowance.resetsAt) {
    usernameHelp = t('settings.usernameLocked', { date: formatDate(i18n.resolvedLanguage, allowance.resetsAt) });
  } else if (allowance && allowance.remaining < 2) {
    usernameHelp = `${t('settings.usernameHelp')} ${t('settings.usernameChangesLeft', { count: allowance.remaining })}`;
  }

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">{t('settings.profileSection')}</h2>
      <form className="settings-section-body settings-profile-form" onSubmit={handleSubmit} noValidate>
        {status === 'loadFailed' && (
          <p className="field-error" role="alert">
            <MdErrorOutline aria-hidden="true" /> {t('settings.profileLoadFailed')}
          </p>
        )}

        <div>
          <label className={`studio-field ${usernameTooShort && form.username ? 'has-error' : ''}`}>
            <span className="studio-field-label">
              <span>{t('settings.usernameLabel')}</span>
              <span className="studio-field-counter">
                {form.username.length}/{USERNAME_MAX}
              </span>
            </span>
            <input
              type="text"
              value={form.username}
              onChange={set('username')}
              maxLength={USERNAME_MAX}
              disabled={status === 'loading' || usernameLocked}
              autoComplete="username"
              aria-describedby="settings-username-help"
            />
          </label>
          <p id="settings-username-help" className="field-help">
            {usernameHelp}
          </p>
        </div>

        <div>
          <label className="studio-field">
            <span className="studio-field-label">
              <span>{t('settings.displayNameLabel')}</span>
              <span className="studio-field-counter">
                {form.displayName.length}/{DISPLAY_NAME_MAX}
              </span>
            </span>
            <input
              type="text"
              value={form.displayName}
              onChange={set('displayName')}
              maxLength={DISPLAY_NAME_MAX}
              disabled={status === 'loading'}
              aria-describedby="settings-display-name-help"
            />
          </label>
          <p id="settings-display-name-help" className="field-help">
            {t('settings.displayNameHelp')}
          </p>
        </div>

        <label className="studio-field">
          <span className="studio-field-label">
            <span>{t('settings.channelDescriptionLabel')}</span>
            <span className="studio-field-counter">
              {form.channelDescription.length}/{DESCRIPTION_MAX}
            </span>
          </span>
          <textarea
            rows={4}
            value={form.channelDescription}
            onChange={set('channelDescription')}
            maxLength={DESCRIPTION_MAX}
            disabled={status === 'loading'}
          />
        </label>

        {error && (
          <p className="field-error" role="alert">
            <MdErrorOutline aria-hidden="true" /> {error}
          </p>
        )}
        {message && (
          <p className="settings-linked-status" role="status">
            <MdCheckCircle aria-hidden="true" /> {message}
          </p>
        )}

        <div className="settings-profile-actions">
          <button
            type="button"
            className="btn btn-plain"
            onClick={() => saved && setForm(saved)}
            disabled={Object.keys(changes).length === 0 || status === 'saving'}
          >
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canSave}>
            {status === 'saving' ? t('settings.savingProfile') : t('settings.saveProfile')}
          </button>
        </div>
      </form>
    </section>
  );
};

export default ProfileSection;
