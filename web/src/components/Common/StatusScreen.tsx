import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation, withTranslation, type WithTranslation } from 'react-i18next';
import { MdErrorOutline } from 'react-icons/md';
import { Mascot } from 'page-mascot';
import Logo, { LogoIcon } from '../Layout/Logo';
import { useAuth } from '../../context/auth';
import '../Layout/Logo.css';
import './StatusScreen.css';
import './ErrorBoundary.css';

export function Spinner() {
  return <div className="flex-center full-screen-center"><div className="spinner" /></div>;
}

/** YouTube-style "page isn't available" screen shared by 404 and 403, with the cat mascot. */
export function StatusScreen({ code, namespace, secondaryAction }: { code: string; namespace: 'notFound' | 'forbidden'; secondaryAction?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const mascotRef = useRef<HTMLDivElement>(null);

  // The library labels its button "Boop the <label>" in English; replace the whole label.
  useEffect(() => {
    mascotRef.current?.querySelector('button')?.setAttribute('aria-label', t(`${namespace}.mascotLabel`));
  }, [t, namespace, i18n.language]);

  return (
    <div className="status-page">
      <header className="status-topbar"><Logo /></header>
      <main className="status-content">
        <div className="status-mascot" ref={mascotRef}>
          <Mascot directions="/mascots/cat-directions.webp" reactions="/mascots/cat-reactions.webp" size={200} label={t(`${namespace}.mascotLabel`)} />
        </div>
        <h1 className="status-message">{t(`${namespace}.message`)}</h1>
        <p className="status-submessage">{t(`${namespace}.body`)}</p>
        <div className="status-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>{t(`${namespace}.home`)}</button>
          {secondaryAction}
        </div>
        <p className="status-info">{t(`${namespace}.info`, { code })}</p>
      </main>
    </div>
  );
}

export function NotFoundPage() {
  return <StatusScreen code="404" namespace="notFound" />;
}

/** 403 with a sign-in button for guests: a private video may be their own. */
export function ForbiddenPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return (
    <StatusScreen
      code="403"
      namespace="forbidden"
      secondaryAction={!isAuthenticated && <Link to="/login" state={{ from }} className="btn btn-primary">{t('nav.login')}</Link>}
    />
  );
}

interface BoundaryState { error: Error | null }

/** Catches render errors so a crash shows a way back instead of a blank page. */
class Boundary extends Component<WithTranslation & { children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught render error:', error, info.componentStack);
  }

  override render() {
    const { t, children } = this.props;
    if (!this.state.error) return children;
    return (
      <div className="status-page">
        <header className="status-topbar">
          <a href="/" className="brand-logo" aria-label="VidShare">
            <span className="brand-logo-tile"><LogoIcon size={18} /></span>
            <span className="brand-logo-text">VidShare</span>
          </a>
        </header>
        <main className="status-content">
          <MdErrorOutline className="status-icon" aria-hidden="true" />
          <h1 className="status-message">{t('errorBoundary.title')}</h1>
          <p className="status-submessage">{t('errorBoundary.body')}</p>
          <div className="status-actions">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>{t('errorBoundary.reload')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => window.location.assign('/')}>{t('errorBoundary.home')}</button>
          </div>
          {import.meta.env.DEV && (
            <details className="eb-details"><summary>{t('errorBoundary.details')}</summary><pre>{String(this.state.error.stack ?? this.state.error)}</pre></details>
          )}
        </main>
      </div>
    );
  }
}

export const ErrorBoundary = withTranslation()(Boundary);
