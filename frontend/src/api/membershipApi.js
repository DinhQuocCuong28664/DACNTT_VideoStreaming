import axiosClient from './axiosClient';

export const membershipApi = {
  getTiers: (channelId) => axiosClient.get(`/memberships/tiers/${channelId}`),

  getStatus: (channelId) => axiosClient.get(`/memberships/status/${channelId}`),

  join: (channelId, data = {}) => axiosClient.post(`/memberships/join/${channelId}`, data),

  cancel: (channelId) => axiosClient.post(`/memberships/cancel/${channelId}`),

  getMembers: (channelId, params) =>
    axiosClient.get(`/memberships/members/${channelId}`, { params }),

  createOrUpdateTier: (channelId, data) =>
    axiosClient.post(`/memberships/tiers/${channelId}`, data),

  deleteTier: (channelId, tierId) =>
    axiosClient.delete(`/memberships/tiers/${channelId}/${tierId}`),
};

export default membershipApi;
