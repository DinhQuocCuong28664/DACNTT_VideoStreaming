/**
 * Creator studio: the content list (status, visibility, views) with an edit dialog for
 * details, thumbnail, captions, chapters, scheduling and per-video analytics, plus a channel
 * analytics tab.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdClose, MdDeleteOutline, MdEdit, MdErrorOutline } from 'react-icons/md';
import { me, studio, videos } from '../api/endpoints';
import { CATEGORIES, type Category, type VideoDetails } from '../api/types';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { ConfirmDialog, Modal } from '../components/Common/Dialogs';
import { useToast } from '../components/Common/Toast';
import { Spinner } from '../components/Common/StatusScreen';
import { LoadMoreFooter } from '../components/Video/VideoCard';
import VisibilityPicker, { fieldsOf, modeOf, type VisibilityMode } from '../components/Video/VisibilityPicker';
import { errorText } from '../lib/errors';
import { formatDuration } from '../lib/format';
import { ImageRejected, uploadImage } from '../lib/images';
import { parseChapters } from '../lib/chapters';
import '../components/Video/EditVideoDialog.css';
import './StudioPages.css';

const TABS = ['content', 'analytics'] as const;
type Tab = (typeof TABS)[number];
const STATUSES = ['UPLOADING', 'PROCESSING', 'READY', 'SCHEDULED', 'ERROR'] as const;

export default function StudioPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = TABS.find((x) => x === raw) ?? 'content';
  return (
    <div className="studio-page">
      <header className="studio-head">
        <h1 className="studio-title">{t('studio.title')}</h1>
        <Link to="/upload" className="btn btn-primary">{t('nav.upload')}</Link>
      </header>
      <div className="studio-tabs" role="tablist">
        {TABS.map((x) => (
          <button key={x} type="button" role="tab" aria-selected={tab === x} className="studio-tab" onClick={() => setParams({ tab: x })}>{t(`studio.tabs.${x}`)}</button>
        ))}
      </div>
      {tab === 'content' ? <ContentTab /> : <ChannelAnalytics />}
    </div>
  );
}

function ContentTab() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<VideoDetails | null>(null);
  const [deleting, setDeleting] = useState<VideoDetails | null>(null);
  const [toast, notify] = useToast();
  const fetchPage = useCallback(async (cursor: string | null) => {
    const page = await me.videos({ cursor, ...(status ? { status } : {}) });
    return { items: page.items, next: page.nextCursor };
  }, [status]);
  const list = useInfiniteList<VideoDetails>(fetchPage);
  const locale = i18n.resolvedLanguage === 'en' ? 'en-US' : 'vi-VN';
  const replace = (v: VideoDetails) => list.setItems((items) => items.map((x) => (x.id === v.id ? { ...x, ...v } : x)));

  return (
    <>
      <div className="studio-filter">
        <label className="studio-filter-label">
          {t('studio.filterStatus')}
          <select className="settings-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('studio.allStatuses')}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`studio.status.${s}`)}</option>)}
          </select>
        </label>
      </div>
      {list.status === 'loading' ? <Spinner /> : list.items.length === 0 ? (
        <div className="empty-state"><p className="empty-state-title">{t('studio.empty')}</p><Link to="/upload" className="btn btn-primary">{t('home.emptyAction')}</Link></div>
      ) : (
        <div className="studio-table-wrap">
          <table className="studio-table">
            <thead><tr><th>{t('studio.col.video')}</th><th>{t('studio.col.visibility')}</th><th>{t('studio.col.status')}</th><th>{t('studio.col.date')}</th><th className="num">{t('studio.col.views')}</th><th className="num">{t('studio.col.comments')}</th><th><span className="visually-hidden">{t('studio.col.actions')}</span></th></tr></thead>
            <tbody>
              {list.items.map((v) => (
                <tr key={v.id}>
                  <td>
                    <div className="studio-video-cell">
                      <Link to={`/watch/${v.id}`} className="studio-thumb">
                        {v.thumbnail ? <img src={v.thumbnail} alt="" loading="lazy" /> : <span className="studio-thumb-empty" />}
                        {v.durationSec !== null && <span className="studio-thumb-time">{formatDuration(v.durationSec)}</span>}
                      </Link>
                      <div className="studio-video-text">
                        <Link to={`/watch/${v.id}`} className="studio-video-title">{v.title}</Link>
                        <span className="studio-video-desc">{v.description || t('studio.noDescription')}</span>
                      </div>
                    </div>
                  </td>
                  <td>{t(`visibility.${modeOf(v.visibility, v.audience)}`)}</td>
                  <td>
                    <span className={`studio-status studio-status-${(v.status ?? 'READY').toLowerCase()}`}>{t(`studio.status.${v.status ?? 'READY'}`)}</span>
                    {v.status === 'PROCESSING' && typeof v.processingProgress === 'number' && <span className="studio-progress"> {Math.round(v.processingProgress)}%</span>}
                    {v.status === 'SCHEDULED' && v.publishAt && <span className="studio-sub">{new Date(v.publishAt).toLocaleString(locale)}</span>}
                    {v.moderation && v.moderation.status !== 'approved' && v.moderation.status !== 'pending' && <span className="studio-sub">{t(`moderationStatus.${v.moderation.status}`, { defaultValue: v.moderation.status })}</span>}
                  </td>
                  <td>{v.publishedAt ? new Date(v.publishedAt).toLocaleDateString(locale) : '—'}</td>
                  <td className="num">{v.counters.views.toLocaleString(locale)}</td>
                  <td className="num">{v.counters.comments.toLocaleString(locale)}</td>
                  <td className="studio-actions">
                    <button type="button" className="btn-icon" aria-label={t('channel.editVideo')} title={t('channel.editVideo')} onClick={() => setEditing(v)}><MdEdit /></button>
                    <button type="button" className="btn-icon" aria-label={t('channel.deleteVideo')} title={t('channel.deleteVideo')} onClick={() => setDeleting(v)}><MdDeleteOutline /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <LoadMoreFooter list={list} />
        </div>
      )}
      {editing && <EditVideoDialog video={editing} onClose={() => setEditing(null)} onSaved={(v) => { replace(v); setEditing(v); }} notify={notify} />}
      {deleting && (
        <ConfirmDialog title={t('channel.deleteVideo')} message={t('channel.confirmDelete', { title: deleting.title })} confirmLabel={t('common.delete')} danger onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await videos.remove(deleting.id);
              list.setItems((items) => items.filter((x) => x.id !== deleting.id));
              notify(t('channel.deleted'));
            } catch (err) {
              notify(t('channel.deleteFailed', { message: errorText(t, err) }));
            }
            setDeleting(null);
          }} />
      )}
      {toast}
    </>
  );
}

const SECTIONS = ['details', 'thumbnail', 'captions', 'chapters', 'schedule', 'analytics'] as const;
type Section = (typeof SECTIONS)[number];

function EditVideoDialog({ video, onClose, onSaved, notify }: { video: VideoDetails; onClose: () => void; onSaved: (v: VideoDetails) => void; notify: (s: string) => void }) {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>('details');
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={onClose} labelledBy="edit-video-title" busy={busy} className="edit-video-modal">
      <div className="dialog edit-video-dialog">
        <div className="dialog-header">
          <h2 id="edit-video-title" className="dialog-title">{t('channel.editModalTitle')}</h2>
          <button type="button" className="btn-icon" onClick={onClose} disabled={busy} aria-label={t('common.close')}><MdClose /></button>
        </div>
        <div className="studio-tabs studio-tabs-compact" role="tablist">
          {SECTIONS.map((x) => <button key={x} type="button" role="tab" aria-selected={section === x} className="studio-tab" disabled={busy} onClick={() => setSection(x)}>{t(`studio.section.${x}`)}</button>)}
        </div>
        <div className="dialog-body edit-video-body">
          {section === 'details' && <DetailsForm video={video} setBusy={setBusy} onSaved={(v) => { onSaved(v); notify(t('channel.editSuccess')); }} />}
          {section === 'thumbnail' && <ThumbnailForm video={video} setBusy={setBusy} onSaved={onSaved} notify={notify} />}
          {section === 'captions' && <CaptionsForm video={video} setBusy={setBusy} onSaved={onSaved} notify={notify} />}
          {section === 'chapters' && <ChaptersForm video={video} setBusy={setBusy} onSaved={onSaved} notify={notify} />}
          {section === 'schedule' && <ScheduleForm video={video} setBusy={setBusy} onSaved={onSaved} notify={notify} />}
          {section === 'analytics' && <VideoAnalytics id={video.id} />}
        </div>
      </div>
    </Modal>
  );
}

interface FormProps { video: VideoDetails; setBusy: (b: boolean) => void; onSaved: (v: VideoDetails) => void; notify: (s: string) => void }

function useSubmit(setBusy: (b: boolean) => void) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [busy, setLocalBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setLocalBusy(true);
    setError('');
    try { await fn(); } catch (err) { setError(errorText(t, err)); } finally { setBusy(false); setLocalBusy(false); }
  };
  const errorBox = error ? <p className="field-error edit-video-error" role="alert"><MdErrorOutline aria-hidden="true" /> {error}</p> : null;
  return { run, busy, errorBox, setError };
}

const TITLE_MAX = 100;
const DESC_MAX = 5000;

function DetailsForm({ video, setBusy, onSaved }: Omit<FormProps, 'notify'>) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    title: video.title, description: video.description, category: (video.category ?? 'other') as Category, tags: video.tags.join(', '),
    mode: modeOf(video.visibility, video.audience) as VisibilityMode, password: '', hasViolence: video.hasViolence,
  });
  const { run, busy, errorBox, setError } = useSubmit(setBusy);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const { visibility, audience } = fieldsOf(form.mode);
    const needsPassword = visibility === 'password' && video.visibility !== 'password';
    if (needsPassword && form.password.length < 4) { setError(t('upload.errorPassword')); return; }
    void run(async () => {
      const { video: v } = await videos.update(video.id, {
        title: form.title.trim(), description: form.description, category: form.category,
        tags: form.tags.split(',').map((x) => x.trim()).filter(Boolean), visibility, audience, hasViolence: form.hasViolence,
        ...(visibility === 'password' && form.password ? { password: form.password } : {}),
      });
      onSaved(v);
    });
  };
  return (
    <form className="edit-video-form" onSubmit={submit}>
      {errorBox}
      <label className="studio-field">
        <span className="studio-field-label"><span>{t('channel.editTitleLabel')} ({t('common.required')})</span><span className="studio-field-counter">{form.title.length}/{TITLE_MAX}</span></span>
        <input value={form.title} maxLength={TITLE_MAX} required onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </label>
      <label className="studio-field">
        <span className="studio-field-label"><span>{t('channel.editDescLabel')}</span><span className="studio-field-counter">{form.description.length}/{DESC_MAX}</span></span>
        <textarea rows={5} value={form.description} maxLength={DESC_MAX} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </label>
      <label className="studio-field">
        <span className="studio-field-label">{t('channel.editCategoryLabel')}</span>
        <select value={form.category} onChange={(e) => setForm({ ...form, category: CATEGORIES.find((c) => c === e.target.value) ?? 'other' })}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(`categories.${c}`)}</option>)}
        </select>
      </label>
      <label className="studio-field">
        <span className="studio-field-label">{t('upload.tagsLabel')}</span>
        <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
      </label>
      <p className="field-help">{t('upload.tagsHelp')}</p>
      <VisibilityPicker value={form.mode} onChange={(mode) => setForm({ ...form, mode })} name="edit-visibility">
        {form.mode === 'password' && (
          <input className="form-input visibility-password" type="password" value={form.password} minLength={4} maxLength={72}
            placeholder={video.visibility === 'password' ? t('studio.keepPassword') : t('upload.passwordPlaceholder')} aria-label={t('upload.passwordPlaceholder')}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        )}
      </VisibilityPicker>
      <label className="studio-checkbox-field">
        <input type="checkbox" checked={form.hasViolence} onChange={(e) => setForm({ ...form, hasViolence: e.target.checked })} />
        <span><span className="studio-checkbox-title">{t('channel.editViolenceLabel')}</span><span className="field-help">{t('channel.editViolenceHelp')}</span></span>
      </label>
      <div className="settings-profile-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('channel.editSaving') : t('channel.editSave')}</button></div>
    </form>
  );
}

function ThumbnailForm({ video, setBusy, onSaved, notify }: FormProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const { run, busy, errorBox, setError } = useSubmit(setBusy);
  const pick = (file: File | undefined) => {
    if (!file) return;
    void run(async () => {
      try {
        const id = await uploadImage(file);
        const { thumbnail } = await studio.thumbnail(video.id, id);
        onSaved({ ...video, thumbnail });
        notify(t('studio.thumbnailSaved'));
      } catch (err) {
        if (err instanceof ImageRejected) { setError(t(err.reason === 'type' ? 'prefs.imageType' : 'prefs.imageSize')); return; }
        throw err;
      }
    });
  };
  const reset = () => void run(async () => {
    await studio.removeThumbnail(video.id);
    const { video: v } = await videos.get(video.id);
    onSaved({ ...video, thumbnail: 'thumbnail' in v ? v.thumbnail : null });
    notify(t('studio.thumbnailReset'));
  });
  return (
    <div className="edit-video-form">
      {errorBox}
      <div className="edit-video-thumb studio-thumb-large">{video.thumbnail ? <img src={video.thumbnail} alt="" /> : <span className="studio-thumb-empty" />}</div>
      <p className="field-help">{t('studio.thumbnailHelp')}</p>
      <div className="settings-profile-actions">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>{t('studio.thumbnailAuto')}</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? t('common.loading') : t('studio.thumbnailUpload')}</button>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

function CaptionsForm({ video, setBusy, onSaved, notify }: FormProps) {
  const { t } = useTranslation();
  const [lang, setLang] = useState('vi');
  const [label, setLabel] = useState('Tiếng Việt');
  const [file, setFile] = useState<File | null>(null);
  const { run, busy, errorBox } = useSubmit(setBusy);
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    void run(async () => {
      const { captions } = await studio.captions(video.id, lang.trim(), label.trim(), await file.text());
      onSaved({ ...video, captions });
      setFile(null);
      notify(t('studio.captionSaved'));
    });
  };
  const remove = (code: string) => void run(async () => {
    await studio.removeCaption(video.id, code);
    onSaved({ ...video, captions: video.captions.filter((c) => c.lang !== code) });
  });
  return (
    <div className="edit-video-form">
      {errorBox}
      {video.captions.length === 0 ? <p className="settings-desc">{t('studio.noCaptions')}</p> : (
        <ul className="studio-list">
          {video.captions.map((c) => (
            <li key={c.lang} className="studio-list-row"><span><strong>{c.label}</strong> · {c.lang}</span>
              <button type="button" className="btn-icon" disabled={busy} aria-label={t('studio.removeCaption', { label: c.label })} onClick={() => remove(c.lang)}><MdDeleteOutline /></button></li>
          ))}
        </ul>
      )}
      <form className="studio-inline-form" onSubmit={add}>
        <label className="studio-field"><span className="studio-field-label">{t('studio.captionLang')}</span><input value={lang} required maxLength={10} onChange={(e) => setLang(e.target.value)} /></label>
        <label className="studio-field"><span className="studio-field-label">{t('studio.captionLabel')}</span><input value={label} required maxLength={40} onChange={(e) => setLabel(e.target.value)} /></label>
        <label className="studio-field"><span className="studio-field-label">{t('studio.captionFile')}</span><input type="file" accept=".vtt,text/vtt" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <p className="field-help">{t('studio.captionHelp')}</p>
        <div className="settings-profile-actions"><button type="submit" className="btn btn-primary" disabled={busy || !file}>{t('studio.captionAdd')}</button></div>
      </form>
    </div>
  );
}

function ChaptersForm({ video, setBusy, onSaved, notify }: FormProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => video.chapters.map((c) => `${formatDuration(c.startSec)} ${c.title}`).join('\n'));
  const { run, busy, errorBox, setError } = useSubmit(setBusy);
  const save = (e: FormEvent) => {
    e.preventDefault();
    const chapters = parseChapters(text);
    if (!chapters) { setError(t('studio.chaptersBadLine')); return; }
    void run(async () => {
      const r = await studio.chapters(video.id, chapters);
      onSaved({ ...video, chapters: r.chapters });
      notify(t('studio.chaptersSaved'));
    });
  };
  return (
    <form className="edit-video-form" onSubmit={save}>
      {errorBox}
      <label className="studio-field"><span className="studio-field-label">{t('studio.section.chapters')}</span>
        <textarea rows={8} value={text} placeholder={'0:00 Intro\n1:30 ...'} onChange={(e) => setText(e.target.value)} /></label>
      <p className="field-help">{t('studio.chaptersHelp')}</p>
      <div className="settings-profile-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{t('channel.editSave')}</button></div>
    </form>
  );
}

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function ScheduleForm({ video, setBusy, onSaved, notify }: FormProps) {
  const { t, i18n } = useTranslation();
  const [when, setWhen] = useState(() => toLocalInput(video.publishAt ? new Date(video.publishAt) : new Date(Date.now() + 86_400_000)));
  const { run, busy, errorBox } = useSubmit(setBusy);
  const locale = i18n.resolvedLanguage === 'en' ? 'en-US' : 'vi-VN';
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await studio.schedule(video.id, new Date(when).toISOString());
      onSaved({ ...video, status: 'SCHEDULED', publishAt: r.publishAt });
      notify(t('studio.scheduled', { date: new Date(r.publishAt).toLocaleString(locale) }));
    });
  };
  const cancel = () => void run(async () => {
    await studio.unschedule(video.id);
    const { video: v } = await videos.get(video.id);
    onSaved('title' in v ? { ...video, ...v, publishAt: null } : { ...video, publishAt: null });
    notify(t('studio.unscheduled'));
  });
  return (
    <form className="edit-video-form" onSubmit={save}>
      {errorBox}
      {video.publishAt && <p className="settings-desc">{t('studio.scheduledFor', { date: new Date(video.publishAt).toLocaleString(locale) })}</p>}
      <label className="studio-field"><span className="studio-field-label">{t('studio.publishAt')}</span>
        <input type="datetime-local" value={when} required onChange={(e) => setWhen(e.target.value)} /></label>
      <p className="field-help">{t('studio.scheduleHelp')}</p>
      <div className="settings-profile-actions">
        {video.publishAt && <button type="button" className="btn btn-ghost" disabled={busy} onClick={cancel}>{t('studio.unschedule')}</button>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{t('studio.schedule')}</button>
      </div>
    </form>
  );
}

type Day = { date: string; views: number; watchSeconds: number };

function Bars({ days, label }: { days: Day[]; label: string }) {
  const max = Math.max(1, ...days.map((d) => d.views));
  return (
    <div className="studio-bars" role="img" aria-label={label}>
      {days.map((d) => <span key={d.date} className="studio-bar" style={{ height: `${(d.views / max) * 100}%` }} title={`${d.date}: ${d.views}`} />)}
    </div>
  );
}

const hours = (sec: number) => (sec / 3600).toFixed(1);

function VideoAnalytics({ id }: { id: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<Awaited<ReturnType<typeof studio.analytics>> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { studio.analytics(id).then(setData).catch(() => setFailed(true)); }, [id]);
  if (failed) return <p className="settings-desc">{t('studio.analyticsFailed')}</p>;
  if (!data) return <Spinner />;
  return (
    <div className="edit-video-form">
      <div className="studio-stats">
        <div className="studio-stat"><span className="studio-stat-value">{data.totals.views}</span><span className="studio-stat-label">{t('studio.views28')}</span></div>
        <div className="studio-stat"><span className="studio-stat-value">{hours(data.totals.watchSeconds)}</span><span className="studio-stat-label">{t('studio.watchHours')}</span></div>
      </div>
      <Bars days={data.days} label={t('studio.viewsPerDay')} />
      {data.retention.length > 0 && (
        <>
          <h3 className="settings-section-title">{t('studio.retention')}</h3>
          <div className="studio-bars studio-bars-retention" role="img" aria-label={t('studio.retention')}>
            {data.retention.map((r, i) => <span key={i} className="studio-bar" style={{ height: `${Math.max(0, Math.min(100, r * 100))}%` }} />)}
          </div>
        </>
      )}
    </div>
  );
}

function ChannelAnalytics() {
  const { t } = useTranslation();
  const [data, setData] = useState<Awaited<ReturnType<typeof me.analytics>> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { me.analytics().then(setData).catch(() => setFailed(true)); }, []);
  const totals = useMemo(() => (data ? data.days.reduce((a, d) => ({ views: a.views + d.views, watch: a.watch + d.watchSeconds }), { views: 0, watch: 0 }) : null), [data]);
  if (failed) return <p className="settings-desc">{t('studio.analyticsFailed')}</p>;
  if (!data || !totals) return <Spinner />;
  return (
    <section className="studio-analytics">
      <div className="studio-stats">
        <div className="studio-stat"><span className="studio-stat-value">{totals.views}</span><span className="studio-stat-label">{t('studio.views28')}</span></div>
        <div className="studio-stat"><span className="studio-stat-value">{hours(totals.watch)}</span><span className="studio-stat-label">{t('studio.watchHours')}</span></div>
        <div className="studio-stat"><span className="studio-stat-value">{data.subscribers}</span><span className="studio-stat-label">{t('studio.subscribers')}</span></div>
      </div>
      <Bars days={data.days} label={t('studio.viewsPerDay')} />
      <h2 className="settings-section-title">{t('studio.topVideos')}</h2>
      {data.top.length === 0 ? <p className="settings-desc">{t('studio.noData')}</p> : (
        <ol className="studio-list">
          {data.top.map((v) => <li key={v.id} className="studio-list-row"><Link to={`/watch/${v.id}`}>{v.title}</Link><span>{v.views}</span></li>)}
        </ol>
      )}
    </section>
  );
}
