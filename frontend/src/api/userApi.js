import axios from 'axios';
import axiosClient from './axiosClient';

export const userApi = {
  getPublicProfile: (userId) => axiosClient.get(`/users/${userId}`),

  presignAvatarUpload: (filename, mimetype, fileSize) =>
    axiosClient.post('/users/avatar/presign', { filename, mimetype, fileSize }),

  updateAvatar: (key) => axiosClient.put('/users/avatar', { key }),

  // POST thẳng lên S3 bằng presigned POST — dùng axios thuần (không phải
  // axiosClient) vì URL trỏ ra ngoài origin API, không cần header
  // Authorization/interceptor 401 (quyền truy cập nằm trong các trường policy
  // do máy chủ ký). S3 bỏ qua mọi trường đứng sau `file`, nên `file` phải ở
  // cuối; không tự đặt Content-Type để trình duyệt tự điền boundary multipart.
  uploadToS3: ({ url, fields }, file) => {
    const form = new FormData();
    Object.entries(fields).forEach(([name, value]) => form.append(name, value));
    form.append('file', file);
    return axios.post(url, form);
  },
};

export default userApi;
