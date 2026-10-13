import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdErrorOutline } from 'react-icons/md';
import adminApi from '../../api/adminApi';

const pct = (ci) => (ci ? `${(ci.value * 100).toFixed(1)}%` : '–');

/** "khoảng 95%: 12,3%–40,1%, từ 20 video" — con số không đi một mình, vì mẫu nhỏ nói rất ít. */
const interval = (t, ci) =>
  ci ? t('admin.metrics.interval', { low: (ci.low * 100).toFixed(1), high: (ci.high * 100).toFixed(1), n: ci.n }) : t('admin.metrics.none');

const Tile = ({ label, value, sub }) => (
  <div className="admin-stat">
    <p className="admin-stat-label">{label}</p>
    <p className="admin-stat-value tabular-nums">{value}</p>
    {sub && <p className="admin-stat-sub">{sub}</p>}
  </div>
);

/**
 * Chất lượng của kiểm duyệt tự động: gỡ nhầm (false positive), bỏ lọt (false negative) và độ chính xác
 * của cờ. Mọi tỉ lệ có khoảng tin cậy và mẫu số, kèm phần đã được người xét (độ phủ).
 */
const MetricsPanel = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getMetrics()
      .then((res) => !cancelled && setData(res.data.data))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <p className="field-error">
        <MdErrorOutline aria-hidden="true" /> {t('admin.loadFailed')}
      </p>
    );
  }
  if (!data) return <div className="flex-center admin-loading"><div className="spinner" /></div>;

  const { autoBlocked, autoFlagged, missed, audit, byLabel, byReason } = data;
  const coverage = (c) => (c === null ? '–' : `${(c * 100).toFixed(0)}%`);

  return (
    <div className="admin-metrics">
      <p className="admin-muted admin-intro">{t('admin.metrics.intro')}</p>

      <div className="admin-stats">
        <Tile
          label={t('admin.metrics.falsePositiveRate')}
          value={pct(autoBlocked.falsePositiveRate)}
          sub={`${interval(t, autoBlocked.falsePositiveRate)} · ${t('admin.metrics.coverage', { value: coverage(autoBlocked.coverage) })}`}
        />
        <Tile
          label={t('admin.metrics.flagPrecision')}
          value={pct(autoFlagged.precision)}
          sub={`${interval(t, autoFlagged.precision)} · ${t('admin.metrics.coverage', { value: coverage(autoFlagged.coverage) })}`}
        />
        <Tile
          label={t('admin.metrics.falseNegativeRate')}
          value={pct(audit.falseNegativeRate)}
          sub={`${interval(t, audit.falseNegativeRate)} · ${t('admin.metrics.auditCounts', { failed: audit.failed, labelled: audit.labelled, pending: audit.pending })}`}
        />
        <Tile label={t('admin.metrics.knownMisses')} value={missed.falseNegative} sub={t('admin.metrics.knownMissesHint')} />
      </div>

      <h2 className="admin-section-title">{t('admin.metrics.byLabel')}</h2>
      {byLabel.length === 0 ? (
        <p className="admin-muted">{t('admin.metrics.none')}</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t('admin.metrics.label')}</th>
              <th>{t('admin.metrics.reviewed')}</th>
              <th>{t('admin.metrics.falsePositive')}</th>
              <th>{t('admin.metrics.rate')}</th>
              <th>{t('admin.metrics.unreviewed')}</th>
            </tr>
          </thead>
          <tbody>
            {byLabel.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className="tabular-nums">{row.reviewed}</td>
                <td className="tabular-nums">{row.falsePositive}</td>
                <td className="tabular-nums">
                  {pct(row.falsePositiveRate)}
                  {row.falsePositiveRate && (
                    <span className="admin-muted"> ({(row.falsePositiveRate.low * 100).toFixed(0)}–{(row.falsePositiveRate.high * 100).toFixed(0)}%)</span>
                  )}
                </td>
                <td className="tabular-nums">{row.unreviewed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="admin-section-title">{t('admin.metrics.byReason')}</h2>
      {byReason.length === 0 ? (
        <p className="admin-muted">{t('admin.metrics.none')}</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t('admin.events.outcome')}</th>
              <th>{t('admin.reasonLabel')}</th>
              <th>{t('admin.metrics.count')}</th>
            </tr>
          </thead>
          <tbody>
            {byReason.map((row) => (
              <tr key={`${row.outcome}-${row.reasonCode}`}>
                <td>{t(`admin.outcomes.${row.outcome}`)}</td>
                <td>{t(`admin.decisionReasons.${row.reasonCode}`)}</td>
                <td className="tabular-nums">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default MetricsPanel;
