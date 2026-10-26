import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdStars } from 'react-icons/md';
import { useAuth } from '../../context/useAuth';
import membershipApi from '../../api/membershipApi';
import MembershipModal from './MembershipModal';
import './JoinButton.css';

/**
 * YouTube-style Channel Join Button.
 * Sits alongside SubscribeButton, indicates membership status, and triggers the MembershipModal.
 */
const JoinButton = ({
  channelId,
  channelName = '',
  channelAvatar = '',
  className = '',
  onMembershipChange,
}) => {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();

  const [isMember, setIsMember] = useState(false);
  const [membership, setMembership] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const isOwnChannel = Boolean(currentUser && channelId && currentUser._id === channelId);

  useEffect(() => {
    if (!channelId || isOwnChannel) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    membershipApi
      .getStatus(channelId)
      .then((res) => {
        if (!isMounted) return;
        const data = res.data?.data;
        if (data) {
          setIsMember(Boolean(data.isMember));
          setMembership(data.membership || null);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch channel membership status:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [channelId, isOwnChannel]);

  // Do not render Join button on creator's own channel
  if (isOwnChannel || !channelId) {
    return null;
  }

  const handleStatusChange = (status) => {
    setIsMember(status.isMember);
    setMembership(status.membership);
    if (onMembershipChange) {
      onMembershipChange(status);
    }
  };

  return (
    <div className={`yt-join-wrapper ${className}`}>
      <button
        type="button"
        className={`yt-join-btn ${isMember ? 'is-member' : ''}`}
        onClick={() => setModalOpen(true)}
        disabled={loading}
        title={isMember ? t('membership.member') : t('membership.join')}
        aria-label={isMember ? t('membership.member') : t('membership.join')}
      >
        {isMember ? (
          <>
            <MdStars className="yt-join-star" />
            <span>{t('membership.member')}</span>
          </>
        ) : (
          <span>{t('membership.join')}</span>
        )}
      </button>

      {modalOpen && (
        <MembershipModal
          channelId={channelId}
          channelName={channelName}
          channelAvatar={channelAvatar}
          isMember={isMember}
          currentMembership={membership}
          onClose={() => setModalOpen(false)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
};

export default JoinButton;
