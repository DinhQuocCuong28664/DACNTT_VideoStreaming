/** Plans: what each platform plan allows and the way to buy one (Stripe Checkout in test mode until payments go live). */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdCheck, MdErrorOutline } from 'react-icons/md';
import { billing } from '../api/endpoints';
import type { PlanId, PlanInfo, PlansResponse } from '../api/types';
import { useAuth } from '../context/auth';
import { errorText } from '../lib/errors';
import { Spinner } from '../components/Common/StatusScreen';
import './PlansPage.css';

const GIB = 1024 ** 3;

export function PlanFeatures({ plan }: { plan: PlanInfo }) {
  const { t } = useTranslation();
  return (
    <ul className="plan-features">
      <li><MdCheck aria-hidden="true" />{t('plans.featureUpload', { gib: Math.round(plan.limits.maxUploadBytes / GIB) })}</li>
      <li><MdCheck aria-hidden="true" />{t('plans.featureTiers', { count: plan.limits.maxTiers })}</li>
      <li><MdCheck aria-hidden="true" />{t('plans.featureAnalytics', { days: plan.limits.analyticsDays })}</li>
      {plan.limits.autoCaptionMinutes > 0 && (
        <li><MdCheck aria-hidden="true" />{t('plans.featureCaptions', { minutes: plan.limits.autoCaptionMinutes, max: plan.limits.autoCaptionMaxVideoMinutes })}</li>
      )}
      {plan.limits.priorityTranscode && <li><MdCheck aria-hidden="true" />{t('plans.featurePriority')}</li>}
    </ul>
  );
}

export default function PlansPage() {
  const { t, i18n } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<PlansResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<PlanId | 'portal' | null>(null);
  const locale = i18n.resolvedLanguage === 'en' ? 'en-US' : 'vi-VN';
  const current: PlanId = user?.plan.id ?? 'free';

  useEffect(() => {
    document.title = `${t('plans.title')} · VidShare`;
    billing.plans().then(setData).catch((err: unknown) => setError(errorText(t, err)));
  }, [t]);

  const go = async (action: () => Promise<{ url: string }>, key: PlanId | 'portal') => {
    setBusy(key);
    setError('');
    try {
      window.location.assign((await action()).url);
    } catch (err) {
      setError(errorText(t, err));
      setBusy(null);
    }
  };

  const choose = (plan: PlanId) => {
    if (!isAuthenticated) return navigate('/login', { state: { from: location.pathname } });
    return go(() => billing.checkout(plan), plan);
  };

  if (!data && !error) return <Spinner />;

  return (
    <main className="plans-page" id="main-content">
      <h1 className="plans-title">{t('plans.title')}</h1>
      <p className="plans-subtitle">{t('plans.subtitle')}</p>
      {data && !data.enabled && <p className="plans-note" role="note">{t('plans.disabled')}</p>}
      {data?.enabled && <p className="plans-note" role="note">{t('plans.testMode')}</p>}
      {error && <p className="plans-error" role="alert"><MdErrorOutline aria-hidden="true" /> {error}</p>}
      <div className="plans-grid">
        {data?.plans.map((plan) => {
          const isCurrent = plan.id === current;
          const paid = plan.id !== 'free';
          return (
            <section key={plan.id} className={`plan-card ${isCurrent ? 'current' : ''}`} aria-labelledby={`plan-${plan.id}`}>
              <h2 id={`plan-${plan.id}`}>{t(`plans.names.${plan.id}`)}</h2>
              <p className="plan-price">
                {paid ? <>{plan.priceVnd.toLocaleString(locale)} ₫<span>/{t('membership.month')}</span></> : t('plans.free')}
              </p>
              <PlanFeatures plan={plan} />
              {isCurrent ? (
                <p className="plan-current">{t('plans.current')}</p>
              ) : paid && current === 'free' ? (
                <button type="button" className="btn btn-primary" disabled={!data.enabled || busy !== null} onClick={() => void choose(plan.id)}>
                  {busy === plan.id ? t('common.loading') : t('plans.choose', { plan: t(`plans.names.${plan.id}`) })}
                </button>
              ) : paid ? (
                <button type="button" className="btn btn-outline" disabled={busy !== null} onClick={() => void go(billing.portal, 'portal')}>
                  {t('plans.manage')}
                </button>
              ) : null}
            </section>
          );
        })}
      </div>
      <p className="plans-legal">{t('plans.renewalNote')}</p>
    </main>
  );
}
