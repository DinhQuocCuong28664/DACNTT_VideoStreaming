/**
 * Overview tab of the staff console, for administrators: users and plans, content and
 * processing, screening, captions and views over 7, 30 or 90 days. Each daily chart has one
 * series, so it needs no legend; hovering a day shows its value, and the same numbers are
 * available as a table.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { admin, type Overview, type OverviewDay, type OverviewDays } from '../../api/endpoints';
import { Spinner } from '../Common/StatusScreen';
import './OverviewPanel.css';

const WINDOWS: readonly OverviewDays[] = [7, 30, 90];
const SERIES = ['signups', 'uploads', 'views'] as const;
type Series = (typeof SERIES)[number];
const valueOf = (d: OverviewDay, s: Series): number => (s === 'signups' ? d.signups : s === 'uploads' ? d.uploads : d.views);

export default function OverviewPanel() {
  const { t, i18n } = useTranslation();
  const [days, setDays] = useState<OverviewDays>(30);
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setFailed(false);
    admin.overview(days).then((o) => { if (live) setData(o); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [days]);

  const locale = i18n.resolvedLanguage === 'en' ? 'en-US' : 'vi-VN';
  const num = (n: number) => n.toLocaleString(locale);
  const vnd = (n: number) => n.toLocaleString(locale, { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

  const switcher = (
    <div className="admin-subtabs ov-windows" role="tablist" aria-label={t('admin.overview.window')}>
      {WINDOWS.map((d) => (
        <button key={d} type="button" role="tab" aria-selected={days === d} className="chip" onClick={() => setDays(d)}>
          {t('admin.overview.lastDays', { count: d })}
        </button>
      ))}
    </div>
  );
  if (failed) return <section>{switcher}<p className="admin-muted">{t('admin.loadFailed')}</p></section>;
  if (!data || data.days !== days) return <section>{switcher}<div className="admin-loading"><Spinner /></div></section>;

  const { users, plans, videos, moderation, captions, views } = data;
  const readyHours = Math.round(videos.readySeconds / 360) / 10;
  const processing = videos.medianProcessingSec;

  return (
    <section className="ov">
      {switcher}
      <p className="admin-muted admin-intro">{t('admin.overview.intro', { time: new Date(data.generatedAt).toLocaleString(locale) })}</p>

      <h2 className="admin-section-title">{t('admin.overview.usersAndPlans')}</h2>
      <div className="admin-stats ov-stats">
        <Stat label={t('admin.overview.users')} value={num(users.total)} sub={t('admin.overview.usersSub', { verified: num(users.verified), fresh: num(users.new), days })} />
        <Stat label={t('admin.overview.paying')} value={num(plans.paying)} sub={t('admin.overview.payingSub', { plus: plans.plus, pro: plans.pro, max: plans.max })} />
        <Stat label={t('admin.overview.revenue')} value={vnd(plans.monthlyRevenueVnd)} sub={t('admin.overview.revenueSub')} />
        <Stat label={t('admin.overview.free')} value={num(plans.free)} sub={t('admin.overview.freeSub', { legacy: num(plans.legacy) })} />
      </div>
      {(plans.cancelling > 0 || plans.pastDue > 0) && (
        <p className="admin-muted">{t('admin.overview.billingNotice', { cancelling: plans.cancelling, pastDue: plans.pastDue })}</p>
      )}
      <p className="admin-muted">{t('admin.overview.staff', users.staff)}</p>

      <h2 className="admin-section-title">{t('admin.overview.content')}</h2>
      <div className="admin-stats ov-stats">
        <Stat label={t('admin.overview.videos')} value={num(videos.total)} sub={t('admin.overview.videosSub', { ready: num(videos.byStatus.READY), processing: num(videos.byStatus.PROCESSING + videos.byStatus.UPLOADING), error: num(videos.byStatus.ERROR) })} />
        <Stat label={t('admin.overview.readyHours')} value={num(readyHours)} sub={t('admin.overview.readyHoursSub')} />
        <Stat label={t('admin.overview.uploads', { count: days })} value={num(videos.uploads)} sub={t('admin.overview.uploadsSub', { errors: num(videos.errors) })} />
        <Stat
          label={t('admin.overview.processing')}
          value={processing === null ? '—' : t('admin.overview.seconds', { value: num(processing) })}
          sub={t('admin.overview.processingSub', { count: videos.processedSample })}
        />
      </div>

      <h2 className="admin-section-title">{t('admin.overview.servicesTitle')}</h2>
      <div className="admin-stats ov-stats">
        <Stat label={t('admin.overview.screening')} value={num(moderation.approved)} sub={t('admin.overview.screeningSub', { review: num(moderation.review), removed: num(moderation.removed), unscreened: num(moderation.unscreened) })} />
        <Stat label={t('admin.overview.captions')} value={t('admin.overview.minutes', { value: num(captions.minutesUsed) })} sub={t('admin.overview.captionsSub', { month: captions.month, creators: captions.creators })} />
        <Stat label={t('admin.overview.views', { count: days })} value={num(views.views)} sub={t('admin.overview.viewsSub', { hours: num(views.watchHours) })} />
      </div>

      <h2 className="admin-section-title">{t('admin.overview.daily')}</h2>
      <div className="ov-charts">
        {SERIES.map((s) => <DailyBars key={s} title={t(`admin.overview.series.${s}`)} series={s} days={data.daily} locale={locale} />)}
      </div>
      <details className="ov-table-view">
        <summary>{t('admin.overview.asTable')}</summary>
        <table className="admin-table">
          <thead><tr><th>{t('admin.overview.date')}</th>{SERIES.map((s) => <th key={s}>{t(`admin.overview.series.${s}`)}</th>)}</tr></thead>
          <tbody>
            {[...data.daily].reverse().map((d) => (
              <tr key={d.date}><td>{d.date}</td>{SERIES.map((s) => <td key={s}>{num(valueOf(d, s))}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </details>

      <h2 className="admin-section-title">{t('admin.overview.topErrors', { count: days })}</h2>
      {videos.topErrors.length === 0 ? <p className="admin-muted">{t('admin.overview.noErrors')}</p> : (
        <table className="admin-table">
          <thead><tr><th>{t('admin.overview.reason')}</th><th>{t('admin.metrics.count')}</th></tr></thead>
          <tbody>{videos.topErrors.map((e) => <tr key={e.reason}><td className="ov-reason">{e.reason}</td><td>{num(e.count)}</td></tr>)}</tbody>
        </table>
      )}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="admin-stat">
      <p className="admin-stat-label">{label}</p>
      <p className="admin-stat-value">{value}</p>
      <p className="admin-stat-sub">{sub}</p>
    </div>
  );
}

/** One series of daily bars on a zero baseline; the readout shows the hovered day, else the last one. */
function DailyBars({ title, series, days, locale }: { title: string; series: Series; days: readonly OverviewDay[]; locale: string }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const values = days.map((d) => valueOf(d, series));
  const max = Math.max(1, ...values);
  const total = values.reduce((s, v) => s + v, 0);
  const shown = days.at(hover ?? days.length - 1);
  return (
    <figure className="ov-chart">
      <figcaption className="ov-chart-head">
        <span className="ov-chart-title">{title}</span>
        <span className="ov-chart-total">{t('admin.overview.total', { value: total.toLocaleString(locale) })}</span>
      </figcaption>
      <p className="ov-readout" aria-live="polite">
        {shown ? <>{shown.date}: <strong>{valueOf(shown, series).toLocaleString(locale)}</strong></> : null}
      </p>
      <div className="ov-plot" role="img" aria-label={t('admin.overview.chartLabel', { title, total, max })} onMouseLeave={() => setHover(null)}>
        <span className="ov-max">{max.toLocaleString(locale)}</span>
        {days.map((d, i) => (
          <div key={d.date} className={`ov-col${hover === i ? ' is-hover' : ''}`} onMouseEnter={() => setHover(i)}>
            {valueOf(d, series) > 0 && <span className="ov-bar" style={{ height: `${(valueOf(d, series) / max) * 100}%` }} />}
          </div>
        ))}
      </div>
      <div className="ov-axis"><span>{days.at(0)?.date}</span><span>{days.at(-1)?.date}</span></div>
    </figure>
  );
}
