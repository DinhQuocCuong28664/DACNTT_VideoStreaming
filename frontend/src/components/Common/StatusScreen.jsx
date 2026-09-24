import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mascot } from 'page-mascot';
import Logo from '../Layout/Logo';
import './StatusScreen.css';

/**
 * Khung chung cho hai trang lỗi điều hướng: 404 và 403, theo kiểu trang
 * "This page isn't available" của YouTube: nền trơn, một thanh trên chỉ có
 * logo, nội dung ở giữa gồm linh vật, một câu tiêu đề, một câu phụ và nút về
 * trang chủ. Mã lỗi chỉ còn là một dòng chữ nhỏ ở cuối.
 *
 * Linh vật dùng chung một nhân vật dựng sẵn: hai tờ sprite 3×3, một tờ chín
 * hướng nhìn và một tờ chín biểu cảm. Thư viện tự chọn ô theo góc con trỏ, tự
 * tắt việc bám chuột khi không có chuột thật, và tự đứng yên khi người dùng
 * bật tuỳ chọn giảm chuyển động.
 */
const StatusScreen = ({ code, namespace, secondaryAction }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const mascotRef = useRef(null);

  /**
   * Thư viện tự ghép nhãn thành "Boop the <label>", tức là phần động từ luôn
   * là tiếng Anh. Trên giao diện tiếng Việt, trình đọc màn hình sẽ đọc ra một
   * câu nửa Anh nửa Việt. Ghi đè lại nhãn của chính nút đó sau khi dựng xong,
   * và chạy lại mỗi lần đổi ngôn ngữ.
   */
  useEffect(() => {
    const button = mascotRef.current?.querySelector('button');
    if (button) button.setAttribute('aria-label', t(`${namespace}.mascotLabel`));
  }, [t, namespace, i18n.language]);

  return (
    <div className="status-page">
      <header className="status-topbar">
        <Logo />
      </header>

      <main className="status-content">
        <div className="status-mascot" ref={mascotRef}>
          <Mascot
            directions="/mascots/cat-directions.webp"
            reactions="/mascots/cat-reactions.webp"
            size={200}
            label={t(`${namespace}.mascotLabel`)}
          />
        </div>

        <h1 className="status-message">{t(`${namespace}.message`)}</h1>
        <p className="status-submessage">{t(`${namespace}.body`)}</p>

        <div className="status-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
            {t(`${namespace}.home`)}
          </button>
          {secondaryAction}
        </div>

        <p className="status-info">{t(`${namespace}.info`, { code })}</p>
      </main>
    </div>
  );
};

export default StatusScreen;
