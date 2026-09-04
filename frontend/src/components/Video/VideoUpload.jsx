import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiUploadCloud, FiFile, FiX, FiCheck } from 'react-icons/fi';
import videoApi from '../../api/videoApi';
import { UPLOAD_CATEGORIES } from '../../i18n/categories';
import './VideoUpload.css';

/** Dung lượng tối đa mỗi video: 2 GB — phải khớp với giới hạn phía máy chủ */
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

const VideoUpload = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: UPLOAD_CATEGORIES[0].value,
    tags: '',
    visibility: 'public',
  });
  const [step, setStep] = useState(1); // 1=select file, 2=fill info, 3=uploading
  const [uploadProgress, setUploadProgress] = useState(0);
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

    const allowed = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
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
    setFormData({ ...formData, title: selected.name.replace(/\.[^/.]+$/, '') });
    setError('');
    setStep(2);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      handleFileSelect({ target: { files: [dropped] } });
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleUpload = async () => {
    if (!file || !formData.title.trim()) {
      setError(t('upload.errorNoTitle'));
      return;
    }

    setUploading(true);
    setStep(3);
    setError('');

    try {
      const tagsArray = formData.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t);

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

      // Step 2: Upload file directly to S3 via Pre-signed URL
      await videoApi.uploadToS3(uploadUrl, file, (progress) => {
        setUploadProgress(progress);
      });

      // Step 3: Confirm upload complete → transition status UPLOADING → PROCESSING
      await videoApi.confirmUpload(videoId);

      // Step 4: Navigate to WatchPage
      navigate(`/watch/${videoId}`);
    } catch (err) {
      setError(
        err.response?.data?.message || t('upload.errorFailed')
      );
      setStep(2);
      setUploading(false);
    }
  };

  const resetUpload = () => {
    setFile(null);
    setStep(1);
    setUploadProgress(0);
    setError('');
    setFormData({
      title: '',
      description: '',
      category: UPLOAD_CATEGORIES[0].value,
      tags: '',
      visibility: 'public',
    });
  };

  return (
    <div className="upload-container container">
      <h1 className="upload-title">Upload Video</h1>

      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Step 1: Select File */}
      {step === 1 && (
        <div
          className="upload-dropzone"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <FiUploadCloud className="dropzone-icon" />
          <p className="dropzone-text">{t('upload.dropzone')}</p>
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

      {/* Step 2: Fill Info */}
      {step === 2 && (
        <div className="upload-form-card">
          <div className="upload-file-info">
            <FiFile />
            <div>
              <p className="file-name">{file?.name}</p>
              <p className="file-size">{file && formatFileSize(file.size)}</p>
            </div>
            <button className="btn-icon" onClick={resetUpload} title={t('upload.chooseAnother')}>
              <FiX />
            </button>
          </div>

          <div className="upload-form">
            <div className="form-group">
              <label className="label" htmlFor="vid-title">{t('upload.titleLabel')}</label>
              <input
                id="vid-title"
                name="title"
                type="text"
                className="input"
                placeholder={t('upload.titlePlaceholder')}
                value={formData.title}
                onChange={handleChange}
                maxLength={100}
              />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="vid-desc">{t('upload.descriptionLabel')}</label>
              <textarea
                id="vid-desc"
                name="description"
                className="textarea"
                placeholder={t('upload.descriptionPlaceholder')}
                value={formData.description}
                onChange={handleChange}
                maxLength={5000}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="label" htmlFor="vid-tags">Tags</label>
                <input
                  id="vid-tags"
                  name="tags"
                  type="text"
                  className="input"
                  placeholder="tag1, tag2, tag3"
                  value={formData.tags}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label className="label" htmlFor="vid-cat">{t('upload.categoryLabel')}</label>
                <select
                  id="vid-cat"
                  name="category"
                  className="input"
                  value={formData.category}
                  onChange={handleChange}
                >
                  {UPLOAD_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {t(`categories.${cat.key}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="label" htmlFor="vid-vis">{t('upload.visibilityLabel')}</label>
                <select
                  id="vid-vis"
                  name="visibility"
                  className="input"
                  value={formData.visibility}
                  onChange={handleChange}
                >
                  <option value="public">{t('visibility.public')}</option>
                  <option value="unlisted">{t('visibility.unlisted')}</option>
                  <option value="private">{t('visibility.private')}</option>
                </select>
              </div>
            </div>

            <button className="btn btn-primary upload-submit" onClick={handleUpload} disabled={uploading}>
              <FiUploadCloud /> {uploading ? t('upload.submitting') : t('upload.submit')}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Uploading */}
      {step === 3 && (
        <div className="upload-progress-card">
          <div className="progress-icon-wrap">
            {uploadProgress < 100 ? (
              <div className="spinner" style={{ width: 48, height: 48 }} />
            ) : (
              <FiCheck className="progress-done-icon" />
            )}
          </div>
          <p className="progress-text">
            {uploadProgress < 100
              ? t('upload.progress', { percent: uploadProgress })
              : t('upload.done')}
          </p>
          <div className="upload-progress-track">
            <div
              className="upload-progress-fill"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoUpload;
