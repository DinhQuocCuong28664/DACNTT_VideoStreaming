import axios from 'axios';
import axiosClient from './axiosClient';
import { uploadInParts } from './multipartUpload';

export const videoApi = {
  initiateUpload: (uploadData) =>
    axiosClient.post('/videos/initiate-upload', uploadData),

  confirmUpload: (videoId) =>
    axiosClient.patch(`/videos/${videoId}/confirm-upload`),

  /** Giới hạn tải lên đang áp dụng: { maxVideoSizeBytes, multipartThresholdBytes } */
  getUploadConfig: () =>
    axiosClient.get('/videos/upload-config'),

  getAllVideos: (params = {}) =>
    axiosClient.get('/videos', { params }),

  getVideoById: (id) =>
    axiosClient.get(`/videos/${id}`),

  getRelatedVideos: (id, limit = 8) =>
    axiosClient.get(`/videos/${id}/related`, { params: { limit } }),

  /**
   * Ghi nhận một lượt xem. Chỉ gọi sau khi video đã thực sự bắt đầu phát,
   * không gọi ngay khi tải trang, để số lượt xem phản ánh đúng lượt xem thật.
   */
  registerView: (id) =>
    axiosClient.post(`/videos/${id}/view`),

  /**
   * Xin quyền phát video. Máy chủ kiểm tra quyền truy cập rồi đặt bộ
   * CloudFront Signed Cookie vào trình duyệt. Phải gọi TRƯỚC khi khởi tạo
   * HLS.js, nếu không CloudFront sẽ từ chối các yêu cầu tải segment.
   */
  getPlaybackAuth: (id) =>
    axiosClient.get(`/videos/${id}/playback-auth`),

  /** sort: 'latest' (mặc định) | 'popular' | 'oldest' */
  getUserVideos: (userId, page = 1, limit = 12, sort = 'latest') =>
    axiosClient.get(`/videos/user/${userId}`, { params: { page, limit, sort } }),

  toggleLike: (id) =>
    axiosClient.post(`/videos/${id}/like`),

  toggleDislike: (id) =>
    axiosClient.post(`/videos/${id}/dislike`),

  getComments: (id, page = 1, limit = 20) =>
    axiosClient.get(`/videos/${id}/comments`, { params: { page, limit } }),

  addComment: (id, content) =>
    axiosClient.post(`/videos/${id}/comments`, { content }),

  deleteComment: (commentId) =>
    axiosClient.delete(`/videos/comments/${commentId}`),

  updateVideo: (id, data) =>
    axiosClient.put(`/videos/${id}`, data),

  deleteVideo: (id) =>
    axiosClient.delete(`/videos/${id}`),

  /** reason: một trong REPORT_REASONS ở backend (src/utils/moderation.js) */
  reportVideo: (id, reason, details = '') =>
    axiosClient.post(`/videos/${id}/report`, { reason, details }),

  /**
   * Upload file directly to S3 using a presigned POST
   *
   * S3 kiểm tra policy do máy chủ ký (đúng key, đúng Content-Type, tối đa 2 GB)
   * trước khi nhận tệp. `file` phải là trường cuối cùng vì S3 bỏ qua mọi trường
   * đứng sau nó; không tự đặt Content-Type để trình duyệt điền boundary.
   *
   * @param {{url: string, fields: Object<string, string>}} upload - từ initiate-upload
   * @param {File} file - File object to upload
   * @param {function} onProgress - Callback ({ percent, loaded, total }) for progress updates
   * @param {AbortSignal} signal - Optional abort signal for cancellation
   */
  uploadToS3: ({ url, fields }, file, onProgress, signal) => {
    const form = new FormData();
    Object.entries(fields).forEach(([name, value]) => form.append(name, value));
    form.append('file', file);

    return axios.post(url, form, {
      signal,
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total || file.size;
        const loaded = progressEvent.loaded || 0;
        const percent = total > 0 ? Math.min(100, Math.round((loaded * 100) / total)) : 0;
        if (onProgress) onProgress({ percent, loaded, total });
      },
    });
  },

  /**
   * Tải tệp lớn lên S3 theo từng phần rồi nhờ máy chủ ghép.
   *
   * Dùng khi `initiate-upload` trả về `multipart` thay cho `upload`. Xong hàm này
   * video đã sang PROCESSING (bước ghép gộp luôn việc của confirm-upload), nên
   * không gọi `confirmUpload` nữa. Logic chia phần, song song và thử lại nằm ở
   * `multipartUpload.js`.
   *
   * @param {{videoId: string, file: File, multipart: {partSize: number, partCount: number, maxPartUrlsPerRequest?: number}}} upload
   * @param {function} onProgress - Callback ({ percent, loaded, total })
   * @param {AbortSignal} signal - Optional abort signal for cancellation
   */
  uploadToS3Multipart: ({ videoId, file, multipart }, onProgress, signal) =>
    uploadInParts({
      file,
      partSize: multipart.partSize,
      partCount: multipart.partCount,
      maxPartUrlsPerRequest: multipart.maxPartUrlsPerRequest,
      signal,
      onProgress,
      getPartUrls: async (partNumbers) => {
        const res = await axiosClient.post(`/videos/${videoId}/multipart/parts`, { partNumbers });
        return res.data.data.parts;
      },
      // axios.put thường chứ không qua axiosClient: URL ký sẵn trỏ tới S3 và không
      // được kèm Authorization của ứng dụng. Chỉ `host` và `content-length` được
      // ký, nên không cần (và không nên) đặt thêm header nào.
      putPart: ({ url, body, signal: partSignal, onProgress: onPartProgress }) =>
        axios.put(url, body, {
          signal: partSignal,
          onUploadProgress: (progressEvent) => onPartProgress(progressEvent.loaded || 0),
        }),
      completeUpload: () => axiosClient.post(`/videos/${videoId}/multipart/complete`),
    }),
};

export default videoApi;
