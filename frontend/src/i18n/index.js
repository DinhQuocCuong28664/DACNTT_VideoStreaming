import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import vi from './locales/vi.json';
import en from './locales/en.json';

// Tiếng Việt là ngôn ngữ gốc của sản phẩm nên đặt làm fallback: nếu một khoá
// chưa được dịch sang tiếng Anh, người dùng vẫn thấy chữ tiếng Việt thay vì
// thấy tên khoá. Thứ tự dò là lựa chọn đã lưu trước, rồi mới tới ngôn ngữ của
// trình duyệt, để lựa chọn của người dùng không bị ghi đè sau mỗi lần tải lại.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      vi: { translation: vi },
      en: { translation: en },
    },
    fallbackLng: 'vi',
    supportedLngs: ['vi', 'en'],
    nonExplicitSupportedLngs: true,
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'vidshare-language',
      caches: ['localStorage'],
    },
    interpolation: {
      // React đã chống XSS khi render, nên không cần i18next escape thêm lần nữa.
      escapeValue: false,
    },
  });

export default i18n;
