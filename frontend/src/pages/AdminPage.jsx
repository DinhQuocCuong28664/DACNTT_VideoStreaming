import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MdClose,
  MdErrorOutline,
  MdOutlineOpenInNew,
  MdOutlinedFlag,
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
import GuardedThumb from '../components/Admin/GuardedThumb';
import AppealsPanel from '../components/Admin/AppealsPanel';
import AuditPanel from '../components/Admin/AuditPanel';
import MetricsPanel from '../components/Admin/MetricsPanel';
import EventsPanel from '../components/Admin/EventsPanel';
import UsersPanel from '../components/Admin/UsersPanel';
import adminApi from '../api/adminApi';
import { useAuth } from '../context/useAuth';
import useInfiniteList from '../hooks/useInfiniteList';
import { formatDuration, timeAgo } from '../utils/format';
import { can, DECISION_REASONS } from '../utils/roles';
import './AdminPage.css';

const PAGE_SIZE = 20;

/**
 * Các tab của trang vận hành, mỗi tab gắn một QUYỀN (khớp backend/src/utils/roles.js). Người dùng chỉ
 * thấy tab mình có quyền: operator thấy hàng chờ, khiếu nại và kiểm tra mẫu; auditor thấy số liệu và
 * nhật ký; admin thấy tất cả. Đây là lớp giao diện, máy chủ vẫn kiểm tra quyền từng request.
 */
const TABS = [
  { key: 'review', permission: 'moderation:review', queue: true },
  { key: 'blocked', permission: 'moderation:review', queue: true },
  { key: 'appeals', permission: 'moderation:appeals' },
  { key: 'audit', permission: 'moderation:audit' },
  { key: 'metrics', permission: 'metrics:read' },
  { key: 'events', permission: 'events:read' },
  { key: 'users', permission: 'users:manage' },
];

const nameOf = (user) => user?.displayName || user?.username || '?';

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

/**
 * Xác nhận quyết định: mã lý do bắt buộc (đây là dữ liệu để đo gỡ nhầm và bỏ lọt, nên không để trống),
 * kèm ghi chú gửi tới chủ video.
 */
const DecisionDialog = ({ video, decision, onClose, onDone }) => {
  const { t } = useTranslation();
  const [note, setNote] = useState(video.moderation?.note || '');
  const [reasonCode, setReasonCode] = useState('');
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
    if (!reasonCode) {
      setError(t('admin.reasonRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await adminApi.decide(video._id, decision, reasonCode, note.trim());
      onDone(video, decision);
    } catch (err) {
      setError(t('admin.decideFailed', { message: err.response?.data?.message || err.message }));
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
              <MdErrorOutline aria-hidden="true" /> {error}
            </p>
          )}
          <label className="studio-field">
            <span className="studio-field-label">
              <span>{t('admin.reasonLabel')}</span>
            </span>
            <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} disabled={saving} required>
              <option value="">{t('admin.reasonPlaceholder')}</option>
              {DECISION_REASONS[decision].map((code) => (
                <option key={code} value={code}>{t(`admin.decisionReasons.${code}`)}</option>
              ))}
            </select>
          </label>
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
          <button type="submit" className={`btn ${isBlock ? 'admin-btn-danger' : 'btn-primary'}`} disabled={saving || !reasonCode}>
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

/** Hàng chờ rà soát hoặc tab "Đã gỡ": danh sách video với nút duyệt hoặc gỡ. */
const QueuePanel = ({ tab, onDecided }) => {
  const { t } = useTranslation();
  const [pending, setPending] = useState(null);
  const [toast, showToast] = useToast();

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
    onDecided();
  };

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
    <>
      {body}
      {pending && (
        <DecisionDialog
          video={pending.video}
          decision={pending.decision}
          onClose={() => setPending(null)}
          onDone={handleDone}
        />
      )}
      {toast}
    </>
  );
};

/**
 * Trang vận hành kiểm duyệt nội dung.
 *
 * Tab nào hiện ra do quyền của vai trò (xem TABS). Hàng chờ và "Đã gỡ" cho người rà soát; khiếu nại của
 * chủ video và kiểm tra mẫu cho người rà soát; số liệu gỡ nhầm/bỏ lọt và nhật ký cho auditor; vai trò
 * người dùng cho admin. Mỗi quyết định kèm một mã lý do (dữ liệu để đo) và một ghi chú chủ video đọc được.
 */
const AdminPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const visibleTabs = useMemo(() => TABS.filter((tab) => can(user, tab.permission)), [user]);
  const [tab, setTab] = useState(() => visibleTabs[0]?.key || 'review');
  const [stats, setStats] = useState(null);

  const showStats = can(user, 'moderation:review') || can(user, 'metrics:read');

  const loadStats = useCallback(() => {
    if (!showStats) return;
    adminApi
      .getStats()
      .then((res) => setStats(res.data.data))
      .catch((err) => console.error('Failed to load moderation stats:', err));
  }, [showStats]);

  useEffect(loadStats, [loadStats]);

  const statTiles = [
    { key: 'review', label: t('admin.statReview'), value: stats?.review },
    { key: 'openReports', label: t('admin.statOpenReports'), value: stats?.openReports },
    { key: 'blocked', label: t('admin.statBlocked'), value: stats?.blocked, sub: stats && `${t('admin.statAutoBlocked')}: ${stats.autoBlocked}` },
  ];

  const active = TABS.find((candidate) => candidate.key === tab);
  const activeVisible = active && can(user, active.permission);

  let panel = null;
  if (activeVisible) {
    if (active.queue) panel = <QueuePanel key={tab} tab={tab} onDecided={loadStats} />;
    else if (tab === 'appeals') panel = <AppealsPanel onChanged={loadStats} />;
    else if (tab === 'audit') panel = <AuditPanel onChanged={loadStats} />;
    else if (tab === 'metrics') panel = <MetricsPanel />;
    else if (tab === 'events') panel = <EventsPanel />;
    else if (tab === 'users') panel = <UsersPanel />;
  }

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1 className="admin-title">{t('admin.title')}</h1>
        <p className="admin-subtitle">{t('admin.subtitle')}</p>
        <p className="admin-role-chip">{t('admin.signedInAs', { role: t(`admin.roles.${user?.role}`) })}</p>
      </header>

      {showStats && (
        <div className="admin-stats">
          {statTiles.map((s) => (
            <div key={s.key} className="admin-stat">
              <p className="admin-stat-label">{s.label}</p>
              <p className="admin-stat-value tabular-nums">{s.value ?? '–'}</p>
              {s.sub && <p className="admin-stat-sub">{s.sub}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="admin-tabs" role="tablist">
        {visibleTabs.map(({ key }) => (
          <button
            key={key}
            type="button"
            role="tab"
            className="admin-tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {t(`admin.tab.${key}`)}
            {stats && (key === 'review' || key === 'blocked') && <span className="admin-tab-count tabular-nums">{stats[key]}</span>}
          </button>
        ))}
      </div>

      <section role="tabpanel">{panel}</section>
    </div>
  );
};

export default AdminPage;
