import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MdLock, MdStars } from 'react-icons/md';
import MembershipModal from '../Channel/MembershipModal';
import './LockedVideoOverlay.css';

/**
 * LockedVideoOverlay Component.
 * Displayed when viewer tries to play a members-only video without active membership.
 */
const LockedVideoOverlay = ({
  channelId,
  channelName = '',
  channelAvatar = '',
  onUnlockSuccess,
}) => {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);

  const handleStatusChange = (status) => {
    if (status.isMember && onUnlockSuccess) {
      onUnlockSuccess();
    }
  };

  return (
    <div className="yt-locked-overlay">
      <div className="yt-locked-icon-wrapper">
        <MdLock />
      </div>

      <h2 className="yt-locked-title">{t('membership.lockedTitle')}</h2>
      <p className="yt-locked-subtitle">
        {t('membership.lockedSubtitle', { name: channelName })}
      </p>

      <button
        type="button"
        className="yt-locked-join-btn"
        onClick={() => setModalOpen(true)}
      >
        <MdStars style={{ fontSize: '1.25rem' }} />
        <span>{t('membership.joinPrompt')}</span>
      </button>

      {modalOpen && (
        <MembershipModal
          channelId={channelId}
          channelName={channelName}
          channelAvatar={channelAvatar}
          isMember={false}
          onClose={() => setModalOpen(false)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
};

export default LockedVideoOverlay;
