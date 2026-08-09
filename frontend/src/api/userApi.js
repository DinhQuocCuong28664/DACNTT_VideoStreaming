import axiosClient from './axiosClient';

export const userApi = {
  getPublicProfile: (userId) => axiosClient.get(`/users/${userId}`),
};

export default userApi;
