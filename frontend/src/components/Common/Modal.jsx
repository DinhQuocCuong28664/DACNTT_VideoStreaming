import { useEffect, useRef } from 'react';

/**
 * Hộp thoại modal dựng trên phần tử `<dialog>` gốc của trình duyệt.
 *
 * `showModal()` cho sẵn những thứ mà hộp thoại tự dựng bằng `div` phải tự làm
 * và hay làm thiếu: giữ focus trong hộp thoại, làm trơ (inert) phần còn lại
 * của trang, đóng bằng Esc, và đưa focus về nút đã mở khi đóng. Giao diện vẫn
 * dùng các lớp `.dialog-*` của hệ thiết kế, nên trông giống hệt các hộp thoại
 * sẵn có.
 *
 * Việc mở/đóng do component cha điều khiển: dựng component là mở, gỡ nó ra là
 * đóng. Esc và bấm ra nền tối chỉ gọi `onClose`; khi `busy` (đang gửi) thì bỏ
 * qua cả hai để không đóng mất một yêu cầu đang chạy.
 */
const Modal = ({ onClose, labelledBy, className = '', busy = false, children }) => {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    // Trình duyệt tự trả focus về nút đã mở khi <dialog> đóng — nhưng chỉ khi
    // nó còn trong DOM. Cleanup của useEffect chạy SAU khi React đã gỡ phần
    // tử, nên phải tự nhớ và trả focus, không thì người dùng bàn phím bị ném
    // về đầu trang sau mỗi lần đóng hộp thoại.
    const opener = document.activeElement;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog && dialog.open) dialog.close();
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
    };
  }, []);

  const handleCancel = (e) => {
    // Chặn trình duyệt tự đóng: cha quyết định bằng cách gỡ component.
    e.preventDefault();
    if (!busy) onClose();
  };

  const handleClick = (e) => {
    // Bấm vào nền tối thì đích sự kiện chính là <dialog> (nội dung phủ kín hộp).
    if (e.target === ref.current && !busy) onClose();
  };

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby={labelledBy}
      onCancel={handleCancel}
      onClick={handleClick}
    >
      {children}
    </dialog>
  );
};

export default Modal;
