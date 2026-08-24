import axiosClient from './axiosClient';

export const authApi = {
  register: (username, email, password) =>
    axiosClient.post('/auth/register', { username, email, password }),

  login: (email, password) =>
    axiosClient.post('/auth/login', { email, password }),

  googleLogin: (credential) =>
    axiosClient.post('/auth/google', { credential }),

  linkGoogle: (credential) =>
    axiosClient.post('/auth/link-google', { credential }),

  getMe: () => axiosClient.get('/auth/me'),

  forgotPassword: (email) =>
    axiosClient.post('/auth/forgot-password', { email }),

  resetPassword: (token, password) =>
    axiosClient.post(`/auth/reset-password/${token}`, { password }),

  changePassword: (currentPassword, newPassword) =>
    axiosClient.put('/auth/change-password', { currentPassword, newPassword }),
};

export default authApi;
