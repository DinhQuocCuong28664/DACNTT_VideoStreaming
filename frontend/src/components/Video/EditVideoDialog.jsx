import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdClose, MdErrorOutline } from 'react-icons/md';
import videoApi from '../../api/videoApi';
import { UPLOAD_CATEGORIES } from '../../i18n/categories';
import VisibilityPicker from './VisibilityPicker';
import './EditVideoDialog.css';

const TITLE_MAX = 100;
const DESC_MAX = 5000;

/**
 * Hộp thoại sửa thông tin video kiểu YouTube Studio: biểu mẫu bên trái, thẻ
 * xem trước bên phải. Lỗi lưu hiện ngay trong hộp thoại, không dùng alert().
 */
const EditVideoDialog = ({ video, onClose, onSaved }) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState(video.title || '');
  const [description, setDescription] = useState(video.description || '');
  const [category, setCategory] = useState(video.category || UPLOAD_CATEGORIES[0].value);
  const [visibility, setVisibility] = useState(video.visibility || 'public');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await videoApi.updateVideo(video._id, { title, description, category, visibility });
      onSaved(res.data.data.video);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setSaving(false);
    }
  };

  const watchUrl = `${window.location.origin}/watch/${video._id}`;

  return (
    <div className="dialog-scrim" onClick={() => !saving && onClose()}>
      <form
        className="dialog edit-video-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-video-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="dialog-header">
          <h2 id="edit-video-title" className="dialog-title">{t('channel.editModalTitle')}</h2>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            disabled={saving}
            aria-label={t('common.close')}
          >
            <MdClose />
          </button>
        </div>

        <div className="dialog-body edit-video-body">
          <div className="edit-video-form">
            {error && (
              <p className="field-error edit-video-error" role="alert">
                <MdErrorOutline aria-hidden="true" /> {error}
              </p>
            )}

            <label className="studio-field">
              <span className="studio-field-label">
                <span>{t('channel.editTitleLabel')} ({t('common.required')})</span>
                <span className="studio-field-counter">{title.length}/{TITLE_MAX}</span>
              </span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={TITLE_MAX}
                required
                autoFocus
              />
            </label>

            <label className="studio-field">
              <span className="studio-field-label">
                <span>{t('channel.editDescLabel')}</span>
                <span className="studio-field-counter">{description.length}/{DESC_MAX}</span>
              </span>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={DESC_MAX}
              />
            </label>

            <label className="studio-field">
              <span className="studio-field-label">{t('channel.editCategoryLabel')}</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {UPLOAD_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {t(`categories.${cat.key}`)}
                  </option>
                ))}
              </select>
            </label>

            <VisibilityPicker value={visibility} onChange={setVisibility} name="edit-visibility" />
          </div>

          <aside className="edit-video-preview">
            <div className="edit-video-thumb">
              {video.thumbnailUrl && <img src={video.thumbnailUrl} alt="" />}
            </div>
            <div className="edit-video-preview-info">
              <p className="edit-video-preview-label">{t('channel.videoLink')}</p>
              <Link to={`/watch/${video._id}`} className="edit-video-preview-link" onClick={onClose}>
                {watchUrl}
              </Link>
              <p className="edit-video-preview-label">{t('channel.videoTitle')}</p>
              <p className="edit-video-preview-value">{video.title}</p>
            </div>
          </aside>
        </div>

        <div className="dialog-footer">
          <button type="button" className="btn btn-plain" onClick={onClose} disabled={saving}>
            {t('channel.editCancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !title.trim()}>
            {saving && <span className="spinner spinner-sm" aria-hidden="true" />}
            <span>{saving ? t('channel.editSaving') : t('channel.editSave')}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditVideoDialog;
