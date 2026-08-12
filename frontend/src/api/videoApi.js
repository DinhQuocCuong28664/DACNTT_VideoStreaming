import axios from 'axios';
import axiosClient from './axiosClient';

export const videoApi = {
  initiateUpload: (uploadData) =>
    axiosClient.post('/videos/initiate-upload', uploadData),

  confirmUpload: (videoId) =>
    axiosClient.patch(`/videos/${videoId}/confirm-upload`),

  getAllVideos: (params = {}) =>
    axiosClient.get('/videos', { params }),

  getVideoById: (id) =>
    axiosClient.get(`/videos/${id}`),

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

  getUserVideos: (userId, page = 1, limit = 12) =>
    axiosClient.get(`/videos/user/${userId}`, { params: { page, limit } }),

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

  /**
   * Upload file directly to S3 using Pre-signed URL
   * @param {string} presignedUrl - S3 Pre-signed PUT URL
   * @param {File} file - File object to upload
   * @param {function} onProgress - Callback (percentage: number) for progress updates
   */
  uploadToS3: (presignedUrl, file, onProgress) =>
    axios.put(presignedUrl, file, {
      headers: {
        'Content-Type': file.type,
      },
      onUploadProgress: (progressEvent) => {
        const percentage = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        if (onProgress) onProgress(percentage);
      },
    }),
};

export default videoApi;
