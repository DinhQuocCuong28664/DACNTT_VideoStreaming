import { useState, useEffect } from 'react';
import ThemeContext from './themeContextDef';

const STORAGE_KEY = 'theme_v2';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const readPreference = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'light';
  } catch {
    return 'light';
  }
};

/**
 * Chủ đề giao diện có ba lựa chọn như YouTube: sáng, tối, hoặc theo thiết bị.
 * `preference` là lựa chọn người dùng lưu lại; `theme` là chủ đề thực sự đang
 * áp dụng (với "theo thiết bị" thì đọc từ prefers-color-scheme và đổi ngay khi
 * hệ điều hành đổi).
 */
export const ThemeProvider = ({ children }) => {
  const [preference, setPreference] = useState(readPreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystemDark(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const theme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Chế độ ẩn danh hoặc bộ nhớ bị chặn: vẫn đổi được trong phiên này.
    }
  }, [preference]);

  /** Nút bật tắt nhanh ở menu: chuyển hẳn sang chủ đề đối lập. */
  const toggleTheme = () => setPreference(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference, toggleTheme, setTheme: setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;
