import { useTranslation } from 'react-i18next';
import { FiGlobe } from 'react-icons/fi';

/**
 * Chỉ có hai ngôn ngữ nên một nút bật tắt là đủ, không cần menu thả xuống.
 * Nhãn hiển thị là ngôn ngữ sẽ chuyển sang, chứ không phải ngôn ngữ hiện tại,
 * để người dùng biết bấm vào thì được gì. Lựa chọn được lưu vào localStorage
 * bởi bộ dò ngôn ngữ cấu hình trong src/i18n/index.js.
 */
const LanguageToggle = ({ className = '', showLabel = true }) => {
  const { t, i18n } = useTranslation();

  const next = i18n.resolvedLanguage === 'en' ? 'vi' : 'en';
  const nextLabel = t(`language.${next}`);

  return (
    <button
      type="button"
      className={className}
      onClick={() => i18n.changeLanguage(next)}
      title={t('language.switchTo', { lang: nextLabel })}
      aria-label={t('language.switchTo', { lang: nextLabel })}
    >
      <FiGlobe />
      {showLabel && <span>{next.toUpperCase()}</span>}
    </button>
  );
};

export default LanguageToggle;
