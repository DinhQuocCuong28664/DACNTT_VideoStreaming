import { useState, useEffect } from 'react';
import authApi from '../api/authApi';
import AuthContext from './authContextDef';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const isAuthenticated = !!user;

  // Ghi user vào cả state React lẫn localStorage — dùng chung cho mọi luồng
  // cập nhật user (login, đổi avatar, liên kết Google...) để tránh lặp lại
  // cùng 2 dòng này ở từng hàm.
  const persistUser = (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  // On app load: check if token exists and validate it
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await authApi.getMe();
        setUser(res.data.data.user);
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email, password) => {
    const res = await authApi.login(email, password);
    const { user: userData, token } = res.data.data;
    localStorage.setItem('token', token);
    persistUser(userData);
    return userData;
  };

  const loginWithGoogle = async (credential) => {
    const res = await authApi.googleLogin(credential);
    const { user: userData, token } = res.data.data;
    localStorage.setItem('token', token);
    persistUser(userData);
    return userData;
  };

  const linkGoogleAccount = async (credential) => {
    const res = await authApi.linkGoogle(credential);
    const { user: userData } = res.data.data;
    persistUser(userData);
    return userData;
  };

  const register = async (username, email, password) => {
    const res = await authApi.register(username, email, password);
    const { user: userData, token } = res.data.data;
    localStorage.setItem('token', token);
    persistUser(userData);
    return userData;
  };

  // Cập nhật trực tiếp user hiện tại (vd. sau khi đổi avatar) mà không cần
  // gọi lại API — component gọi hàm này đã tự có sẵn user mới từ response.
  const updateUser = (userData) => {
    persistUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    loginWithGoogle,
    linkGoogleAccount,
    register,
    updateUser,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
