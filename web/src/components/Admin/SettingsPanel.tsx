/**
 * Settings tab of the staff console, for administrators: the runtime switches of automatic
 * screening and automatic captions. A change applies to videos that start processing (screening)
 * or are published (captions) after it, asks for confirmation, and is logged by the API.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { admin, type SystemSettings } from '../../api/endpoints';
import { ConfirmDialog } from '../Common/Dialogs';
import { Spinner } from '../Common/StatusScreen';
import { errorText } from '../../lib/errors';
import './SettingsPanel.css';

type Key = 'moderationEnabled' | 'autoCaptionsEnabled';

export default function SettingsPanel({ notify }: { notify: (s: string) => void }) {
  const { t, i18n } = useTranslation();
  const [s, setS] = useState<SystemSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<{ key: Key; to: boolean } | null>(null);
  useEffect(() => { admin.settings().then(setS).catch(() => setFailed(true)); }, []);

  const locale = i18n.resolvedLanguage === 'en' ? 'en-US' : 'vi-VN';
  if (failed) return <p className="admin-muted">{t('admin.loadFailed')}</p>;
  if (!s) return <div className="admin-loading"><Spinner /></div>;

  const apply = async () => {
    if (!pending) return;
    try {
      const next = await admin.setSettings({ [pending.key]: pending.to });
      setS(next);
      notify(t(`admin.settings.saved.${pending.key}.${pending.to ? 'on' : 'off'}`));
    } catch (err) {
      notify(t('admin.settings.saveFailed', { message: errorText(t, err) }));
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="st">
      <p className="admin-muted admin-intro">{t('admin.settings.intro')}</p>
      <SwitchCard
        title={t('admin.settings.moderation.title')}
        body={t('admin.settings.moderation.body')}
        cost={t('admin.settings.moderation.cost')}
        on={s.moderation.enabled}
        source={s.moderation.source === 'console' ? t('admin.settings.fromConsole') : t('admin.settings.fromDefault', { value: t(s.moderation.default ? 'admin.settings.on' : 'admin.settings.off') })}
        onToggle={() => setPending({ key: 'moderationEnabled', to: !s.moderation.enabled })}
      />
      <SwitchCard
        title={t('admin.settings.captions.title')}
        body={t('admin.settings.captions.body')}
        cost={t('admin.settings.captions.cost')}
        on={s.autoCaptions.enabled}
        locked={!s.autoCaptions.infraEnabled}
        source={!s.autoCaptions.infraEnabled
          ? t('admin.settings.captions.infraOff')
          : s.autoCaptions.source === 'console' ? t('admin.settings.fromConsole') : t('admin.settings.fromDefault', { value: t('admin.settings.on') })}
        onToggle={() => setPending({ key: 'autoCaptionsEnabled', to: !s.autoCaptions.enabled })}
      />

      <h2 className="admin-section-title">{t('admin.settings.history')}</h2>
      {s.changes.length === 0 ? <p className="admin-muted">{t('admin.settings.noChanges')}</p> : (
        <table className="admin-table">
          <thead><tr><th>{t('admin.settings.when')}</th><th>{t('admin.settings.switch')}</th><th>{t('admin.settings.change')}</th><th>{t('admin.settings.by')}</th></tr></thead>
          <tbody>
            {s.changes.map((c) => (
              <tr key={`${c.at}-${c.key}`}>
                <td>{new Date(c.at).toLocaleString(locale)}</td>
                <td>{t(`admin.settings.keys.${c.key}`)}</td>
                <td>{t(c.from ? 'admin.settings.on' : 'admin.settings.off')} → {t(c.to ? 'admin.settings.on' : 'admin.settings.off')}</td>
                <td>{c.by ? `@${c.by}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pending && (
        <ConfirmDialog
          title={t(`admin.settings.confirm.${pending.key}.${pending.to ? 'on' : 'off'}.title`)}
          message={t(`admin.settings.confirm.${pending.key}.${pending.to ? 'on' : 'off'}.message`)}
          confirmLabel={t(pending.to ? 'admin.settings.turnOn' : 'admin.settings.turnOff')}
          danger={!pending.to}
          onConfirm={apply}
          onClose={() => setPending(null)}
        />
      )}
    </section>
  );
}

function SwitchCard({ title, body, cost, on, source, locked = false, onToggle }: {
  title: string; body: string; cost: string; on: boolean; source: string; locked?: boolean; onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="st-card">
      <div className="st-text">
        <h3 className="st-title">{title}</h3>
        <p className="st-body">{body}</p>
        <p className="st-meta">{cost}</p>
        <p className="st-meta">{source}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        className={`st-switch${on ? ' is-on' : ''}`}
        disabled={locked}
        onClick={onToggle}
      >
        <span className="st-track" aria-hidden="true"><span className="st-knob" /></span>
        <span className="st-state">{t(on ? 'admin.settings.on' : 'admin.settings.off')}</span>
      </button>
    </div>
  );
}
