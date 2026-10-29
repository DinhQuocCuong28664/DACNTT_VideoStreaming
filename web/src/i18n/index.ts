import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import vi from './locales/vi.json';
import en from './locales/en.json';

// Vietnamese is the product's own language and the fallback for untranslated keys. A saved
// choice wins over the browser language, so a reload never overrides the user.
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { vi: { translation: vi }, en: { translation: en } },
    fallbackLng: 'vi',
    supportedLngs: ['vi', 'en'],
    nonExplicitSupportedLngs: true,
    detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: 'vidshare-language', caches: ['localStorage'] },
    // React escapes when rendering.
    interpolation: { escapeValue: false },
  });

// The lang attribute drives screen-reader voices and word breaking.
const syncDocumentLanguage = (lng: string | undefined) => {
  document.documentElement.lang = lng?.startsWith('en') ? 'en' : 'vi';
};
syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language);
i18n.on('languageChanged', syncDocumentLanguage);

export default i18n;
