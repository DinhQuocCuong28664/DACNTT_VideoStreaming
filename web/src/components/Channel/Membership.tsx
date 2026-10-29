import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdCheck, MdClose, MdErrorOutline, MdSecurity, MdStars } from 'react-icons/md';
import { channels } from '../../api/endpoints';
import type { Membership, Tier } from '../../api/types';
import { useAuth } from '../../context/auth';
import { errorText } from '../../lib/errors';
import Avatar from '../Common/Avatar';
import { Modal } from '../Common/Dialogs';
import './MembershipModal.css';
import './JoinButton.css';

interface ChannelInfo { id: string; name: string; avatar: string | null }

/**
 * Tier picker with a sandbox checkout (nothing is charged): join, switch tier (keeps the paid
 * period) or cancel (runs to the end of the period).
 */
export function MembershipModal({ channel, tiers, membership, onClose, onChange, notify }: {
  channel: ChannelInfo; tiers: Tier[]; membership: Membership | null; onClose: () => void;
  onChange: (m: Membership) => void; notify: (text: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState(membership?.tierId ?? tiers[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tier = tiers.find((x) => x.id === selected);
  const active = membership && !membership.cancelled;
  const locale = i18n.resolvedLanguage === 'en' ? 'en-US' : 'vi-VN';

  const run = async (action: () => Promise<{ membership: Membership }>, done: string) => {
    setBusy(true);
    setError('');
    try {
      const r = await action();
      onChange(r.membership);
      notify(done);
      onClose();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} busy={busy} labelledBy="membership-title" className="yt-modal-container">
      <div className="yt-membership-dialog">
        <header className="yt-membership-header">
          <h2 id="membership-title" className="yt-membership-title">{t('membership.joinTitle')}</h2>
          <button type="button" className="yt-membership-close" onClick={onClose} aria-label={t('common.close')} disabled={busy}><MdClose /></button>
        </header>
        <div className="yt-membership-body">
          <div className="yt-member-channel-info">
            <Avatar src={channel.avatar} className="yt-member-channel-avatar" fallbackClassName="yt-member-channel-avatar avatar-placeholder">{channel.name.charAt(0).toUpperCase()}</Avatar>
            <div><h3 className="yt-member-channel-name">{channel.name}</h3><p className="yt-member-channel-sub">{t('membership.joinSubtitle')}</p></div>
          </div>
          {membership && (
            <div className="yt-active-membership-banner">
              <div className="yt-active-badge-row"><MdStars /><span>{t('membership.activeMember')}: {tiers.find((x) => x.id === membership.tierId)?.name ?? t('membership.member')}</span></div>
              <p className="yt-active-expiry">{t('membership.expiresOn', { date: new Date(membership.expiresAt).toLocaleDateString(locale) })}</p>
            </div>
          )}
          {tiers.length === 0 ? <p className="yt-tier-desc yt-tier-empty">{t('membership.notOffered')}</p> : tiers.map((x) => (
            <button key={x.id} type="button" className={`yt-tier-card ${x.id === selected ? 'selected' : ''}`} onClick={() => setSelected(x.id)} aria-pressed={x.id === selected}>
              <div className="yt-tier-card-header">
                <div className="yt-tier-name-wrapper">
                  <h4 className="yt-tier-name">{x.name}</h4>
                  <span className="yt-tier-badge" style={{ backgroundColor: x.badgeColor }}><MdStars />{t('membership.member')}</span>
                </div>
              </div>
              <div className="yt-tier-price">{x.price.toLocaleString(locale)} ₫<span>/{t('membership.month')}</span></div>
              {x.description && <p className="yt-tier-desc">{x.description}</p>}
              <div className="yt-perks-heading">{t('membership.perks')}</div>
              <ul className="yt-perks-list">
                {(x.perks.length ? x.perks : [t('membership.badgePerk'), t('membership.exclusiveVideos')]).map((p) => <li key={p} className="yt-perk-item"><MdCheck className="yt-perk-icon" /><span>{p}</span></li>)}
              </ul>
            </button>
          ))}
        </div>
        <footer className="yt-membership-footer">
          {error && <p className="field-error" role="alert"><MdErrorOutline aria-hidden="true" /> {error}</p>}
          {tier && (!active || membership?.tierId !== tier.id) && (
            <button type="button" className="yt-btn-checkout" disabled={busy}
              onClick={() => void run(() => channels.join(channel.id, tier.id), t('membership.joinSuccess', { name: channel.name }))}>
              <MdSecurity /><span>{busy ? t('common.loading') : `${t('membership.sandboxCheckout')} (${tier.price.toLocaleString(locale)} ₫)`}</span>
            </button>
          )}
          {active && (
            <button type="button" className="yt-btn-cancel-membership" disabled={busy} onClick={() => void run(() => channels.cancel(channel.id), t('membership.cancelSuccess'))}>
              {busy ? t('common.loading') : t('membership.cancelMembership')}
            </button>
          )}
          <p className="yt-sandbox-notice">{t('membership.sandboxNote')}</p>
        </footer>
      </div>
    </Modal>
  );
}

/** "Join" or "Member" pill that opens the tier picker; hidden when the channel has no tiers. */
export function JoinButton({ channel, tiers, membership, onChange, notify }: {
  channel: ChannelInfo; tiers: Tier[]; membership: Membership | null; onChange: (m: Membership) => void; notify: (text: string) => void;
}) {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  if (tiers.length === 0 || user?.id === channel.id) return null;
  const isMember = Boolean(membership && new Date(membership.expiresAt) > new Date());
  return (
    <div className="yt-join-wrapper">
      <button type="button" className={`yt-join-btn ${isMember ? 'is-member' : ''}`} title={isMember ? t('membership.member') : t('membership.join')}
        onClick={() => (isAuthenticated ? setOpen(true) : navigate('/login', { state: { from: location.pathname } }))}>
        {isMember ? <><MdStars className="yt-join-star" /><span>{t('membership.member')}</span></> : <span>{t('membership.join')}</span>}
      </button>
      {open && <MembershipModal channel={channel} tiers={tiers} membership={membership} onClose={() => setOpen(false)} onChange={onChange} notify={notify} />}
    </div>
  );
}
