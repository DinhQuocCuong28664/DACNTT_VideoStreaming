/**
 * Upload in three steps, as in YouTube Studio: pick a file (button or drop anywhere), fill the
 * details and visibility, then the transfer with speed, ETA and cancel. Files up to 5 GiB go in
 * one presigned POST; larger ones (up to 20 GiB) in parallel parts. S3's event starts processing;
 * the watch page shows its progress.
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdCheck, MdClose, MdErrorOutline, MdFileUpload, MdOutlineMarkEmailUnread, MdOutlineMovie } from 'react-icons/md';
import { uploads, videos } from '../api/endpoints';
import { CATEGORIES, type Category } from '../api/types';
import { useAuth } from '../context/auth';
import { ResendVerificationButton } from '../components/Auth/EmailVerification';
import VisibilityPicker, { fieldsOf, type VisibilityMode } from '../components/Video/VisibilityPicker';
import { errorText, isApiError } from '../lib/errors';
import { formatBytes, formatEta, formatSpeed, uploadInParts, uploadWithPost, UploadCancelled, type Progress } from '../lib/upload';
import '../components/Video/VideoUpload.css';

const MAX_BYTES = 20 * 1024 ** 3;
const TITLE_MAX = 100;
const DESC_MAX = 5000;
const EXTENSIONS = /\.(mp4|m4v|mov|mkv|webm|avi|mpe?g|3gp|flv|ts|wmv)$/i;

interface Form { title: string; description: string; category: Category; tags: string; mode: VisibilityMode; password: string; hasViolence: boolean }
const EMPTY: Form = { title: '', description: '', category: 'other', tags: '', mode: 'public', password: '', hasViolence: false };

export default function UploadPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const needsVerification = user?.emailVerified === false;
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const draftId = useRef<string | null>(null);
  const startedAt = useRef(0);

  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [page, setPage] = useState<'details' | 'visibility'>('details');
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState<Progress>({ loaded: 0, total: 0, percent: 0 });
  const [speed, setSpeed] = useState('');
  const [eta, setEta] = useState('');
  const [error, setError] = useState('');

  const choose = (selected: File | undefined) => {
    if (!selected) return;
    if (!selected.type.startsWith('video/') && !EXTENSIONS.test(selected.name)) return setError(t('upload.errorFormat'));
    if (selected.size > MAX_BYTES) return setError(t('upload.errorTooLarge', { max: formatBytes(MAX_BYTES), actual: formatBytes(selected.size) }));
    setFile(selected);
    setForm((f) => ({ ...f, title: selected.name.replace(/\.[^/.]+$/, '').slice(0, TITLE_MAX) }));
    setError('');
    setPage('details');
    setStep(2);
    return undefined;
  };
  const chooseRef = useRef(choose);
  useEffect(() => { chooseRef.current = choose; });

  // Drop anywhere on the window while step 1 is showing.
  const acceptsDrop = step === 1 && !needsVerification;
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; depth += 1; if (acceptsDrop) setDragActive(true); };
    const over = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = acceptsDrop ? 'copy' : 'none'; };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (depth === 0) setDragActive(false); };
    const drop = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; setDragActive(false); if (acceptsDrop) chooseRef.current(e.dataTransfer?.files[0]); };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [acceptsDrop]);

  // Leaving mid-transfer cancels it and removes the draft.
  useEffect(() => () => { abort.current?.abort(); discardDraft(); }, []);

  const change = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  function discardDraft() {
    const id = draftId.current;
    draftId.current = null;
    if (id) void uploads.abort(id).catch(() => undefined);
  }

  const onProgress = (p: Progress) => {
    setProgress(p);
    const elapsed = (Date.now() - startedAt.current) / 1000;
    if (elapsed > 0.5 && p.loaded > 0) {
      const rate = p.loaded / elapsed;
      setSpeed(formatSpeed(rate));
      setEta(formatEta((p.total - p.loaded) / rate));
    }
  };

  const upload = async () => {
    if (!file || !form.title.trim()) { setError(t('upload.errorNoTitle')); setPage('details'); return; }
    if (form.mode === 'password' && form.password.length < 4) { setError(t('upload.errorPassword')); return; }
    setStep(3);
    setError('');
    setProgress({ loaded: 0, total: file.size, percent: 0 });
    setSpeed('');
    setEta('');
    const ctl = new AbortController();
    abort.current = ctl;
    startedAt.current = Date.now();
    try {
      const { visibility, audience } = fieldsOf(form.mode);
      // Created private when it needs a password or members, then switched before the transfer.
      const created = await uploads.create({
        fileName: file.name, size: file.size, contentType: file.type, title: form.title.trim(), description: form.description,
        visibility: visibility === 'password' ? 'private' : visibility,
      });
      const id = created.video.id;
      draftId.current = id;
      const tags = form.tags.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 30);
      await videos.update(id, {
        category: form.category, tags, hasViolence: form.hasViolence, audience,
        ...(visibility === 'password' ? { visibility, password: form.password } : {}),
      });
      const grant = created.upload;
      if (grant.mode === 'post') {
        await uploadWithPost(grant, file, onProgress, ctl.signal);
      } else {
        await uploadInParts({
          file, partSize: grant.partSize, partCount: grant.partCount, onProgress, signal: ctl.signal,
          getPartUrls: async (nums) => (await uploads.parts(id, nums)).parts,
        });
      }
      await uploads.complete(id);
      draftId.current = null;
      navigate(`/watch/${id}`);
    } catch (err) {
      if (err instanceof UploadCancelled) return;
      if (isApiError(err, 'EMAIL_NOT_VERIFIED')) { void refreshUser(); setStep(1); setFile(null); return; }
      setError(isApiError(err, 'NO_TIERS') ? t('upload.errorNoTiers') : errorText(t, err));
      setStep(2);
      discardDraft();
    }
  };

  const cancel = () => {
    abort.current?.abort();
    setStep(2);
    setError(t('upload.errorCancelled'));
    discardDraft();
  };

  const reset = () => {
    abort.current?.abort();
    discardDraft();
    setFile(null);
    setStep(1);
    setPage('details');
    setError('');
    setForm(EMPTY);
  };

  const errorBanner = error && <p className="upload-error" role="alert"><MdErrorOutline aria-hidden="true" /><span>{error}</span></p>;
  const preview = (
    <aside className="upload-preview">
      <div className="upload-preview-frame">
        <MdOutlineMovie aria-hidden="true" />
        <span>{step === 3 ? t('upload.progress', { percent: progress.percent }) : t('upload.previewPending')}</span>
        {step === 3 && (
          <div className="upload-preview-bar" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label={t('upload.progressLabel')}>
            <div style={{ width: `${progress.percent}%` }} />
          </div>
        )}
      </div>
      <dl className="upload-preview-info">
        <dt>{t('upload.filename')}</dt><dd>{file?.name}</dd>
        <dt>{t('upload.fileSize')}</dt><dd className="tabular-nums">{file && formatBytes(file.size)}</dd>
      </dl>
    </aside>
  );

  return (
    <div className="upload-page">
      <div className="dialog upload-panel">
        <div className="dialog-header">
          <div className="upload-dialog-header-text">
            <h1 className="dialog-title">{step === 1 ? t('upload.pageTitle') : form.title || file?.name}</h1>
            {step > 1 && <span className="upload-draft-status"><MdCheck aria-hidden="true" /> {t('upload.draftSaved')}</span>}
          </div>
          {step !== 3 && (
            <button type="button" className="btn-icon" onClick={step === 1 ? () => navigate(-1) : reset} aria-label={step === 1 ? t('common.close') : t('upload.chooseAnother')}><MdClose /></button>
          )}
        </div>

        {step === 1 && needsVerification && user && (
          <div className="upload-verify">
            <span className="dropzone-circle"><MdOutlineMarkEmailUnread aria-hidden="true" /></span>
            <p className="dropzone-text">{t('verify.uploadTitle')}</p>
            <p className="dropzone-sub">{t('verify.uploadDesc', { email: user.email })}</p>
            <ResendVerificationButton className="btn btn-primary" />
          </div>
        )}

        {step === 1 && !needsVerification && (
          <div className={`upload-dropzone ${dragActive ? 'is-dragging' : ''}`} role="button" tabIndex={0} aria-label={t('upload.dropzone')}
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click(); } }}>
            {errorBanner}
            <span className="dropzone-circle"><MdFileUpload aria-hidden="true" /></span>
            <p className="dropzone-text">{t('upload.dropzone')}</p>
            <p className="dropzone-sub">{t('upload.privateUntilReady')}</p>
            <span className="btn btn-primary dropzone-btn">{t('upload.selectFile')}</span>
            <p className="dropzone-hint">{t('upload.dropzoneHint', { max: formatBytes(MAX_BYTES) })}</p>
            <input ref={fileInput} type="file" accept="video/*" onChange={(e) => choose(e.target.files?.[0])} hidden />
          </div>
        )}

        {step === 2 && (
          <>
            <ol className="upload-stepper">
              {(['details', 'visibility'] as const).map((key, i) => (
                <li key={key} className={`upload-step ${page === key ? 'is-active' : ''} ${key === 'details' && page === 'visibility' ? 'is-done' : ''}`}>
                  <button type="button" onClick={() => setPage(key)}>
                    <span className="upload-step-label">{t(`upload.step.${key}`)}</span>
                    <span className="upload-step-dot" aria-hidden="true">{key === 'details' && page === 'visibility' ? <MdCheck /> : i + 1}</span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="dialog-body upload-body">
              <div className="upload-form">
                {errorBanner}
                {page === 'details' ? (
                  <>
                    <h2 className="upload-section-title">{t('upload.step.details')}</h2>
                    <label className="studio-field">
                      <span className="studio-field-label"><span>{t('upload.titleLabel')}</span><span className="studio-field-counter">{form.title.length}/{TITLE_MAX}</span></span>
                      <input name="title" type="text" placeholder={t('upload.titlePlaceholder')} value={form.title} onChange={change} maxLength={TITLE_MAX} required />
                    </label>
                    <label className="studio-field">
                      <span className="studio-field-label"><span>{t('upload.descriptionLabel')}</span><span className="studio-field-counter">{form.description.length}/{DESC_MAX}</span></span>
                      <textarea name="description" rows={5} placeholder={t('upload.descriptionPlaceholder')} value={form.description} onChange={change} maxLength={DESC_MAX} />
                    </label>
                    <label className="studio-field">
                      <span className="studio-field-label">{t('upload.categoryLabel')}</span>
                      <select name="category" value={form.category} onChange={change}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`categories.${c}`)}</option>)}</select>
                    </label>
                    <div>
                      <label className="studio-field"><span className="studio-field-label">{t('upload.tagsLabel')}</span><input name="tags" type="text" placeholder="hà nội, 4k, travel" value={form.tags} onChange={change} /></label>
                      <p className="field-help">{t('upload.tagsHelp')}</p>
                    </div>
                    <label className="studio-checkbox-field">
                      <input type="checkbox" checked={form.hasViolence} onChange={(e) => setForm((f) => ({ ...f, hasViolence: e.target.checked }))} />
                      <span><span className="studio-checkbox-title">{t('upload.violenceLabel')}</span><span className="field-help">{t('upload.violenceHelp')}</span></span>
                    </label>
                  </>
                ) : (
                  <>
                    <div className="upload-section-header">
                      <h2 className="upload-section-title">{t('upload.step.visibility')}</h2>
                      <p className="upload-section-subtitle">{t('upload.visibilitySubtitle')}</p>
                    </div>
                    <VisibilityPicker value={form.mode} onChange={(mode) => setForm((f) => ({ ...f, mode }))}>
                      <input className="form-input visibility-password" type="password" name="password" value={form.password} onChange={change}
                        minLength={4} maxLength={72} placeholder={t('upload.passwordPlaceholder')} aria-label={t('upload.passwordPlaceholder')} />
                    </VisibilityPicker>
                  </>
                )}
              </div>
              {preview}
            </div>
            <div className="dialog-footer upload-footer">
              <p className="upload-footer-note">{t('upload.readyToUpload')}</p>
              {page === 'visibility' && <button type="button" className="btn btn-plain" onClick={() => setPage('details')}>{t('upload.back')}</button>}
              {page === 'details'
                ? <button type="button" className="btn btn-primary" onClick={() => setPage('visibility')} disabled={!form.title.trim()}>{t('upload.next')}</button>
                : <button type="button" className="btn btn-primary" onClick={() => void upload()}>{t('upload.submit')}</button>}
            </div>
          </>
        )}

        {step === 3 && file && (
          <>
            <div className="dialog-body upload-body">
              <div className="upload-transfer">
                <p className="upload-percent tabular-nums">{progress.percent}%</p>
                <div className="upload-progress-track"><div className="upload-progress-fill" style={{ width: `${progress.percent}%` }} /></div>
                {progress.percent < 100 ? (
                  <ul className="upload-telemetry">
                    <li className="tabular-nums">{t('upload.uploaded', { loaded: formatBytes(progress.loaded), total: formatBytes(progress.total || file.size) })}</li>
                    {speed && <li className="tabular-nums">{t('upload.speed', { speed })}</li>}
                    {eta && <li className="tabular-nums">{t('upload.remaining', { time: eta })}</li>}
                  </ul>
                ) : <p className="upload-done"><MdCheck aria-hidden="true" /> {t('upload.done')}</p>}
                <p className="upload-transfer-note">{t('upload.transferNote')}</p>
              </div>
              {preview}
            </div>
            <div className="dialog-footer upload-footer">
              <p className="upload-footer-note"><MdFileUpload aria-hidden="true" />{t('upload.progress', { percent: progress.percent })}</p>
              {progress.percent < 100 && <button type="button" className="btn btn-plain" onClick={cancel}>{t('upload.cancelUpload')}</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
