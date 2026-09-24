import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Thông báo nhỏ góc dưới trái kiểu snackbar của YouTube, thay cho alert() của
 * trình duyệt. `role="status"` để trình đọc màn hình đọc lên mà không cướp
 * focus. Tự ẩn sau 4 giây.
 *
 *   const [toast, showToast] = useToast();
 *   showToast('Đã lưu');
 *   return <>{...}{toast}</>;
 */
const useToast = () => {
  const [message, setMessage] = useState(null);
  const timer = useRef(null);

  const show = useCallback((text) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(null), 4000);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const node = (
    <div className="toast-region" role="status" aria-live="polite">
      {message && <div className="toast">{message}</div>}
    </div>
  );

  return [node, show];
};

export default useToast;
