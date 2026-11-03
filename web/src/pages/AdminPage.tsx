/**
 * Staff console. Each tab needs one permission (the same table as api/src/auth/tokens.ts):
 * operators review the queue, comments, appeals and spot checks; auditors read accuracy
 * metrics and the decision log; admins see everything and manage roles. The server still
 * checks every request.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdBlock, MdCheck, MdExpandLess, MdExpandMore, MdOutlineOpenInNew, MdRestore, MdVisibility, MdVisibilityOff } from 'react-icons/md';
import { admin, type Interval, type QueueItem } from '../api/endpoints';
import type { Role, VideoCard } from '../api/types';
import { useAuth } from '../context/auth';
import { ConfirmDialog, Modal } from '../components/Common/Dialogs';
import { useToast } from '../components/Common/Toast';
import { Spinner } from '../components/Common/StatusScreen';
import { LoadMoreFooter } from '../components/Video/VideoCard';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { errorText } from '../lib/errors';
import { formatDuration, timeAgo } from '../lib/format';
import './AdminPage.css';

type Permission = 'moderation:review' | 'moderation:appeals' | 'moderation:audit' | 'moderation:sample' | 'metrics:read' | 'events:read' | 'users:manage';
const PERMISSIONS = new Map<Permission, readonly Role[]>([
  ['moderation:review', ['admin', 'operator']],
  ['moderation:appeals', ['admin', 'operator']],
  ['moderation:audit', ['admin', 'operator']],
  ['moderation:sample', ['admin']],
  ['metrics:read', ['admin', 'auditor']],
  ['events:read', ['admin', 'auditor']],
  ['users:manage', ['admin']],
]);
export const can = (role: Role | undefined, p: Permission) => role !== undefined && (PERMISSIONS.get(p) ?? []).includes(role);

const TABS = [
  { key: 'review', permission: 'moderation:review' },
  { key: 'blocked', permission: 'moderation:review' },
  { key: 'comments', permission: 'moderation:review' },
  { key: 'appeals', permission: 'moderation:appeals' },
  { key: 'audit', permission: 'moderation:audit' },
  { key: 'metrics', permission: 'metrics:read' },
  { key: 'events', permission: 'events:read' },
  { key: 'users', permission: 'users:manage' },
] as const satisfies readonly { key: string; permission: Permission }[];
type TabKey = (typeof TABS)[number]['key'];

const DECISION_REASONS = {
  approve: ['model_error', 'fiction_or_game', 'news_or_education', 'acceptable_context', 'report_unfounded', 'other'],
  block: ['confirmed_violation', 'missed_by_model', 'report_upheld', 'policy_violation', 'other'],
} as const;
const OUTCOMES = ['false_positive', 'flag_noise', 'false_negative', 'true_positive', 'true_negative', 'unclassified'] as const;
const ROLES: readonly Role[] = ['user', 'operator', 'auditor', 'admin'];

export default function AdminPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const visible = TABS.filter((x) => can(user?.role, x.permission));
  const raw = params.get('tab');
  const tab: TabKey = visible.find((x) => x.key === raw)?.key ?? visible[0]?.key ?? 'metrics';
  const [stats, setStats] = useState<Awaited<ReturnType<typeof admin.stats>> | null>(null);
  const [toast, notify] = useToast();
  const refreshStats = useCallback(() => { admin.stats().then(setStats).catch(() => undefined); }, []);
  useEffect(refreshStats, [refreshStats]);
  const counts = new Map<TabKey, number | undefined>([['review', stats?.review], ['blocked', stats?.removed], ['comments', stats?.reportedComments], ['appeals', stats?.openAppeals]]);

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1 className="admin-title">{t('admin.title')}</h1>
        <p className="admin-subtitle">{t('admin.subtitle')} · <span className="admin-role-chip">{t('admin.signedInAs', { role: t(`admin.roles.${user?.role ?? 'user'}`) })}</span></p>
      </header>
      <div className="admin-tabs" role="tablist">
        {visible.map((x) => {
          const n = counts.get(x.key);
          return (
            <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} className="admin-tab" onClick={() => setParams({ tab: x.key })}>
              {t(`admin.tab.${x.key}`)}{typeof n === 'number' && n > 0 && <span className="admin-tab-count">{n}</span>}
            </button>
          );
        })}
      </div>
      {(tab === 'review' || tab === 'blocked') && <QueuePanel key={tab} tab={tab === 'review' ? 'review' : 'removed'} notify={notify} onChange={refreshStats} />}
      {tab === 'comments' && <CommentsPanel notify={notify} onChange={refreshStats} />}
      {tab === 'appeals' && <AppealsPanel notify={notify} onChange={refreshStats} />}
      {tab === 'audit' && <AuditPanel notify={notify} canSample={can(user?.role, 'moderation:sample')} />}
      {tab === 'metrics' && <MetricsPanel />}
      {tab === 'events' && <EventsPanel />}
      {tab === 'users' && <UsersPanel notify={notify} selfId={user?.id ?? ''} />}
      {toast}
    </div>
  );
}

interface PanelProps { notify: (s: string) => void; onChange?: () => void }

function GuardedThumb({ video }: { video: Pick<VideoCard, 'id' | 'thumbnail' | 'durationSec'> }) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  return (
    <div className={`admin-thumb${revealed ? ' is-revealed' : ''}`} title={revealed ? undefined : t('admin.blurHint')}>
      {video.thumbnail ? <img src={video.thumbnail} alt="" loading="lazy" /> : <span className="admin-thumb-empty" />}
      {video.thumbnail && (
        <button type="button" className="admin-thumb-toggle" onClick={() => setRevealed(!revealed)}>
          {revealed ? <MdVisibilityOff aria-hidden="true" /> : <MdVisibility aria-hidden="true" />}{revealed ? t('admin.conceal') : t('admin.reveal')}
        </button>
      )}
      {video.durationSec !== null && <span className="admin-thumb-duration">{formatDuration(video.durationSec)}</span>}
    </div>
  );
}

/** The strongest confidence seen for each detected label, highest first. */
function topLabels(item: QueueItem): { name: string; confidence: number; at: number }[] {
  const best = new Map<string, { confidence: number; at: number }>();
  for (const frame of item.moderation.labels ?? []) {
    for (const l of frame.labels) {
      if (!l.Name) continue;
      const c = l.Confidence ?? 0;
      if ((best.get(l.Name)?.confidence ?? -1) < c) best.set(l.Name, { confidence: c, at: frame.timestamp });
    }
  }
  return [...best].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.confidence - a.confidence).slice(0, 6);
}

function ReportList({ videoId }: { videoId: string }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<Awaited<ReturnType<typeof admin.reports>> | null>(null);
  useEffect(() => { admin.reports(videoId).then(setData).catch(() => setData({ items: [], openByReason: {} })); }, [videoId]);
  if (!data) return <p className="admin-muted">{t('admin.reportsLoading')}</p>;
  if (data.items.length === 0) return <p className="admin-muted">{t('admin.noReports')}</p>;
  return (
    <ul className="admin-reports">
      {data.items.map((r, i) => (
        <li key={i} className="admin-report">
          <div className="admin-report-head">
            <strong>{t(`report.reasons.${r.reason}`, { defaultValue: r.reason })}</strong>
            <span className={`admin-report-status${r.status === 'open' ? ' is-open' : ''}`}>{t(`admin.reportStatus.${r.status}`, { defaultValue: r.status })}</span>
            <span>{timeAgo(t, r.createdAt)}</span>
          </div>
          {r.details && <p className="admin-report-details" lang={i18n.resolvedLanguage}>{r.details}</p>}
        </li>
      ))}
    </ul>
  );
}

type Pending = { item: QueueItem; decision: 'approve' | 'block'; kind: 'approve' | 'block' | 'restore' | 'confirm' };

function QueuePanel({ tab, notify, onChange }: PanelProps & { tab: 'review' | 'removed' }) {
  const { t } = useTranslation();
  const fetchPage = useCallback(async (cursor: string | null) => {
    const page = await admin.queue(tab, cursor);
    return { items: page.items, next: page.nextCursor };
  }, [tab]);
  const list = useInfiniteList<QueueItem>(fetchPage);
  const [open, setOpen] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  if (list.status === 'loading') return <div className="admin-loading"><Spinner /></div>;
  if (list.status === 'error' && list.items.length === 0) return <p className="admin-muted">{t('admin.loadFailed')}</p>;
  if (list.items.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">{tab === 'review' ? t('admin.emptyReview') : t('admin.emptyBlocked')}</p>
        {tab === 'review' && <p className="admin-muted">{t('admin.emptyReviewDesc')}</p>}
      </div>
    );
  }
  return (
    <>
      <ul className="admin-queue">
        {list.items.map((v) => {
          const auto = v.moderation.source === 'auto';
          const labels = topLabels(v);
          const reportsOpen = v.moderation.openReports ?? 0;
          return (
            <li key={v.id} className="admin-item">
              <GuardedThumb video={v} />
              <div className="admin-item-body">
                <h2 className="admin-item-title"><Link to={`/watch/${v.id}`} target="_blank" rel="noopener">{v.title} <MdOutlineOpenInNew aria-hidden="true" /></Link></h2>
                <p className="admin-muted">{t('admin.uploadedBy', { name: v.channel.name })}{v.ownerEmail ? ` · ${v.ownerEmail}` : ''} · {timeAgo(t, v.publishedAt)}</p>
                <div className="admin-chips">
                  {auto && <span className={`admin-chip${tab === 'removed' ? ' is-danger' : ''}`}>{tab === 'removed' ? t('admin.blockedAuto') : t('admin.flaggedAuto')}</span>}
                  {reportsOpen > 0 && <span className="admin-chip is-danger">{t('admin.reportCount', { count: reportsOpen })}</span>}
                  {v.moderation.reasonCode && <span className="admin-chip">{t(`admin.decisionReasons.${v.moderation.reasonCode}`, { defaultValue: v.moderation.reasonCode })}</span>}
                </div>
                {v.moderation.error && <p className="admin-warning">{t('admin.checkError', { error: v.moderation.error })}</p>}
                {auto && (labels.length > 0 ? (
                  <div className="admin-labels">
                    <span className="admin-labels-title">{t('admin.detected')}</span>
                    {labels.map((l) => <span key={l.name} className="admin-label">{l.name} {Math.round(l.confidence)}% <span className="admin-label-time">{t('admin.labelAt', { time: formatDuration(Math.floor(l.at / 1000)) })}</span></span>)}
                  </div>
                ) : <p className="admin-muted">{t('admin.noLabels')}</p>)}
                <button type="button" className="btn btn-plain" onClick={() => setOpen(open === v.id ? null : v.id)}>
                  {open === v.id ? <MdExpandLess aria-hidden="true" /> : <MdExpandMore aria-hidden="true" />}{open === v.id ? t('admin.hideReports') : t('admin.showReports')}
                </button>
                {open === v.id && <ReportList videoId={v.id} />}
              </div>
              <div className="admin-item-actions">
                {tab === 'review' ? (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={() => setPending({ item: v, decision: 'approve', kind: 'approve' })}><MdCheck aria-hidden="true" /> {t('admin.approve')}</button>
                    <button type="button" className="btn admin-btn-danger" onClick={() => setPending({ item: v, decision: 'block', kind: 'block' })}><MdBlock aria-hidden="true" /> {t('admin.block')}</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={() => setPending({ item: v, decision: 'approve', kind: 'restore' })}><MdRestore aria-hidden="true" /> {t('admin.restore')}</button>
                    {auto && <button type="button" className="btn btn-plain" onClick={() => setPending({ item: v, decision: 'block', kind: 'confirm' })}>{t('admin.confirmRemoval')}</button>}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <LoadMoreFooter list={list} />
      {pending && (
        <DecisionDialog pending={pending} onClose={() => setPending(null)} onDone={(title) => {
          const toastKey = new Map([['approve', 'admin.approvedToast'], ['block', 'admin.blockedToast'], ['restore', 'admin.restoredToast'], ['confirm', 'admin.confirmedToast']]).get(pending.kind) ?? 'admin.approvedToast';
          notify(t(toastKey, { title }));
          // A confirmed removal stays in the removed list; everything else leaves this list.
          if (pending.kind !== 'confirm') list.setItems((items) => items.filter((x) => x.id !== pending.item.id));
          setPending(null);
          onChange?.();
        }} />
      )}
    </>
  );
}

function DecisionDialog({ pending, onClose, onDone }: { pending: Pending; onClose: () => void; onDone: (title: string) => void }) {
  const { t } = useTranslation();
  const confirm = pending.kind === 'confirm';
  const [reason, setReason] = useState<string>(confirm ? 'confirmed_violation' : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const title = new Map([['approve', 'admin.confirmApproveTitle'], ['block', 'admin.confirmBlockTitle'], ['restore', 'admin.confirmRestoreTitle'], ['confirm', 'admin.confirmRemovalTitle']]).get(pending.kind) ?? '';
  const body = pending.kind === 'confirm' ? 'admin.confirmRemovalBody' : pending.decision === 'block' ? 'admin.confirmBlockBody' : 'admin.confirmApproveBody';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason) { setError(t('admin.reasonRequired')); return; }
    setBusy(true);
    setError('');
    try {
      await admin.decide(pending.item.id, { decision: pending.decision, reasonCode: reason, note: note.trim() });
      onDone(pending.item.title);
    } catch (err) {
      setError(t('admin.decideFailed', { message: errorText(t, err) }));
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose} labelledBy="decision-title" busy={busy} className="decision-modal">
      <form className="dialog decision-body" onSubmit={(e) => void submit(e)}>
        <h2 id="decision-title" className="confirm-dialog-title">{t(title)}</h2>
        <p className="decision-video"><strong>{pending.item.title}</strong></p>
        <p className="confirm-dialog-message">{t(body)}</p>
        {error && <p className="field-error" role="alert">{error}</p>}
        {!confirm && (
          <label className="studio-field">
            <span className="studio-field-label">{t('admin.reasonLabel')}</span>
            <select value={reason} required onChange={(e) => setReason(e.target.value)}>
              <option value="">{t('admin.reasonPlaceholder')}</option>
              {DECISION_REASONS[pending.decision].map((r) => <option key={r} value={r}>{t(`admin.decisionReasons.${r}`)}</option>)}
            </select>
          </label>
        )}
        <label className="studio-field">
          <span className="studio-field-label">{t('admin.noteLabel')}</span>
          <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-plain" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button type="submit" className={`btn ${pending.decision === 'block' ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>{busy ? t('admin.saving') : t('admin.confirm')}</button>
        </div>
      </form>
    </Modal>
  );
}

function CommentsPanel({ notify, onChange }: PanelProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Awaited<ReturnType<typeof admin.comments>>['items'] | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  useEffect(() => { admin.comments().then((r) => setItems(r.items)).catch(() => setItems([])); }, []);
  const act = async (id: string, decision: 'dismiss' | 'remove') => {
    try {
      await admin.decideComment(id, decision);
      setItems((list) => (list ?? []).filter((c) => c.id !== id));
      notify(decision === 'remove' ? t('admin.comments.removedToast') : t('admin.comments.keptToast'));
      onChange?.();
    } catch (err) {
      notify(errorText(t, err));
    }
  };
  if (!items) return <div className="admin-loading"><Spinner /></div>;
  return (
    <section>
      <p className="admin-muted admin-intro">{t('admin.comments.intro')}</p>
      {items.length === 0 ? <p className="empty-state-title">{t('admin.comments.empty')}</p> : (
        <ul className="admin-queue">
          {items.map((c) => (
            <li key={c.id} className="admin-report">
              <blockquote className="admin-quote">{c.body}</blockquote>
              <p className="admin-muted"><Link to={`/watch/${c.video}`} target="_blank" rel="noopener">{t('admin.watch')}</Link> · {t('admin.reportCount', { count: c.openReports })}</p>
              <div className="admin-item-actions">
                <button type="button" className="btn btn-secondary" onClick={() => void act(c.id, 'dismiss')}>{t('admin.comments.keep')}</button>
                <button type="button" className="btn admin-btn-danger" onClick={() => setRemoving(c.id)}>{t('admin.comments.remove')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {removing && <ConfirmDialog title={t('admin.comments.remove')} message={t('admin.comments.confirmRemove')} confirmLabel={t('admin.comments.remove')} danger onClose={() => setRemoving(null)} onConfirm={async () => { await act(removing, 'remove'); setRemoving(null); }} />}
    </section>
  );
}

function VideoLine({ video }: { video: VideoCard | null }) {
  const { t } = useTranslation();
  if (!video) return <p className="admin-muted">{t('common.unavailable')}</p>;
  return (
    <div className="admin-item-body">
      <h2 className="admin-item-title"><Link to={`/watch/${video.id}`} target="_blank" rel="noopener">{video.title} <MdOutlineOpenInNew aria-hidden="true" /></Link></h2>
      <p className="admin-muted">{t('admin.uploadedBy', { name: video.channel.name })}</p>
    </div>
  );
}

function AppealsPanel({ notify, onChange }: PanelProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Awaited<ReturnType<typeof admin.appeals>>['items'] | null>(null);
  const [notes, setNotes] = useState(new Map<string, string>());
  useEffect(() => { admin.appeals().then((r) => setItems(r.items)).catch(() => setItems([])); }, []);
  const act = async (id: string, title: string, decision: 'uphold' | 'reject') => {
    try {
      await admin.decideAppeal(id, decision, notes.get(id) ?? '');
      setItems((list) => (list ?? []).filter((a) => a.id !== id));
      notify(t(decision === 'uphold' ? 'admin.appeals.upheldToast' : 'admin.appeals.rejectedToast', { title }));
      onChange?.();
    } catch (err) {
      notify(errorText(t, err));
    }
  };
  if (!items) return <div className="admin-loading"><Spinner /></div>;
  if (items.length === 0) return <p className="empty-state-title">{t('admin.appeals.empty')}</p>;
  return (
    <ul className="admin-queue">
      {items.map((a) => (
        <li key={a.id} className="admin-item">
          {a.video ? <GuardedThumb video={a.video} /> : <span />}
          <div>
            <VideoLine video={a.video} />
            <blockquote className="admin-quote">{a.message}</blockquote>
            <p className="admin-muted">{timeAgo(t, a.createdAt)}</p>
            <label className="studio-field">
              <span className="studio-field-label">{t('admin.appeals.noteLabel')}</span>
              <textarea rows={2} maxLength={500} value={notes.get(a.id) ?? ''} onChange={(e) => setNotes(new Map(notes).set(a.id, e.target.value))} />
            </label>
          </div>
          <div className="admin-item-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void act(a.id, a.video?.title ?? '', 'uphold')}><MdRestore aria-hidden="true" /> {t('admin.appeals.uphold')}</button>
            <button type="button" className="btn btn-plain" onClick={() => void act(a.id, a.video?.title ?? '', 'reject')}>{t('admin.appeals.reject')}</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AuditPanel({ notify, canSample }: PanelProps & { canSample: boolean }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Awaited<ReturnType<typeof admin.audit>>['items'] | null>(null);
  const [size, setSize] = useState('30');
  const load = useCallback(() => { admin.audit().then((r) => setItems(r.items)).catch(() => setItems([])); }, []);
  useEffect(load, [load]);
  const draw = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await admin.sample(Number(size));
      notify(t('admin.audit.drawnToast', { count: r.sampled }));
      load();
    } catch (err) {
      notify(errorText(t, err));
    }
  };
  const label = async (id: string, title: string, result: 'pass' | 'fail') => {
    try {
      await admin.label(id, result, '');
      setItems((list) => (list ?? []).filter((s) => s.id !== id));
      notify(t(result === 'pass' ? 'admin.audit.passedToast' : 'admin.audit.failedToast', { title }));
    } catch (err) {
      notify(errorText(t, err));
    }
  };
  return (
    <section>
      <p className="admin-muted admin-intro">{t('admin.audit.intro')}</p>
      {canSample && (
        <form className="admin-inline-form" onSubmit={(e) => void draw(e)}>
          <label>{t('admin.audit.size')} <input type="number" min={1} max={200} value={size} onChange={(e) => setSize(e.target.value)} /></label>
          <button type="submit" className="btn btn-secondary">{t('admin.audit.draw')}</button>
        </form>
      )}
      {!items ? <Spinner /> : items.length === 0 ? <p className="empty-state-title">{t('admin.audit.empty')}</p> : (
        <ul className="admin-queue">
          {items.map((s) => (
            <li key={s.id} className="admin-item">
              {s.video ? <GuardedThumb video={s.video} /> : <span />}
              <VideoLine video={s.video} />
              <div className="admin-item-actions">
                <button type="button" className="btn btn-secondary" onClick={() => void label(s.id, s.video?.title ?? '', 'pass')}><MdCheck aria-hidden="true" /> {t('admin.audit.pass')}</button>
                <button type="button" className="btn admin-btn-danger" onClick={() => void label(s.id, s.video?.title ?? '', 'fail')}><MdBlock aria-hidden="true" /> {t('admin.audit.fail')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const pct = (x: number) => (x * 100).toFixed(1);

function Rate({ label, interval, sub }: { label: string; interval: Interval; sub?: string }) {
  const { t } = useTranslation();
  return (
    <div className="admin-stat">
      <p className="admin-stat-label">{label}</p>
      <p className="admin-stat-value">{interval ? `${pct(interval.value)}%` : '—'}</p>
      <p className="admin-stat-sub">{interval ? t('admin.metrics.interval', { low: pct(interval.low), high: pct(interval.high), n: interval.n }) : t('admin.metrics.none')}</p>
      {sub && <p className="admin-stat-sub">{sub}</p>}
    </div>
  );
}

function MetricsPanel() {
  const { t } = useTranslation();
  const [m, setM] = useState<Awaited<ReturnType<typeof admin.metrics>> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { admin.metrics().then(setM).catch(() => setFailed(true)); }, []);
  if (failed) return <p className="admin-muted">{t('admin.loadFailed')}</p>;
  if (!m) return <div className="admin-loading"><Spinner /></div>;
  return (
    <section className="admin-metrics">
      <p className="admin-muted admin-intro">{t('admin.metrics.intro')}</p>
      <div className="admin-stats">
        <Rate label={t('admin.metrics.falsePositiveRate')} interval={m.autoRemoved.falsePositiveRate} sub={t('admin.metrics.coverage', { value: `${m.autoRemoved.reviewed}/${m.autoRemoved.reviewed + m.autoRemoved.unreviewed}` })} />
        <Rate label={t('admin.metrics.flagPrecision')} interval={m.autoHeld.precision} sub={t('admin.metrics.coverage', { value: `${m.autoHeld.reviewed}/${m.autoHeld.reviewed + m.autoHeld.unreviewed}` })} />
        <Rate label={t('admin.metrics.falseNegativeRate')} interval={m.audit.falseNegativeRate} sub={t('admin.metrics.auditCounts', { failed: m.audit.failed, labelled: m.audit.labelled, pending: m.audit.pending })} />
        <div className="admin-stat">
          <p className="admin-stat-label">{t('admin.metrics.knownMisses')}</p>
          <p className="admin-stat-value">{m.missed.falseNegative}</p>
          <p className="admin-stat-sub">{t('admin.metrics.knownMissesHint')}</p>
        </div>
      </div>
      <h2 className="admin-section-title">{t('admin.metrics.byReason')}</h2>
      {m.byReason.length === 0 ? <p className="admin-muted">{t('admin.metrics.none')}</p> : (
        <table className="admin-table">
          <thead><tr><th>{t('admin.events.outcome')}</th><th>{t('admin.reasonLabel')}</th><th>{t('admin.metrics.count')}</th></tr></thead>
          <tbody>
            {m.byReason.map((r) => (
              <tr key={`${r.outcome}-${r.reasonCode}`}>
                <td>{t(`admin.outcomes.${r.outcome}`, { defaultValue: r.outcome })}</td>
                <td>{t(`admin.decisionReasons.${r.reasonCode}`, { defaultValue: r.reasonCode })}</td>
                <td>{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function EventsPanel() {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<'decisions' | 'roles'>('decisions');
  const [outcome, setOutcome] = useState('');
  const fetchPage = useCallback(async (cursor: string | null) => {
    const page = await admin.events(outcome || null, cursor);
    return { items: page.items.map((e) => ({ ...e, id: `${e.createdAt}-${e.video}` })), next: page.nextCursor };
  }, [outcome]);
  const list = useInfiniteList(fetchPage);
  const [roles, setRoles] = useState<Awaited<ReturnType<typeof admin.roleChanges>>['items'] | null>(null);
  useEffect(() => { if (view === 'roles' && !roles) admin.roleChanges().then((r) => setRoles(r.items)).catch(() => setRoles([])); }, [view, roles]);
  const locale = i18n.resolvedLanguage === 'en' ? 'en-US' : 'vi-VN';
  return (
    <section>
      <div className="admin-subtabs" role="tablist">
        {(['decisions', 'roles'] as const).map((x) => <button key={x} type="button" role="tab" aria-selected={view === x} className="chip" onClick={() => setView(x)}>{t(`admin.events.view.${x}`)}</button>)}
      </div>
      {view === 'decisions' ? (
        <>
          <label className="admin-inline-form">
            {t('admin.events.outcome')}
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="">{t('admin.events.allOutcomes')}</option>
              {OUTCOMES.map((o) => <option key={o} value={o}>{t(`admin.outcomes.${o}`)}</option>)}
            </select>
          </label>
          {list.status === 'loading' ? <Spinner /> : list.items.length === 0 ? <p className="admin-muted">{t('admin.events.empty')}</p> : (
            <table className="admin-table">
              <thead><tr><th>{t('admin.events.when')}</th><th>{t('admin.events.video')}</th><th>{t('admin.events.actor')}</th><th>{t('admin.events.decision')}</th><th>{t('admin.events.outcome')}</th><th>{t('admin.reasonLabel')}</th></tr></thead>
              <tbody>
                {list.items.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.createdAt).toLocaleString(locale)}</td>
                    <td><Link to={`/watch/${e.video}`} target="_blank" rel="noopener">{e.video.slice(-6)}</Link></td>
                    <td>{t(`admin.roles.${e.actorRole}`, { defaultValue: e.actorRole })}</td>
                    <td>{t(`admin.events.action.${e.action}`, { defaultValue: e.action ?? e.decision })}</td>
                    <td>{t(`admin.outcomes.${e.outcome}`, { defaultValue: e.outcome })}</td>
                    <td>{t(`admin.decisionReasons.${e.reasonCode}`, { defaultValue: e.reasonCode })}{e.note ? ` · ${e.note}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <LoadMoreFooter list={list} />
        </>
      ) : !roles ? <Spinner /> : roles.length === 0 ? <p className="admin-muted">{t('admin.events.empty')}</p> : (
        <table className="admin-table">
          <thead><tr><th>{t('admin.events.when')}</th><th>{t('admin.users.user')}</th><th>{t('admin.users.role')}</th><th>{t('admin.events.actor')}</th></tr></thead>
          <tbody>
            {roles.map((r) => (
              <tr key={`${r.at}-${r.user}`}>
                <td>{new Date(r.at).toLocaleString(locale)}</td>
                <td>{r.user.slice(-6)}</td>
                <td>{t(`admin.roles.${r.from}`)} → {t(`admin.roles.${r.to}`)}</td>
                <td>{r.by.slice(-6)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function UsersPanel({ notify, selfId }: PanelProps & { selfId: string }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [items, setItems] = useState<Awaited<ReturnType<typeof admin.users>>['items'] | null>(null);
  const [draft, setDraft] = useState(new Map<string, Role>());
  const search = useCallback((text: string, r: Role | '') => { setItems(null); admin.users(text || undefined, r || null).then((x) => setItems(x.items)).catch(() => setItems([])); }, []);
  useEffect(() => search('', ''), [search]);
  const change = async (id: string, name: string) => {
    const next = draft.get(id);
    if (!next) return;
    try {
      await admin.setRole(id, next);
      setItems((list) => (list ?? []).map((u) => (u.id === id ? { ...u, role: next } : u)));
      notify(t('admin.users.changedToast', { name, role: t(`admin.roles.${next}`) }));
    } catch (err) {
      notify(errorText(t, err));
    }
  };
  return (
    <section>
      <form className="admin-inline-form" onSubmit={(e) => { e.preventDefault(); search(q.trim(), role); }}>
        <input type="search" value={q} placeholder={t('admin.users.search')} aria-label={t('admin.users.search')} onChange={(e) => setQ(e.target.value)} />
        <select value={role} aria-label={t('admin.users.filterRole')} onChange={(e) => { const r = ROLES.find((x) => x === e.target.value) ?? ''; setRole(r); search(q.trim(), r); }}>
          <option value="">{t('admin.users.allRoles')}</option>
          {ROLES.map((r) => <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>)}
        </select>
        <button type="submit" className="btn btn-secondary">{t('admin.users.searchButton')}</button>
      </form>
      {!items ? <Spinner /> : items.length === 0 ? <p className="admin-muted">{t('admin.users.empty')}</p> : (
        <table className="admin-table">
          <thead><tr><th>{t('admin.users.user')}</th><th>{t('admin.users.email')}</th><th>{t('admin.users.role')}</th><th /></tr></thead>
          <tbody>
            {items.map((u) => {
              const value = draft.get(u.id) ?? u.role;
              return (
                <tr key={u.id}>
                  <td><Link to={`/@${u.handle}`}>{u.displayName}</Link> <span className="admin-muted">@{u.handle}</span></td>
                  <td>{u.email}</td>
                  <td>
                    <select value={value} disabled={u.id === selfId} aria-label={t('admin.users.role')} onChange={(e) => { const r = ROLES.find((x) => x === e.target.value); if (r) setDraft(new Map(draft).set(u.id, r)); }}>
                      {ROLES.map((r) => <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>)}
                    </select>
                  </td>
                  <td><button type="button" className="btn btn-secondary" disabled={value === u.role} onClick={() => void change(u.id, u.displayName)}>{t('admin.users.change')}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
