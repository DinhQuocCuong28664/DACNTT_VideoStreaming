import axios from 'axios';
import axiosClient from './axiosClient';

export const videoApi = {
  getUploadUrl: (filename, mimetype) =>
    axiosClient.post('/videos/upload-url', { filename, mimetype }),

  createVideo: (videoData) =>
    axiosClient.post('/videos', videoData),

  confirmUpload: (videoId) =>
    axiosClient.patch(`/videos/${videoId}/confirm-upload`),

  getAllVideos: (page = 1, limit = 12) =>
    axiosClient.get('/videos', { params: { page, limit } }),

  getVideoById: (id) =>
    axiosClient.get(`/videos/${id}`),

  getUserVideos: (userId, page = 1, limit = 12) =>
    axiosClient.get(`/videos/user/${userId}`, { params: { page, limit } }),

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
