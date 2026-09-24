import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdFileUpload, MdClose, MdErrorOutline, MdCheck, MdOutlineMovie } from 'react-icons/md';
import videoApi from '../../api/videoApi';
import { UPLOAD_CATEGORIES } from '../../i18n/categories';
import VisibilityPicker from './VisibilityPicker';
import './VideoUpload.css';

/** Dung lượng tối đa mỗi video: 2 GB — phải khớp với giới hạn phía máy chủ */
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
const TITLE_MAX = 100;
const DESC_MAX = 5000;

const EMPTY_FORM = {
  title: '',
  description: '',
  category: UPLOAD_CATEGORIES[0].value,
  tags: '',
  visibility: 'public',
};

/**
 * Luồng tải lên kiểu hộp thoại YouTube Studio, ba bước trên cùng một route:
 * 1. chọn tệp, 2. điền thông tin (hai trang con: Chi tiết → Chế độ hiển thị),
 * 3. đang truyền tệp thẳng lên S3.
 */
const VideoUpload = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const uploadStartTimeRef = useRef(null);
  const currentVideoIdRef = useRef(null);

  const [file, setFile] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [step, setStep] = useState(1); // 1=select file, 2=fill info, 3=uploading
  const [detailsPage, setDetailsPage] = useState('details'); // details | visibility
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState('');
  const [remainingTime, setRemainingTime] = useState('');
  const [uploadedStats, setUploadedStats] = useState({ loaded: 0, total: 0 });
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const formatFileSize = (bytes) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const handleFileSelect = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    const allowed = [
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-matroska',
      'video/webm',
      'video/mpeg',
    ];
    if (!allowed.includes(selected.type)) {
      setError(t('upload.errorFormat'));
      return;
    }

    // Ngưỡng này phải khớp với MAX_VIDEO_SIZE_BYTES ở phía máy chủ.
    // Kiểm tra sớm tại trình duyệt giúp người dùng biết ngay, thay vì chờ tải
    // xong hàng GB rồi mới nhận lỗi từ API.
    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setError(
        t('upload.errorTooLarge', {
          max: formatFileSize(MAX_FILE_SIZE_BYTES),
          actual: formatFileSize(selected.size),
        })
      );
      return;
    }

    setFile(selected);
    setFormData({ ...formData, title: selected.name.replace(/\.[^/.]+$/, '').slice(0, TITLE_MAX) });
    setError('');
    setDetailsPage('details');
    setStep(2);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      handleFileSelect({ target: { files: [dropped] } });
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const formatSpeed = (bytesPerSec) => {
    if (bytesPerSec >= 1048576) return `${(bytesPerSec / 1048576).toFixed(1)} MB/s`;
    if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
    return `${Math.round(bytesPerSec)} B/s`;
  };

  const formatEta = (seconds) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  /**
   * Xoá bản ghi nháp mà `initiateUpload` đã tạo trước khi tệp kịp lên S3.
   *
   * Gọi ở cả ba lối thoát khỏi luồng tải lên — bấm Huỷ, chọn tệp khác, và
   * tải lên thất bại — vì lối nào cũng bỏ lại đúng một bản ghi `UPLOADING`
   * mà không gì dọn hộ: hệ thống không có TTL index cũng không có tác vụ
   * quét định kỳ. Chạy nền chứ không chờ, để giao diện phản hồi ngay cả khi
   * lệnh xoá chậm; nếu xoá hỏng thì bản ghi chỉ nằm lại ở trang kênh của
   * chính chủ, nơi nút xoá vẫn dùng được.
   */
  const discardDraftVideo = () => {
    const danglingId = currentVideoIdRef.current;
    if (!danglingId) return;
    currentVideoIdRef.current = null;
    videoApi.deleteVideo(danglingId).catch((delErr) => {
      console.warn('Could not clean up draft video record:', delErr);
    });
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setUploading(false);
    setStep(2);
    setError(t('upload.errorCancelled'));
    discardDraftVideo();
  };

  const handleUpload = async () => {
    if (!file || !formData.title.trim()) {
      setError(t('upload.errorNoTitle'));
      setDetailsPage('details');
      return;
    }

    setUploading(true);
    setStep(3);
    setError('');
    setUploadProgress(0);
    setUploadSpeed('');
    setRemainingTime('');
    setUploadedStats({ loaded: 0, total: file.size });

    const controller = new AbortController();
    abortControllerRef.current = controller;
    uploadStartTimeRef.current = Date.now();

    try {
      const tagsArray = formData.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag);

      // Step 1: Initiate upload (Creates DB record FIRST with status UPLOADING to get videoId, returns uploadUrl)
      const initRes = await videoApi.initiateUpload({
        title: formData.title,
        description: formData.description,
        category: formData.category,
        filename: file.name,
        mimetype: file.type,
        fileSize: file.size,
        tags: tagsArray,
        visibility: formData.visibility,
      });

      const { video, uploadUrl } = initRes.data.data;
      const videoId = video._id;
      currentVideoIdRef.current = videoId;

      // Step 2: Upload file directly to S3 via Pre-signed URL with telemetry & cancellation
      await videoApi.uploadToS3(
        uploadUrl,
        file,
        ({ percent, loaded, total }) => {
          setUploadProgress(percent);
          setUploadedStats({ loaded, total });

          const elapsedSec = (Date.now() - uploadStartTimeRef.current) / 1000;
          if (elapsedSec > 0.5 && loaded > 0) {
            const bytesPerSec = loaded / elapsedSec;
            setUploadSpeed(formatSpeed(bytesPerSec));
            const remainingBytes = total - loaded;
            const eta = remainingBytes / bytesPerSec;
            setRemainingTime(formatEta(eta));
          }
        },
        controller.signal
      );

      // Step 3: Confirm upload complete → transition status UPLOADING → PROCESSING
      await videoApi.confirmUpload(videoId);
      currentVideoIdRef.current = null;

      // Step 4: Navigate to WatchPage
      navigate(`/watch/${videoId}`);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        // Handled by handleCancelUpload
        return;
      }
      setError(err.response?.data?.message || t('upload.errorFailed'));
      setStep(2);
      setUploading(false);
      // Không có dòng này thì mỗi lần bấm Upload lại sau khi hỏng sẽ tạo
      // thêm một bản ghi nháp nữa, còn bản ghi lần trước mất dấu vĩnh viễn.
      discardDraftVideo();
    }
  };

  const resetUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    discardDraftVideo();
    setFile(null);
    setStep(1);
    setDetailsPage('details');
    setUploadProgress(0);
    setUploadSpeed('');
    setRemainingTime('');
    setUploadedStats({ loaded: 0, total: 0 });
    setError('');
    setFormData(EMPTY_FORM);
  };

  const openPicker = () => fileInputRef.current?.click();

  const errorBanner = error && (
    <p className="upload-error" role="alert">
      <MdErrorOutline aria-hidden="true" />
      <span>{error}</span>
    </p>
  );

  /* Thẻ xem trước bên phải: bước 2 và 3 dùng chung, bước 3 có thanh tiến trình màu thương hiệu */
  const preview = (
    <aside className="upload-preview">
      <div className="upload-preview-frame">
        <MdOutlineMovie aria-hidden="true" />
        <span>{step === 3 ? t('upload.progress', { percent: uploadProgress }) : t('upload.previewPending')}</span>
        {step === 3 && (
          <div
            className="upload-preview-bar"
            role="progressbar"
            aria-valuenow={uploadProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('upload.progressLabel')}
          >
            <div style={{ width: `${uploadProgress}%` }} />
          </div>
        )}
      </div>
      <dl className="upload-preview-info">
        <dt>{t('upload.filename')}</dt>
        <dd>{file?.name}</dd>
        <dt>{t('upload.fileSize')}</dt>
        <dd className="tabular-nums">{file && formatFileSize(file.size)}</dd>
      </dl>
    </aside>
  );

  return (
    <div className="upload-page">
      <div className="dialog upload-panel">
        <div className="dialog-header">
          <h1 className="dialog-title">{step === 1 ? t('upload.pageTitle') : formData.title || file?.name}</h1>
          {step !== 3 && (
            <button
              type="button"
              className="btn-icon"
              onClick={step === 1 ? () => navigate(-1) : resetUpload}
              aria-label={step === 1 ? t('common.close') : t('upload.chooseAnother')}
              title={step === 1 ? t('common.close') : t('upload.chooseAnother')}
            >
              <MdClose />
            </button>
          )}
        </div>

        {/* Bước 1: chọn tệp */}
        {step === 1 && (
          /* Vùng thả tệp là <div> nên bàn phím không tới được: khai báo nó là
             nút, cho vào thứ tự tab, và mở hộp chọn tệp bằng Enter hoặc phím
             cách đúng như khi bấm chuột. */
          <div
            className={`upload-dropzone ${dragActive ? 'is-dragging' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={t('upload.dropzone')}
            onClick={openPicker}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPicker();
              }
            }}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
          >
            {errorBanner}
            <span className="dropzone-circle">
              <MdFileUpload aria-hidden="true" />
            </span>
            <p className="dropzone-text">{t('upload.dropzone')}</p>
            <p className="dropzone-sub">{t('upload.privateUntilReady')}</p>
            <span className="btn btn-primary dropzone-btn">{t('upload.selectFile')}</span>
            <p className="dropzone-hint">{t('upload.dropzoneHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              hidden
            />
          </div>
        )}

        {/* Bước 2: điền thông tin, hai trang con */}
        {step === 2 && (
          <>
            <ol className="upload-stepper">
              {['details', 'visibility'].map((key, i) => (
                <li
                  key={key}
                  className={`upload-step ${detailsPage === key ? 'is-active' : ''} ${
                    key === 'details' && detailsPage === 'visibility' ? 'is-done' : ''
                  }`}
                >
                  <button type="button" onClick={() => setDetailsPage(key)}>
                    <span className="upload-step-label">{t(`upload.step.${key}`)}</span>
                    <span className="upload-step-dot" aria-hidden="true">
                      {key === 'details' && detailsPage === 'visibility' ? <MdCheck /> : i + 1}
                    </span>
                  </button>
                </li>
              ))}
            </ol>

            <div className="dialog-body upload-body">
              <div className="upload-form">
                {errorBanner}

                {detailsPage === 'details' ? (
                  <>
                    <h2 className="upload-section-title">{t('upload.step.details')}</h2>
                    <label className="studio-field">
                      <span className="studio-field-label">
                        <span>{t('upload.titleLabel')}</span>
                        <span className="studio-field-counter">{formData.title.length}/{TITLE_MAX}</span>
                      </span>
                      <input
                        name="title"
                        type="text"
                        placeholder={t('upload.titlePlaceholder')}
                        value={formData.title}
                        onChange={handleChange}
                        maxLength={TITLE_MAX}
                        required
                      />
                    </label>

                    <label className="studio-field">
                      <span className="studio-field-label">
                        <span>{t('upload.descriptionLabel')}</span>
                        <span className="studio-field-counter">{formData.description.length}/{DESC_MAX}</span>
                      </span>
                      <textarea
                        name="description"
                        rows={5}
                        placeholder={t('upload.descriptionPlaceholder')}
                        value={formData.description}
                        onChange={handleChange}
                        maxLength={DESC_MAX}
                      />
                    </label>

                    <label className="studio-field">
                      <span className="studio-field-label">{t('upload.categoryLabel')}</span>
                      <select name="category" value={formData.category} onChange={handleChange}>
                        {UPLOAD_CATEGORIES.map((cat) => (
                          <option key={cat.value} value={cat.value}>
                            {t(`categories.${cat.key}`)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div>
                      <label className="studio-field">
                        <span className="studio-field-label">{t('upload.tagsLabel')}</span>
                        <input
                          name="tags"
                          type="text"
                          placeholder="hà nội, 4k, travel"
                          value={formData.tags}
                          onChange={handleChange}
                        />
                      </label>
                      <p className="field-help">{t('upload.tagsHelp')}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="upload-section-title">{t('upload.step.visibility')}</h2>
                    <VisibilityPicker
                      value={formData.visibility}
                      onChange={(v) => setFormData({ ...formData, visibility: v })}
                    />
                  </>
                )}
              </div>
              {preview}
            </div>

            <div className="dialog-footer upload-footer">
              <p className="upload-footer-note">{t('upload.readyToUpload')}</p>
              {detailsPage === 'visibility' && (
                <button type="button" className="btn btn-plain" onClick={() => setDetailsPage('details')}>
                  {t('upload.back')}
                </button>
              )}
              {detailsPage === 'details' ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setDetailsPage('visibility')}
                  disabled={!formData.title.trim()}
                >
                  {t('upload.next')}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
                  {uploading ? t('upload.submitting') : t('upload.submit')}
                </button>
              )}
            </div>
          </>
        )}

        {/* Bước 3: đang truyền tệp */}
        {step === 3 && (
          <>
            <div className="dialog-body upload-body">
              <div className="upload-transfer">
                <p className="upload-percent tabular-nums">{uploadProgress}%</p>
                <div className="upload-progress-track">
                  <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
                {uploadProgress < 100 ? (
                  <ul className="upload-telemetry">
                    <li className="tabular-nums">
                      {t('upload.uploaded', {
                        loaded: formatFileSize(uploadedStats.loaded),
                        total: formatFileSize(uploadedStats.total || file.size),
                      })}
                    </li>
                    {uploadSpeed && <li className="tabular-nums">{t('upload.speed', { speed: uploadSpeed })}</li>}
                    {remainingTime && <li className="tabular-nums">{t('upload.remaining', { time: remainingTime })}</li>}
                  </ul>
                ) : (
                  <p className="upload-done">
                    <MdCheck aria-hidden="true" /> {t('upload.done')}
                  </p>
                )}
                <p className="upload-transfer-note">{t('upload.transferNote')}</p>
              </div>
              {preview}
            </div>

            <div className="dialog-footer upload-footer">
              <p className="upload-footer-note">
                <MdFileUpload aria-hidden="true" />
                {t('upload.progress', { percent: uploadProgress })}
              </p>
              {uploadProgress < 100 && (
                <button type="button" className="btn btn-plain" onClick={handleCancelUpload}>
                  {t('upload.cancelUpload')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VideoUpload;
