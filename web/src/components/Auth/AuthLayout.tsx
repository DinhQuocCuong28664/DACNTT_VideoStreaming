import type { InputHTMLAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MdErrorOutline } from 'react-icons/md';
import { LogoIcon } from '../Layout/Logo';
import './AuthForm.css';

/**
 * Shared frame of the auth pages, like Google's sign-in: one large card with the logo, title
 * and subtitle on the left and the form on the right, a language picker below.
 */
export default function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="auth-page">
      <main className="auth-card">
        <div className="auth-card-intro">
          <span className="auth-logo" aria-hidden="true"><LogoIcon size={22} /></span>
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        </div>
        <div className="auth-card-body">{children}</div>
      </main>
      <footer className="auth-page-footer">
        <label className="auth-lang">
          <span className="visually-hidden">{t('language.label')}</span>
          <select value={i18n.resolvedLanguage} onChange={(e) => void i18n.changeLanguage(e.target.value)}>
            <option value="vi">{t('language.vi')}</option>
            <option value="en">{t('language.en')}</option>
          </select>
        </label>
      </footer>
    </div>
  );
}

/** Outlined input with the label in the border, and a help or error line below. */
export function AuthField({ label, help, error, id, ...input }: { label: string; help?: string; error?: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="auth-field">
      <label className={`studio-field ${error ? 'has-error' : ''}`} htmlFor={id}>
        <span className="studio-field-label">{label}</span>
        <input id={id} aria-invalid={Boolean(error)} {...input} />
      </label>
      {error ? <p className="field-error"><MdErrorOutline aria-hidden="true" /> {error}</p> : help && <p className="field-help">{help}</p>}
    </div>
  );
}

/** Error of the whole form, above the fields. */
export function AuthError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="auth-error" role="alert"><MdErrorOutline aria-hidden="true" /><span>{children}</span></p>;
}
