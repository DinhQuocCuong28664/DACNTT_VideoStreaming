import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUploadCloud, FiFile, FiX, FiCheck } from 'react-icons/fi';
import videoApi from '../../api/videoApi';
import './VideoUpload.css';

const VideoUpload = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
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
      setError('Định dạng không hỗ trợ. Vui lòng chọn file .mp4, .mov, .avi hoặc .mkv');
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
      setError('Vui lòng điền tiêu đề video');
      return;
    }

    setUploading(true);
    setStep(3);
    setError('');

    try {
      // Step 1: Get Pre-signed URL from backend
      const urlRes = await videoApi.getUploadUrl(file.name, file.type);
      const { uploadUrl, s3Key } = urlRes.data.data;

      // Step 2: Upload directly to S3
      await videoApi.uploadToS3(uploadUrl, file, (progress) => {
        setUploadProgress(progress);
      });

      // Step 3: Create video record in DB
      const tagsArray = formData.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t);

      const videoRes = await videoApi.createVideo({
        title: formData.title,
        description: formData.description,
        rawS3Key: s3Key,
        mimeType: file.type,
        fileSize: file.size,
        tags: tagsArray,
        visibility: formData.visibility,
      });

      const videoId = videoRes.data.data.video._id;

      // Step 4: Confirm upload → status PROCESSING
      await videoApi.confirmUpload(videoId);

      // Navigate to the video page
      navigate(`/watch/${videoId}`);
    } catch (err) {
      setError(
        err.response?.data?.message || 'Upload thất bại. Vui lòng thử lại.'
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
    setFormData({ title: '', description: '', tags: '', visibility: 'public' });
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
          <p className="dropzone-text">Kéo thả video vào đây hoặc nhấn để chọn file</p>
          <p className="dropzone-hint">Hỗ trợ: MP4, MOV, AVI, MKV</p>
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
            <button className="btn-icon" onClick={resetUpload} title="Chọn file khác">
              <FiX />
            </button>
          </div>

          <div className="upload-form">
            <div className="form-group">
              <label className="label" htmlFor="vid-title">Tiêu đề *</label>
              <input
                id="vid-title"
                name="title"
                type="text"
                className="input"
                placeholder="Nhập tiêu đề video"
                value={formData.title}
                onChange={handleChange}
                maxLength={100}
              />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="vid-desc">Mô tả</label>
              <textarea
                id="vid-desc"
                name="description"
                className="textarea"
                placeholder="Mô tả nội dung video..."
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
                <label className="label" htmlFor="vid-vis">Quyền riêng tư</label>
                <select
                  id="vid-vis"
                  name="visibility"
                  className="input"
                  value={formData.visibility}
                  onChange={handleChange}
                >
                  <option value="public">Công khai</option>
                  <option value="unlisted">Không liệt kê</option>
                  <option value="private">Riêng tư</option>
                </select>
              </div>
            </div>

            <button className="btn btn-primary upload-submit" onClick={handleUpload}>
              <FiUploadCloud /> Bắt đầu Upload
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
              ? `Đang tải lên... ${uploadProgress}%`
              : 'Upload hoàn tất! Đang chuyển hướng...'}
          </p>
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoUpload;
