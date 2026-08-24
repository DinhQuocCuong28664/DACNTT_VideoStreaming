import axios from 'axios';
import axiosClient from './axiosClient';

export const userApi = {
  getPublicProfile: (userId) => axiosClient.get(`/users/${userId}`),

  presignAvatarUpload: (filename, mimetype, fileSize) =>
    axiosClient.post('/users/avatar/presign', { filename, mimetype, fileSize }),

  updateAvatar: (key) => axiosClient.put('/users/avatar', { key }),

  // PUT thẳng lên S3 bằng pre-signed URL — dùng axios thuần (không phải
  // axiosClient) vì URL trỏ ra ngoài origin API, không cần header
  // Authorization/interceptor 401 (quyền truy cập nằm sẵn trong query string
  // của URL). Cùng cách videoApi.uploadToS3 đã làm cho video.
  uploadToS3: (presignedUrl, file) =>
    axios.put(presignedUrl, file, {
      headers: { 'Content-Type': file.type },
    }),
};

export default userApi;
