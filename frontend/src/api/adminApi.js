import axiosClient from './axiosClient';

/**
 * API trang vận hành. Mỗi endpoint kiểm tra QUYỀN ở máy chủ (admin, operator, auditor); máy chủ trả 403
 * cho người không đủ quyền, nên việc ẩn tab ở giao diện chỉ là tiện lợi chứ không phải lớp bảo vệ.
 */
export const adminApi = {
  getStats: () => axiosClient.get('/admin/stats'),

  /** tab: 'review' | 'blocked' */
  getQueue: (tab = 'review', page = 1, limit = 20) =>
    axiosClient.get('/admin/videos', { params: { tab, page, limit } }),

  getReports: (videoId) => axiosClient.get(`/admin/videos/${videoId}/reports`),

  /** decision: 'approve' | 'block'; reasonCode bắt buộc (xem DECISION_REASONS). */
  decide: (videoId, decision, reasonCode, note = '') =>
    axiosClient.patch(`/admin/videos/${videoId}/moderation`, { decision, reasonCode, note }),

  // Khiếu nại của chủ video
  getAppeals: (status = 'open', page = 1, limit = 20) =>
    axiosClient.get('/admin/appeals', { params: { status, page, limit } }),
  /** decision: 'uphold' | 'reject' */
  resolveAppeal: (id, decision, note = '') => axiosClient.patch(`/admin/appeals/${id}`, { decision, note }),

  // Kiểm tra mẫu ngẫu nhiên (ước lượng false negative)
  createAuditSample: (size) => axiosClient.post('/admin/audit/sample', { size }),
  getAuditSamples: (status = 'pending', page = 1, limit = 20) =>
    axiosClient.get('/admin/audit', { params: { status, page, limit } }),
  /** result: 'pass' | 'fail' */
  labelAuditSample: (id, result, note = '') => axiosClient.patch(`/admin/audit/${id}`, { result, note }),

  // Số liệu và nhật ký (auditor, admin)
  getMetrics: () => axiosClient.get('/admin/metrics'),
  getEvents: (outcome, page = 1, limit = 20) =>
    axiosClient.get('/admin/events', { params: { ...(outcome ? { outcome } : {}), page, limit } }),
  getRoleChanges: (page = 1, limit = 20) => axiosClient.get('/admin/role-changes', { params: { page, limit } }),

  // Người dùng và vai trò (admin)
  getUsers: ({ q = '', role = '', page = 1, limit = 20 } = {}) =>
    axiosClient.get('/admin/users', { params: { ...(q ? { q } : {}), ...(role ? { role } : {}), page, limit } }),
  changeRole: (userId, role) => axiosClient.patch(`/admin/users/${userId}/role`, { role }),
};

export default adminApi;
