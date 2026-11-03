/**
 * Sign-in, registration, password recovery and e-mail verification on the v2 API. Links in the
 * e-mails are /verify-email?token= and /reset-password?token=.
 */
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { MdCheckCircleOutline, MdErrorOutline, MdOutlineMarkEmailRead } from 'react-icons/md';
import { auth } from '../../api/endpoints';
import { useAuth } from '../../context/auth';
import { isInternalPath } from '../../lib/paths';
import { errorText } from '../../lib/errors';
import AuthLayout, { AuthError, AuthField } from '../../components/Auth/AuthLayout';
import GoogleSignInButton from '../../components/Auth/GoogleSignInButton';
import { ResendVerificationButton } from '../../components/Auth/EmailVerification';

/** Back to the page that sent the user to sign in, or home. */
function useAuthRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  return () => navigate(isInternalPath(from) ? from : '/', { replace: true });
}

function useForm<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState('');
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));
    setError('');
  };
  return { values, onChange, error, setError };
}

const ShowPassword = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => {
  const { t } = useTranslation();
  return <label className="auth-check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{t('auth.showPassword')}</label>;
};

export function LoginPage() {
  const { t } = useTranslation();
  const { login, loginWithGoogle } = useAuth();
  const done = useAuthRedirect();
  const location = useLocation();
  const form = useForm({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(form.values.email, form.values.password);
      done();
    } catch (err) {
      form.setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <form className="auth-form" onSubmit={(e) => void submit(e)}>
        <AuthError>{form.error}</AuthError>
        <AuthField id="email" name="email" type="email" label="Email" autoComplete="email" value={form.values.email} onChange={form.onChange} required autoFocus />
        <AuthField id="password" name="password" type={show ? 'text' : 'password'} label={t('auth.passwordLabel')} autoComplete="current-password" value={form.values.password} onChange={form.onChange} required />
        <div className="auth-row">
          <ShowPassword checked={show} onChange={setShow} />
          <Link to="/forgot-password" state={location.state} className="auth-link">{t('auth.forgotPassword')}</Link>
        </div>
        <div className="auth-divider"><span>{t('auth.or')}</span></div>
        <GoogleSignInButton onCredential={async (c) => { await loginWithGoogle(c); done(); }} onError={form.setError} />
        <div className="auth-actions">
          <Link to="/register" state={location.state} className="btn btn-ghost">{t('auth.createAccount')}</Link>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('auth.loginSubmitting') : t('auth.loginSubmit')}</button>
        </div>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { t } = useTranslation();
  const { register, loginWithGoogle } = useAuth();
  const done = useAuthRedirect();
  const location = useLocation();
  const form = useForm({ displayName: '', handle: '', email: '', password: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.values.password !== form.values.confirm) return setMismatch(true);
    setBusy(true);
    try {
      const handle = form.values.handle.trim().replace(/^@/, '').toLowerCase();
      await register({ email: form.values.email, password: form.values.password, displayName: form.values.displayName, ...(handle ? { handle } : {}) });
      done();
    } catch (err) {
      form.setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
    return undefined;
  };
  const change = (e: ChangeEvent<HTMLInputElement>) => { form.onChange(e); setMismatch(false); };

  return (
    <AuthLayout title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
      <form className="auth-form" onSubmit={(e) => void submit(e)}>
        <AuthError>{form.error}</AuthError>
        <AuthField id="displayName" name="displayName" label={t('auth.displayNameLabel')} autoComplete="name" value={form.values.displayName} onChange={change} required maxLength={50} autoFocus />
        <AuthField id="handle" name="handle" label={t('auth.usernameLabel')} help={t('auth.handleHelp')} autoComplete="username" value={form.values.handle} onChange={change} minLength={3} maxLength={30} pattern="@?[A-Za-z0-9][A-Za-z0-9._]{1,28}[A-Za-z0-9]" />
        <AuthField id="reg-email" name="email" type="email" label="Email" autoComplete="email" value={form.values.email} onChange={change} required />
        <div className="auth-field-pair">
          <AuthField id="reg-password" name="password" type={show ? 'text' : 'password'} label={t('auth.passwordLabel')} autoComplete="new-password" value={form.values.password} onChange={change} required minLength={8} />
          <AuthField id="confirm" name="confirm" type={show ? 'text' : 'password'} label={t('auth.confirmPasswordLabel')} autoComplete="new-password" value={form.values.confirm} onChange={change} error={mismatch ? t('auth.passwordMismatch') : ''} required minLength={8} />
        </div>
        <p className="field-help">{t('auth.passwordHint')}</p>
        <ShowPassword checked={show} onChange={setShow} />
        <div className="auth-divider"><span>{t('auth.or')}</span></div>
        <GoogleSignInButton text="signup_with" onCredential={async (c) => { await loginWithGoogle(c); done(); }} onError={form.setError} />
        <div className="auth-actions">
          <Link to="/login" state={location.state} className="btn btn-ghost">{t('auth.signInInstead')}</Link>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('auth.registerSubmitting') : t('auth.registerSubmit')}</button>
        </div>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const back = <Link to="/login" state={location.state} className="btn btn-ghost">{t('auth.backToLogin')}</Link>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await auth.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')}>
      {sent ? (
        <div className="auth-form">
          <div className="auth-state">
            <MdOutlineMarkEmailRead className="auth-state-icon" aria-hidden="true" />
            <p className="auth-state-title">{t('auth.checkInbox')}</p>
            <p className="auth-state-desc"><Trans i18nKey="auth.forgotSent" values={{ email }} components={{ 1: <strong /> }} /></p>
          </div>
          <div className="auth-actions">{back}</div>
        </div>
      ) : (
        <form className="auth-form" onSubmit={(e) => void submit(e)}>
          <AuthError>{error}</AuthError>
          <AuthField id="email" name="email" type="email" label="Email" help={t('auth.forgotHelp')} autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} required autoFocus />
          <div className="auth-actions">
            {back}
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('auth.forgotSubmitting') : t('auth.forgotSubmit')}</button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { adopt } = useAuth();
  const navigate = useNavigate();
  const form = useForm({ password: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.values.password !== form.values.confirm) return setMismatch(true);
    setBusy(true);
    try {
      // The reset signs the user in: the link proved the mailbox.
      adopt(await auth.resetPassword(token, form.values.password));
      navigate('/', { replace: true });
    } catch (err) {
      form.setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
    return undefined;
  };
  const change = (e: ChangeEvent<HTMLInputElement>) => { form.onChange(e); setMismatch(false); };

  if (!token) {
    return (
      <AuthLayout title={t('auth.resetTitle')}>
        <div className="auth-form"><AuthError>{t('auth.resetFailed')}</AuthError><div className="auth-actions"><Link to="/forgot-password" className="btn btn-primary">{t('auth.forgotSubmit')}</Link></div></div>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')}>
      <form className="auth-form" onSubmit={(e) => void submit(e)}>
        <AuthError>{form.error}</AuthError>
        <AuthField id="password" name="password" type={show ? 'text' : 'password'} label={t('auth.newPasswordLabel')} help={t('auth.passwordHint')} autoComplete="new-password" value={form.values.password} onChange={change} required minLength={8} autoFocus />
        <AuthField id="confirm" name="confirm" type={show ? 'text' : 'password'} label={t('auth.confirmNewPasswordLabel')} autoComplete="new-password" value={form.values.confirm} onChange={change} error={mismatch ? t('auth.passwordMismatch') : ''} required minLength={8} />
        <ShowPassword checked={show} onChange={setShow} />
        <div className="auth-actions">
          <Link to="/login" className="btn btn-ghost">{t('auth.backToLogin')}</Link>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('auth.resetSubmitting') : t('auth.resetSubmit')}</button>
        </div>
      </form>
    </AuthLayout>
  );
}

// One request per token, even when React runs the effect twice in development.
const attempts = new Map<string, Promise<unknown>>();
const verifyOnce = (token: string) => {
  if (!attempts.has(token)) attempts.set(token, auth.verifyEmail(token));
  return attempts.get(token) as Promise<unknown>;
};

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { user, isAuthenticated, refreshUser } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'done' | 'failed'>(token ? 'verifying' : 'failed');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return undefined;
    let live = true;
    verifyOnce(token)
      .then(async () => { if (isAuthenticated) await refreshUser(); if (live) setStatus('done'); })
      .catch((err: unknown) => { if (live) { setStatus('failed'); setMessage(errorText(t, err)); } });
    return () => { live = false; };
  }, [token, isAuthenticated, refreshUser, t]);

  const verified = status === 'done' || (status === 'failed' && user?.emailVerified === true);
  let body;
  if (status === 'verifying') {
    body = <div className="auth-state"><div className="spinner" /><p className="auth-state-desc">{t('verify.verifying')}</p></div>;
  } else if (verified) {
    body = (
      <>
        <div className="auth-state">
          <MdCheckCircleOutline className="auth-state-icon is-success" aria-hidden="true" />
          <p className="auth-state-title">{t('verify.doneTitle')}</p>
          <p className="auth-state-desc">{t('verify.doneDesc')}</p>
        </div>
        <div className="auth-actions">
          {isAuthenticated
            ? <><Link to="/" className="btn btn-ghost">{t('verify.goHome')}</Link><Link to="/upload" className="btn btn-primary">{t('verify.goUpload')}</Link></>
            : <Link to="/login" state={{ from: '/upload' }} className="btn btn-primary">{t('auth.loginSubmit')}</Link>}
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div className="auth-state">
          <MdErrorOutline className="auth-state-icon" aria-hidden="true" />
          <p className="auth-state-title">{t('verify.failedTitle')}</p>
          {message && <p className="auth-state-desc">{message}</p>}
          <p className="auth-state-desc">{t('verify.failedHint')}</p>
        </div>
        <div className="auth-actions">
          {isAuthenticated ? <ResendVerificationButton className="btn btn-primary" /> : <Link to="/login" className="btn btn-primary">{t('verify.signInToResend')}</Link>}
        </div>
      </>
    );
  }
  return (
    <AuthLayout title={t('verify.title')} subtitle={t('verify.subtitle')}>
      <div className="auth-form" aria-live="polite">{body}</div>
    </AuthLayout>
  );
}
