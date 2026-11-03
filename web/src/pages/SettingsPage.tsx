/**
 * Settings: channel (avatar, banner, name, @handle, description, upload e-mails), security
 * (password, Google, sign out everywhere), memberships (tiers and members) and appearance.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdCheckCircle, MdDeleteOutline, MdErrorOutline, MdOutlineAccountCircle, MdOutlineCardMembership, MdOutlineLock, MdOutlinePalette } from 'react-icons/md';
import type { IconType } from 'react-icons';
import { auth, channels, me } from '../api/endpoints';
import type { Membership, Tier } from '../api/types';
import { useAuth } from '../context/auth';
import { useTheme, type ThemePreference } from '../context/theme';
import Avatar from '../components/Common/Avatar';
import { ConfirmDialog } from '../components/Common/Dialogs';
import { useToast } from '../components/Common/Toast';
import { ResendVerificationButton } from '../components/Auth/EmailVerification';
import GoogleSignInButton from '../components/Auth/GoogleSignInButton';
import { errorText } from '../lib/errors';
import { ImageRejected, uploadImage } from '../lib/images';
import './SettingsPage.css';
import './StudioPages.css';

const TABS = ['channel', 'security', 'memberships', 'appearance'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON = new Map<Tab, IconType>([['channel', MdOutlineAccountCircle], ['security', MdOutlineLock], ['memberships', MdOutlineCardMembership], ['appearance', MdOutlinePalette]]);

export default function SettingsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = TABS.find((x) => x === raw) ?? 'channel';
  const [toast, showToast] = useToast();
  return (
    <div className="settings-page">
      <nav className="settings-nav" aria-label={t('settings.navLabel')}>
        <p className="settings-nav-title">{t('nav.settings')}</p>
        {TABS.map((x) => {
          const Icon = TAB_ICON.get(x) ?? MdOutlineAccountCircle;
          return (
            <button key={x} type="button" className="guide-item settings-nav-item" aria-current={tab === x ? 'page' : undefined} onClick={() => setParams({ tab: x })}>
              <Icon className="guide-icon" aria-hidden="true" /><span className="guide-label">{t(`prefs.tabs.${x}`)}</span>
            </button>
          );
        })}
      </nav>
      <div className="settings-content">
        {tab === 'channel' && <ChannelTab notify={showToast} />}
        {tab === 'security' && <SecurityTab notify={showToast} />}
        {tab === 'memberships' && <MembershipsTab notify={showToast} />}
        {tab === 'appearance' && <AppearanceTab />}
      </div>
      {toast}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="settings-section"><h2 className="settings-section-title">{title}</h2><div className="settings-section-body">{children}</div></section>;
}

function ChannelTab({ notify }: { notify: (s: string) => void }) {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({ displayName: user?.displayName ?? '', handle: user?.handle ?? '', description: user?.description ?? '', notifyByEmail: user?.notifyByEmail ?? true });
  const [busy, setBusy] = useState<'save' | 'avatar' | 'banner' | null>(null);
  const [error, setError] = useState('');
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  if (!user) return null;

  const imageError = (err: unknown) => {
    if (err instanceof ImageRejected) return t(err.reason === 'type' ? 'prefs.imageType' : 'prefs.imageSize');
    return errorText(t, err);
  };
  const changeImage = async (kind: 'avatar' | 'banner', file: File | undefined) => {
    if (!file) return;
    setBusy(kind);
    try {
      const id = await uploadImage(file);
      const r = kind === 'avatar' ? await me.avatar(id) : await me.banner(id);
      updateUser(r.user);
      notify(t('prefs.imageSaved'));
    } catch (err) {
      notify(imageError(err));
    } finally {
      setBusy(null);
    }
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('save');
    setError('');
    try {
      const patch: Record<string, unknown> = {};
      if (form.displayName !== user.displayName) patch['displayName'] = form.displayName.trim();
      if (form.handle !== user.handle) patch['handle'] = form.handle.trim().replace(/^@/, '').toLowerCase();
      if (form.description !== user.description) patch['description'] = form.description;
      if (form.notifyByEmail !== user.notifyByEmail) patch['notifyByEmail'] = form.notifyByEmail;
      const r = await me.profile(patch);
      updateUser(r.user);
      notify(t('prefs.saved'));
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <header className="settings-head"><h1 className="settings-title">{t('prefs.channelTitle')}</h1><p className="settings-subtitle">{t('prefs.channelSubtitle')}</p></header>
      <Section title={t('settings.avatarSection')}>
        <div className="settings-avatar-row">
          <Avatar src={user.avatar} className="settings-avatar" fallbackClassName="avatar-placeholder settings-avatar">{user.displayName.charAt(0).toUpperCase()}</Avatar>
          <div>
            <button type="button" className="btn btn-secondary settings-avatar-btn" disabled={busy !== null} onClick={() => avatarInput.current?.click()}>{busy === 'avatar' ? t('common.loading') : t('prefs.changeAvatar')}</button>
            <p className="settings-desc">{t('prefs.imageHint')}</p>
          </div>
          <input ref={avatarInput} type="file" accept="image/jpeg,image/png" hidden onChange={(e) => void changeImage('avatar', e.target.files?.[0])} />
        </div>
      </Section>
      <Section title={t('prefs.bannerSection')}>
        {user.banner && <img src={user.banner} alt="" className="settings-banner-preview" />}
        <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => bannerInput.current?.click()}>{busy === 'banner' ? t('common.loading') : t('prefs.changeBanner')}</button>
        <input ref={bannerInput} type="file" accept="image/jpeg,image/png" hidden onChange={(e) => void changeImage('banner', e.target.files?.[0])} />
      </Section>
      <Section title={t('prefs.profileSection')}>
        <form className="settings-profile-form" onSubmit={(e) => void save(e)}>
          {error && <p className="field-error" role="alert"><MdErrorOutline aria-hidden="true" /> {error}</p>}
          <label className="studio-field"><span className="studio-field-label">{t('auth.displayNameLabel')}</span><input value={form.displayName} maxLength={50} required onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label>
          <label className="studio-field"><span className="studio-field-label">{t('auth.usernameLabel')}</span><input value={form.handle} maxLength={31} required onChange={(e) => setForm({ ...form, handle: e.target.value })} /></label>
          <p className="field-help">{t('prefs.handleHelp')}</p>
          <label className="studio-field"><span className="studio-field-label">{t('channel.description')}</span><textarea rows={4} value={form.description} maxLength={1000} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label className="studio-checkbox-field"><input type="checkbox" checked={form.notifyByEmail} onChange={(e) => setForm({ ...form, notifyByEmail: e.target.checked })} /><span><span className="studio-checkbox-title">{t('prefs.notifyByEmail')}</span><span className="field-help">{t('prefs.notifyByEmailHelp')}</span></span></label>
          <div className="settings-profile-actions">
            <Link to={`/@${user.handle}`} className="btn btn-ghost">{t('nav.viewChannel')}</Link>
            <button type="submit" className="btn btn-primary" disabled={busy !== null}>{busy === 'save' ? t('common.loading') : t('prefs.save')}</button>
          </div>
        </form>
      </Section>
      <Section title={t('verify.statusLabel')}>
        {user.emailVerified
          ? <p className="settings-linked-status"><MdCheckCircle aria-hidden="true" /> {t('verify.statusVerified')} · {user.email}</p>
          : <><p className="settings-desc">{t('verify.statusUnverified')}</p><ResendVerificationButton /></>}
      </Section>
    </>
  );
}

function SecurityTab({ notify }: { notify: (s: string) => void }) {
  const { t } = useTranslation();
  const { user, adopt, linkGoogle, logout } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  if (!user) return null;

  const change = async (e: FormEvent) => {
    e.preventDefault();
    if (form.next !== form.confirm) { setError(t('auth.passwordMismatch')); return; }
    setBusy(true);
    setError('');
    try {
      adopt(await auth.changePassword({ ...(user.hasPassword ? { currentPassword: form.current } : {}), newPassword: form.next }));
      setForm({ current: '', next: '', confirm: '' });
      notify(t('prefs.passwordChanged'));
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="settings-head"><h1 className="settings-title">{t('prefs.securityTitle')}</h1></header>
      <Section title={user.hasPassword ? t('prefs.changePassword') : t('prefs.setPassword')}>
        <form className="settings-profile-form" onSubmit={(e) => void change(e)}>
          {error && <p className="field-error" role="alert"><MdErrorOutline aria-hidden="true" /> {error}</p>}
          {user.hasPassword && <label className="studio-field"><span className="studio-field-label">{t('prefs.currentPassword')}</span><input type="password" autoComplete="current-password" value={form.current} required onChange={(e) => setForm({ ...form, current: e.target.value })} /></label>}
          <label className="studio-field"><span className="studio-field-label">{t('auth.newPasswordLabel')}</span><input type="password" autoComplete="new-password" minLength={8} value={form.next} required onChange={(e) => setForm({ ...form, next: e.target.value })} /></label>
          <label className="studio-field"><span className="studio-field-label">{t('auth.confirmNewPasswordLabel')}</span><input type="password" autoComplete="new-password" minLength={8} value={form.confirm} required onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></label>
          <p className="field-help">{t('auth.passwordHint')}</p>
          <div className="settings-profile-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{t('prefs.save')}</button></div>
        </form>
      </Section>
      <Section title={t('settings.googleSection')}>
        {user.googleLinked
          ? <p className="settings-linked-status"><MdCheckCircle aria-hidden="true" /> {t('prefs.googleLinked')}</p>
          : <><p className="settings-desc">{t('settings.googleHint', { email: user.email })}</p><GoogleSignInButton text="continue_with" onCredential={async (c) => { await linkGoogle(c); notify(t('prefs.googleLinked')); }} onError={notify} /></>}
      </Section>
      <Section title={t('prefs.signOutEverywhere')}>
        <p className="settings-desc">{t('prefs.signOutEverywhereHelp')}</p>
        <button type="button" className="btn btn-secondary" onClick={() => setConfirmLogout(true)}>{t('prefs.signOutEverywhere')}</button>
      </Section>
      {confirmLogout && <ConfirmDialog title={t('prefs.signOutEverywhere')} message={t('prefs.signOutEverywhereHelp')} confirmLabel={t('nav.logout')} onClose={() => setConfirmLogout(false)} onConfirm={logout} />}
    </>
  );
}

function MembershipsTab({ notify }: { notify: (s: string) => void }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [members, setMembers] = useState<(Membership & { member: { id: string; name: string; handle: string; avatar: string | null } | null })[]>([]);
  const [form, setForm] = useState({ name: '', price: '29000', level: '1', perks: '', description: '' });
  const [removing, setRemoving] = useState<Tier | null>(null);
  const locale = i18n.resolvedLanguage === 'en' ? 'en-US' : 'vi-VN';

  useEffect(() => {
    if (!user) return;
    channels.get(user.id).then((c) => setTiers(c.tiers)).catch(() => undefined);
    me.members().then((r) => setMembers(r.items)).catch(() => undefined);
  }, [user]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { tier } = await me.tiers.create({ name: form.name.trim(), price: Number(form.price), level: Number(form.level), perks: form.perks.split('\n').map((x) => x.trim()).filter(Boolean), description: form.description, badgeColor: '#10a37f' });
      setTiers((list) => [...list.filter((x) => x.id !== tier.id), tier].sort((a, b) => a.level - b.level));
      setForm({ name: '', price: '29000', level: String(Math.min(5, Number(form.level) + 1)), perks: '', description: '' });
      notify(t('prefs.tierCreated'));
    } catch (err) {
      notify(errorText(t, err));
    }
  };

  return (
    <>
      <header className="settings-head"><h1 className="settings-title">{t('prefs.membershipsTitle')}</h1><p className="settings-subtitle">{t('membership.sandboxNote')}</p></header>
      <Section title={t('prefs.tiers')}>
        {tiers.length === 0 ? <p className="settings-desc">{t('membership.notOffered')}</p> : (
          <ul className="studio-list">
            {tiers.map((x) => (
              <li key={x.id} className="studio-list-row">
                <span><strong>{x.name}</strong> · {t('prefs.level', { level: x.level })} · {x.price.toLocaleString(locale)} ₫/{t('membership.month')}</span>
                <button type="button" className="btn-icon" aria-label={t('prefs.retireTier')} onClick={() => setRemoving(x)}><MdDeleteOutline /></button>
              </li>
            ))}
          </ul>
        )}
        {tiers.length < 5 && (
          <form className="settings-profile-form studio-inline-form" onSubmit={(e) => void create(e)}>
            <label className="studio-field"><span className="studio-field-label">{t('prefs.tierName')}</span><input value={form.name} maxLength={50} required onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="studio-field"><span className="studio-field-label">{t('prefs.tierPrice')}</span><input type="number" min={0} step={1000} value={form.price} required onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
            <label className="studio-field"><span className="studio-field-label">{t('prefs.tierLevel')}</span><input type="number" min={1} max={5} value={form.level} required onChange={(e) => setForm({ ...form, level: e.target.value })} /></label>
            <label className="studio-field"><span className="studio-field-label">{t('membership.perks')}</span><textarea rows={3} value={form.perks} placeholder={t('prefs.perksHint')} onChange={(e) => setForm({ ...form, perks: e.target.value })} /></label>
            <div className="settings-profile-actions"><button type="submit" className="btn btn-primary">{t('prefs.addTier')}</button></div>
          </form>
        )}
      </Section>
      <Section title={t('prefs.members', { count: members.length })}>
        {members.length === 0 ? <p className="settings-desc">{t('prefs.noMembers')}</p> : (
          <ul className="studio-list">
            {members.map((m) => (
              <li key={m.member?.id ?? m.tierId} className="studio-list-row">
                <span>{m.member ? <Link to={`/@${m.member.handle}`}>{m.member.name}</Link> : '?'} · {tiers.find((x) => x.id === m.tierId)?.name ?? t('prefs.level', { level: m.level })}</span>
                <span className="settings-desc">{t('membership.expiresOn', { date: new Date(m.expiresAt).toLocaleDateString(locale) })}{m.cancelled ? ` · ${t('prefs.cancelled')}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {removing && (
        <ConfirmDialog title={t('prefs.retireTier')} message={t('prefs.retireTierHelp', { name: removing.name })} confirmLabel={t('prefs.retireTier')} danger onClose={() => setRemoving(null)}
          onConfirm={async () => { await me.tiers.remove(removing.id); setTiers((list) => list.filter((x) => x.id !== removing.id)); setRemoving(null); }} />
      )}
    </>
  );
}

function AppearanceTab() {
  const { t, i18n } = useTranslation();
  const { preference, setPreference } = useTheme();
  return (
    <>
      <header className="settings-head"><h1 className="settings-title">{t('settings.appearanceTitle')}</h1><p className="settings-subtitle">{t('settings.appearanceSubtitle')}</p></header>
      <Section title={t('settings.themeSection')}>
        <fieldset className="settings-radio-list">
          {(['system', 'light', 'dark'] as ThemePreference[]).map((mode) => (
            <label key={mode} className="settings-radio"><input type="radio" name="theme" checked={preference === mode} onChange={() => setPreference(mode)} /><span>{t(`settings.theme.${mode}`)}</span></label>
          ))}
        </fieldset>
      </Section>
      <Section title={t('settings.languageSection')}>
        <select className="settings-select" value={i18n.resolvedLanguage} onChange={(e) => void i18n.changeLanguage(e.target.value)} aria-label={t('language.label')}>
          <option value="vi">{t('language.vi')}</option>
          <option value="en">{t('language.en')}</option>
        </select>
      </Section>
    </>
  );
}
