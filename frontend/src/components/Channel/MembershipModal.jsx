import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { MdClose, MdCheck, MdStars, MdSecurity } from 'react-icons/md';
import Modal from '../Common/Modal';
import { useAuth } from '../../context/useAuth';
import membershipApi from '../../api/membershipApi';
import useToast from '../Common/Toast';
import './MembershipModal.css';

/**
 * YouTube-style Channel Membership Modal.
 * Shows available tiers, perks, badge previews, and handles Sandbox checkout.
 */
const MembershipModal = ({
  channelId,
  channelName = '',
  channelAvatar = '',
  isMember = false,
  currentMembership = null,
  onClose,
  onStatusChange,
}) => {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [tiers, setTiers] = useState([]);
  const [selectedTierId, setSelectedTierId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let isMounted = true;
    membershipApi
      .getTiers(channelId)
      .then((res) => {
        if (!isMounted) return;
        const data = res.data?.data || [];
        setTiers(data);
        if (data.length > 0) {
          // Default selection to current tier if member, or first tier
          const currentTierId = currentMembership?.tier?._id || data[0]._id;
          setSelectedTierId(currentTierId);
        }
      })
      .catch((err) => {
        console.error('Failed to load membership tiers:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [channelId, currentMembership]);

  const selectedTier = tiers.find((t) => t._id === selectedTierId) || tiers[0];

  const handleJoin = async () => {
    if (!isAuthenticated) {
      onClose();
      navigate('/login', { state: { from: location.pathname } });
      return;
    }

    if (!selectedTier || actionBusy) return;
    setActionBusy(true);

    try {
      const res = await membershipApi.join(channelId, {
        tierId: selectedTier._id,
        paymentMethod: 'sandbox_wallet',
      });
      const data = res.data?.data;
      if (data) {
        toast.success(t('membership.joinSuccess', { name: channelName }));
        if (onStatusChange) {
          onStatusChange({
            isMember: true,
            membership: data.membership,
            tier: data.tier,
          });
        }
        onClose();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to join membership');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancel = async () => {
    if (actionBusy) return;
    setActionBusy(true);

    try {
      await membershipApi.cancel(channelId);
      toast.info(t('membership.cancelSuccess'));
      if (onStatusChange) {
        onStatusChange({
          isMember: false,
          membership: null,
          tier: null,
        });
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel membership');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} busy={actionBusy} className="yt-modal-container">
      <div className="yt-membership-dialog">
        <header className="yt-membership-header">
          <h2 className="yt-membership-title">{t('membership.joinTitle')}</h2>
          <button
            type="button"
            className="yt-membership-close"
            onClick={onClose}
            aria-label={t('common.close')}
            disabled={actionBusy}
          >
            <MdClose />
          </button>
        </header>

        <div className="yt-membership-body">
          <div className="yt-member-channel-info">
            {channelAvatar ? (
              <img
                src={channelAvatar}
                alt={channelName}
                className="yt-member-channel-avatar"
              />
            ) : (
              <div className="yt-member-channel-avatar avatar-placeholder">
                {channelName?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
            <div>
              <h3 className="yt-member-channel-name">{channelName}</h3>
              <p className="yt-member-channel-sub">{t('membership.joinSubtitle')}</p>
            </div>
          </div>

          {/* Active Member Status Banner */}
          {isMember && currentMembership && (
            <div className="yt-active-membership-banner">
              <div className="yt-active-badge-row">
                <MdStars />
                <span>
                  {t('membership.activeMember')}: {currentMembership.tier?.name || 'Member'}
                </span>
              </div>
              {currentMembership.expiresAt && (
                <p className="yt-active-expiry">
                  {t('membership.expiresOn', {
                    date: new Date(currentMembership.expiresAt).toLocaleDateString(),
                  })}
                </p>
              )}
            </div>
          )}

          {/* Tier list */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)' }}>
              {t('common.loading')}
            </div>
          ) : (
            tiers.map((tier) => {
              const isSelected = tier._id === selectedTierId;
              return (
                <div
                  key={tier._id}
                  className={`yt-tier-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedTierId(tier._id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="yt-tier-card-header">
                    <div className="yt-tier-name-wrapper">
                      <h4 className="yt-tier-name">{tier.name}</h4>
                      <span
                        className="yt-tier-badge"
                        style={{ backgroundColor: tier.badgeColor || '#10a37f' }}
                      >
                        <MdStars style={{ fontSize: '12px' }} />
                        {t('membership.member')}
                      </span>
                    </div>
                  </div>

                  <div className="yt-tier-price">
                    {Number(tier.price).toLocaleString()} ₫
                    <span>/{t('membership.pricePerMonth').split('/')[1] || 'tháng'}</span>
                  </div>

                  {tier.description && (
                    <p className="yt-tier-desc">{tier.description}</p>
                  )}

                  <div className="yt-perks-heading">{t('membership.perks')}</div>
                  <ul className="yt-perks-list">
                    {(tier.perks && tier.perks.length > 0
                      ? tier.perks
                      : [t('membership.badgePerk'), t('membership.exclusiveVideos')]
                    ).map((perk, idx) => (
                      <li key={idx} className="yt-perk-item">
                        <MdCheck className="yt-perk-icon" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>

        <footer className="yt-membership-footer">
          {isMember ? (
            <button
              type="button"
              className="yt-btn-cancel-membership"
              onClick={handleCancel}
              disabled={actionBusy}
            >
              {actionBusy ? t('common.loading') : t('membership.cancelMembership')}
            </button>
          ) : (
            <button
              type="button"
              className="yt-btn-checkout"
              onClick={handleJoin}
              disabled={loading || actionBusy || !selectedTier}
            >
              <MdSecurity />
              <span>
                {actionBusy
                  ? t('common.loading')
                  : `${t('membership.sandboxCheckout')} (${Number(selectedTier?.price || 0).toLocaleString()} ₫)`}
              </span>
            </button>
          )}

          <p className="yt-sandbox-notice">{t('membership.sandboxNote')}</p>
        </footer>
      </div>
    </Modal>
  );
};

export default MembershipModal;
