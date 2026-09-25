import axiosClient from './axiosClient';

/**
 * API trang kiểm duyệt nội dung. Mọi endpoint yêu cầu vai trò admin; máy chủ
 * trả 403 cho người dùng thường, nên việc ẩn đường dẫn ở giao diện chỉ là tiện
 * lợi chứ không phải lớp bảo vệ.
 */
export const adminApi = {
  getStats: () => axiosClient.get('/admin/stats'),

  /** tab: 'review' | 'blocked' */
  getQueue: (tab = 'review', page = 1, limit = 20) =>
    axiosClient.get('/admin/videos', { params: { tab, page, limit } }),

  getReports: (videoId) => axiosClient.get(`/admin/videos/${videoId}/reports`),

  /** decision: 'approve' | 'block' */
  decide: (videoId, decision, note = '') =>
    axiosClient.patch(`/admin/videos/${videoId}/moderation`, { decision, note }),
};

export default adminApi;
