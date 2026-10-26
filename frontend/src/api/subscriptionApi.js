import axiosClient from './axiosClient';

export const subscriptionApi = {
  getStatus: (channelId) => axiosClient.get(`/subscriptions/${channelId}/status`),

  subscribe: (channelId) => axiosClient.post(`/subscriptions/${channelId}`),

  unsubscribe: (channelId) => axiosClient.delete(`/subscriptions/${channelId}`),

  getSubscribedChannels: (params) => axiosClient.get('/subscriptions/channels', { params }),

  getSubscriptionFeed: (params) => axiosClient.get('/subscriptions/feed', { params }),
};

export default subscriptionApi;
