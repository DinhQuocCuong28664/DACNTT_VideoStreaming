import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '../../lib/errors';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
/** The largest width Google Identity Services allows. */
const GIS_MAX_WIDTH = 400;

interface GoogleId {
  initialize(o: { client_id: string; callback: (r: { credential: string }) => void }): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
}
const gis = () => (window as unknown as { google?: { accounts?: { id?: GoogleId } } }).google?.accounts?.id;

// GIS may be initialised once per page; one fixed callback forwards to the button on screen.
let initialized = false;
let activeHandler: ((r: { credential: string }) => void) | null = null;

/**
 * "Continue with Google" from Google Identity Services (loaded by public/gsi-loader.js). Renders
 * nothing without a client id. The caller decides what the credential is for (sign-in or link).
 */
export default function GoogleSignInButton({ onCredential, onError, text = 'continue_with' }: {
  onCredential: (idToken: string) => Promise<void>;
  onError?: (message: string) => void;
  text?: 'continue_with' | 'signin_with' | 'signup_with';
}) {
  const { t, i18n } = useTranslation();
  const buttonRef = useRef<HTMLDivElement>(null);
  const handlerRef = useRef<(r: { credential: string }) => void>(() => undefined);
  // The button text follows the language GIS was loaded with; it changes on the next load.
  const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'vi';

  useEffect(() => {
    handlerRef.current = (r) => {
      onCredential(r.credential).catch((err: unknown) => onError?.(errorText(t, err) || t('auth.googleFailed')));
    };
  });

  useEffect(() => {
    const el = buttonRef.current;
    if (!CLIENT_ID || !el) return undefined;
    const handler = (r: { credential: string }) => handlerRef.current(r);
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const render = () => {
      const id = gis();
      const width = Math.min(el.clientWidth, GIS_MAX_WIDTH);
      if (!id || width <= 0) return;
      el.replaceChildren();
      id.renderButton(el, { theme: 'outline', size: 'large', width, text, locale, shape: 'pill' });
    };
    const tryInit = () => {
      if (cancelled) return;
      const id = gis();
      if (!id) { timer = setTimeout(tryInit, 100); return; }
      if (!initialized) {
        id.initialize({ client_id: CLIENT_ID, callback: (r) => activeHandler?.(r) });
        initialized = true;
      }
      activeHandler = handler;
      render();
      observer = new ResizeObserver(render);
      observer.observe(el);
    };
    tryInit();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer?.disconnect();
      if (activeHandler === handler) activeHandler = null;
    };
  }, [locale, text]);

  if (!CLIENT_ID) return null;
  return <div ref={buttonRef} className="google-signin-button" />;
}
