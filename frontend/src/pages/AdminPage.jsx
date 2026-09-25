import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MdClose,
  MdErrorOutline,
  MdOutlineOpenInNew,
  MdOutlinedFlag,
  MdOutlineVisibility,
  MdOutlineVisibilityOff,
  MdOutlineVerifiedUser,
  MdBlock,
  MdRestore,
  MdCheck,
  MdExpandMore,
  MdExpandLess,
} from 'react-icons/md';
import Modal from '../components/Common/Modal';
import useToast from '../components/Common/Toast';
import { LoadMoreFooter } from '../components/Video/VideoListParts';
import adminApi from '../api/adminApi';
import useInfiniteList from '../hooks/useInfiniteList';
import { formatDuration, timeAgo } from '../utils/format';
import './AdminPage.css';

const PAGE_SIZE = 20;
const TABS = ['review', 'blocked'];

const nameOf = (user) => user?.displayName || user?.username || '?';

/**
 * Ảnh bìa làm mờ và chuyển xám cho tới khi người rà soát chủ động bấm xem.
 *
 * Karunakaran & Ramakrishnan (HCOMP 2019) đo được rằng làm mờ và chuyển xám
 * giảm rõ tác động cảm xúc lên người kiểm duyệt mà không làm giảm độ chính xác
 * khi họ ra quyết định. Hàng rà soát này, theo đúng định nghĩa, tập trung những
 * hình ảnh dễ gây sốc nhất của cả nền tảng.
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

/** Danh sách báo cáo của một video, chỉ nạp khi người rà soát mở ra. */
const ReportList = ({ videoId }) => {
  const { t } = useTranslation();
  const [reports, setReports] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getReports(videoId)
      .then((res) => !cancelled && setReports(res.data.data.reports))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  if (failed) return <p className="field-error">{t('admin.loadFailed')}</p>;
  if (!reports) return <p className="admin-muted">{t('admin.reportsLoading')}</p>;
  if (reports.length === 0) return <p className="admin-muted">{t('admin.noReports')}</p>;

  return (
    <ul className="admin-reports">
      {reports.map((r) => (
        <li key={r._id} className="admin-report">
          <p className="admin-report-head">
            <strong>{t(`report.reasons.${r.reason}`)}</strong>
            <span>@{r.reporter?.username || '?'}</span>
            <span>{timeAgo(t, r.createdAt)}</span>
            <span className={`admin-report-status is-${r.status}`}>{t(`admin.reportStatus.${r.status}`)}</span>
          </p>
          {r.details && <p className="admin-report-details">{r.details}</p>}
        </li>
      ))}
    </ul>
  );
};

/** Xác nhận quyết định, kèm ghi chú gửi tới chủ video. */
const DecisionDialog = ({ video, decision, onClose, onDone }) => {
  const { t } = useTranslation();
  const [note, setNote] = useState(video.moderation?.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isBlock = decision === 'block';
  const isRestore = !isBlock && video.moderation?.status === 'blocked';
  const title = isBlock
    ? t('admin.confirmBlockTitle')
    : isRestore
      ? t('admin.confirmRestoreTitle')
      : t('admin.confirmApproveTitle');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await adminApi.decide(video._id, decision, note.trim());
      onDone(video, decision);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="decision-title" busy={saving} className="decision-modal">
      <form className="dialog" onSubmit={handleSubmit}>
        <div className="dialog-header">
          <h2 id="decision-title" className="dialog-title">{title}</h2>
          <button type="button" className="btn-icon" onClick={onClose} disabled={saving} aria-label={t('common.close')}>
            <MdClose />
          </button>
        </div>
        <div className="dialog-body decision-body">
          <p className="decision-video">{video.title}</p>
          <p className="admin-muted">{isBlock ? t('admin.confirmBlockBody') : t('admin.confirmApproveBody')}</p>
          {error && (
            <p className="field-error" role="alert">
              <MdErrorOutline aria-hidden="true" /> {t('admin.decideFailed', { message: error })}
            </p>
          )}
          <label className="studio-field">
            <span className="studio-field-label">
              <span>{t('admin.noteLabel')}</span>
              <span className="studio-field-counter">{note.length}/500</span>
            </span>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} disabled={saving} />
          </label>
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn btn-plain" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={`btn ${isBlock ? 'admin-btn-danger' : 'btn-primary'}`} disabled={saving}>
            {saving && <span className="spinner spinner-sm" aria-hidden="true" />}
            <span>{saving ? t('admin.saving') : t('admin.confirm')}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

const QueueItem = ({ video, onDecide }) => {
  const { t } = useTranslation();
  const [showReports, setShowReports] = useState(false);
  const moderation = video.moderation || {};
  const openReports = moderation.openReports || 0;
  const isBlocked = moderation.status === 'blocked';
  const reasonEntries = Object.entries(video.reportReasons || {}).sort((a, b) => b[1] - a[1]);
  const reviewer = moderation.reviewedBy;

  let sourceChip = null;
  if (isBlocked) {
    sourceChip = moderation.source === 'admin' ? t('admin.blockedBy', { name: nameOf(reviewer) }) : t('admin.blockedAuto');
  } else if (moderation.status === 'flagged') {
    sourceChip = t('admin.flaggedAuto');
  } else if (moderation.status === 'approved' && moderation.source === 'admin') {
    sourceChip = t('admin.approvedBy', { name: nameOf(reviewer) });
  }

  return (
    <li className="admin-item">
      <GuardedThumb src={video.thumbnailUrl} duration={video.duration} />

      <div className="admin-item-body">
        <h2 className="admin-item-title">
          <Link to={`/watch/${video._id}`} target="_blank" rel="noopener noreferrer">
            {video.title}
          </Link>
        </h2>
        <p className="admin-muted">
          {t('admin.uploadedBy', { name: nameOf(video.user) })} · @{video.user?.username} ·{' '}
          {t(`visibility.${video.visibility || 'public'}`)} · {timeAgo(t, video.createdAt)}
        </p>

        <div className="admin-chips">
          {sourceChip && (
            <span className={`admin-chip${isBlocked ? ' is-danger' : ''}`}>
              {isBlocked ? <MdBlock aria-hidden="true" /> : <MdOutlineVerifiedUser aria-hidden="true" />}
              {sourceChip}
            </span>
          )}
          {openReports > 0 && (
            <span className="admin-chip is-danger">
              <MdOutlinedFlag aria-hidden="true" />
              {t('admin.reportCount', { count: openReports })}
            </span>
          )}
          {reasonEntries.map(([reason, count]) => (
            <span key={reason} className="admin-chip">
              {t(`report.reasons.${reason}`)}
              {count > 1 && <span className="admin-chip-count">×{count}</span>}
            </span>
          ))}
        </div>

        {moderation.labels?.length > 0 ? (
          <div className="admin-labels">
            <span className="admin-labels-title">{t('admin.detected')}</span>
            {moderation.labels.map((l) => (
              <span key={l.name} className={`admin-label${l.action === 'block' ? ' is-block' : ''}`}>
                {l.name} <strong className="tabular-nums">{l.confidence}%</strong>
                {typeof l.timestamp === 'number' && (
                  <span className="admin-label-time">{t('admin.labelAt', { time: formatDuration(Math.round(l.timestamp)) })}</span>
                )}
              </span>
            ))}
          </div>
        ) : (
          moderation.source === 'auto' && !moderation.error && <p className="admin-muted">{t('admin.noLabels')}</p>
        )}
        {moderation.error && (
          <p className="admin-warning">
            <MdErrorOutline aria-hidden="true" /> {t('admin.checkError', { error: moderation.error })}
          </p>
        )}
        {moderation.note && <p className="admin-muted">{t('admin.note', { note: moderation.note })}</p>}

        {showReports && <ReportList videoId={video._id} />}
      </div>

      <div className="admin-item-actions">
        <Link to={`/watch/${video._id}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
          <MdOutlineOpenInNew />
          <span>{t('admin.watch')}</span>
        </Link>
        <button
          type="button"
          className="btn btn-plain"
          onClick={() => setShowReports((v) => !v)}
          aria-expanded={showReports}
        >
          {showReports ? <MdExpandLess /> : <MdExpandMore />}
          <span>{showReports ? t('admin.hideReports') : t('admin.showReports')}</span>
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onDecide(video, 'approve')}>
          {isBlocked ? <MdRestore /> : <MdCheck />}
          <span>{isBlocked ? t('admin.restore') : t('admin.approve')}</span>
        </button>
        {!isBlocked && (
          <button type="button" className="btn admin-btn-danger" onClick={() => onDecide(video, 'block')}>
            <MdBlock />
            <span>{t('admin.block')}</span>
          </button>
        )}
      </div>
    </li>
  );
};

/**
 * Trang kiểm duyệt nội dung dành cho đội ngũ vận hành.
 *
 * Hai tab: "Cần rà soát" (video hệ thống đánh dấu hoặc bị báo cáo, nhiều báo
 * cáo nhất lên đầu) và "Đã gỡ" (để khôi phục khi có khiếu nại). Mỗi quyết định
 * đi kèm một ghi chú mà chủ video đọc được trên trang xem video của họ.
 */
const AdminPage = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState('review');
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState(null);
  const [toast, showToast] = useToast();

  const loadStats = useCallback(() => {
    adminApi
      .getStats()
      .then((res) => setStats(res.data.data))
      .catch((err) => console.error('Failed to load moderation stats:', err));
  }, []);

  useEffect(loadStats, [loadStats]);

  const fetchPage = useCallback(
    async (page) => {
      const res = await adminApi.getQueue(tab, page, PAGE_SIZE);
      const { videos, pagination } = res.data.data;
      return { items: videos, pages: pagination?.pages, total: pagination?.total };
    },
    [tab],
  );

  const list = useInfiniteList(fetchPage);
  const { items, setItems } = list;

  const handleDone = (video, decision) => {
    setPending(null);
    // Mọi quyết định đều đưa video ra khỏi tab hiện tại: giữ lại thì rời hàng
    // rà soát, gỡ thì sang tab "Đã gỡ", khôi phục thì rời tab "Đã gỡ".
    setItems((prev) => prev.filter((v) => v._id !== video._id));
    const toastKey =
      decision === 'block'
        ? 'admin.blockedToast'
        : video.moderation?.status === 'blocked'
          ? 'admin.restoredToast'
          : 'admin.approvedToast';
    showToast(t(toastKey, { title: video.title }));
    loadStats();
  };

  const statTiles = [
    { key: 'review', label: t('admin.statReview'), value: stats?.review },
    { key: 'openReports', label: t('admin.statOpenReports'), value: stats?.openReports },
    { key: 'blocked', label: t('admin.statBlocked'), value: stats?.blocked, sub: stats && `${t('admin.statAutoBlocked')}: ${stats.autoBlocked}` },
  ];

  let body;
  if (list.status === 'loading') {
    body = (
      <div className="flex-center admin-loading">
        <div className="spinner" />
      </div>
    );
  } else if (list.status === 'error' && items.length === 0) {
    body = (
      <div className="empty-state">
        <MdErrorOutline className="empty-state-icon" aria-hidden="true" />
        <p className="empty-state-title">{t('admin.loadFailed')}</p>
        <button type="button" className="btn btn-secondary" onClick={list.retry}>
          {t('home.retry')}
        </button>
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <div className="empty-state">
        <MdOutlineVerifiedUser className="empty-state-icon" aria-hidden="true" />
        <p className="empty-state-title">{tab === 'review' ? t('admin.emptyReview') : t('admin.emptyBlocked')}</p>
        {tab === 'review' && <p className="empty-state-desc">{t('admin.emptyReviewDesc')}</p>}
      </div>
    );
  } else {
    body = (
      <>
        <ul className="admin-queue">
          {items.map((video) => (
            <QueueItem key={video._id} video={video} onDecide={(v, decision) => setPending({ video: v, decision })} />
          ))}
        </ul>
        <LoadMoreFooter list={list} />
      </>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1 className="admin-title">{t('admin.title')}</h1>
        <p className="admin-subtitle">{t('admin.subtitle')}</p>
      </header>

      <div className="admin-stats">
        {statTiles.map((s) => (
          <div key={s.key} className="admin-stat">
            <p className="admin-stat-label">{s.label}</p>
            <p className="admin-stat-value tabular-nums">{s.value ?? '–'}</p>
            {s.sub && <p className="admin-stat-sub">{s.sub}</p>}
          </div>
        ))}
      </div>

      <div className="admin-tabs" role="tablist">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            className="admin-tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {key === 'review' ? t('admin.tabReview') : t('admin.tabBlocked')}
            {stats && <span className="admin-tab-count tabular-nums">{stats[key]}</span>}
          </button>
        ))}
      </div>

      <section role="tabpanel">{body}</section>

      {pending && (
        <DecisionDialog
          video={pending.video}
          decision={pending.decision}
          onClose={() => setPending(null)}
          onDone={handleDone}
        />
      )}
      {toast}
    </div>
  );
};

export default AdminPage;
