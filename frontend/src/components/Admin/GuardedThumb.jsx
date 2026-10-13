import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MdOutlineVisibility, MdOutlineVisibilityOff } from 'react-icons/md';
import { formatDuration } from '../../utils/format';

/**
 * Ảnh bìa làm mờ và chuyển xám cho tới khi người rà soát chủ động bấm xem.
 *
 * Karunakaran & Ramakrishnan (HCOMP 2019) đo được rằng làm mờ và chuyển xám giảm rõ tác động cảm xúc
 * lên người kiểm duyệt mà không làm giảm độ chính xác khi họ ra quyết định. Các hàng chờ của trang
 * vận hành, theo đúng định nghĩa, tập trung những hình ảnh dễ gây sốc nhất của cả nền tảng.
 */
const GuardedThumb = ({ src, duration }) => {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);

  return (
    <div className={`admin-thumb${revealed ? ' is-revealed' : ''}`} title={revealed ? undefined : t('admin.blurHint')}>
      {src ? <img src={src} alt="" loading="lazy" /> : <div className="admin-thumb-empty" />}
      {duration > 0 && <span className="admin-thumb-duration tabular-nums">{formatDuration(duration)}</span>}
      {src && (
        <button
          type="button"
          className="admin-thumb-toggle"
          onClick={() => setRevealed((v) => !v)}
          aria-pressed={revealed}
        >
          {revealed ? <MdOutlineVisibilityOff aria-hidden="true" /> : <MdOutlineVisibility aria-hidden="true" />}
          <span>{revealed ? t('admin.conceal') : t('admin.reveal')}</span>
        </button>
      )}
    </div>
  );
};

export default GuardedThumb;
