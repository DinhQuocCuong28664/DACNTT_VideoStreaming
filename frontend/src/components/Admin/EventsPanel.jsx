import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import adminApi from '../../api/adminApi';
import useInfiniteList from '../../hooks/useInfiniteList';
import { LoadMoreFooter } from '../Video/VideoListParts';
import { timeAgo } from '../../utils/format';

const OUTCOMES = ['false_positive', 'flag_noise', 'false_negative', 'true_positive', 'true_negative', 'unclassified'];

const nameOf = (user) => user?.displayName || user?.username || '?';

/** Nhật ký quyết định kiểm duyệt (chỉ đọc). */
const DecisionLog = () => {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState('');

  const fetchPage = useCallback(
    async (page) => {
      const res = await adminApi.getEvents(outcome, page, 20);
      const { events, pagination } = res.data.data;
      return { items: events, pages: pagination?.pages, total: pagination?.total };
    },
    [outcome],
  );
  const list = useInfiniteList(fetchPage);

  return (
    <>
      <label className="admin-inline-form">
        <span>{t('admin.events.outcome')}</span>
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="">{t('admin.events.allOutcomes')}</option>
          {OUTCOMES.map((o) => (
            <option key={o} value={o}>{t(`admin.outcomes.${o}`)}</option>
          ))}
        </select>
      </label>

      {list.status === 'loading' ? (
        <div className="flex-center admin-loading"><div className="spinner" /></div>
      ) : list.items.length === 0 ? (
        <p className="admin-muted">{t('admin.events.empty')}</p>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin.events.when')}</th>
                <th>{t('admin.events.video')}</th>
                <th>{t('admin.events.actor')}</th>
                <th>{t('admin.events.machine')}</th>
                <th>{t('admin.events.decision')}</th>
                <th>{t('admin.events.outcome')}</th>
                <th>{t('admin.reasonLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((e) => (
                <tr key={e._id}>
                  <td>{timeAgo(t, e.createdAt)}</td>
                  <td>
                    {e.video?._id ? (
                      <Link to={`/watch/${e.video._id}`} target="_blank" rel="noopener noreferrer">{e.video.title}</Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{nameOf(e.actor)} <span className="admin-muted">({e.actorRole})</span></td>
                  <td>{e.autoStatus ? t(`moderationStatus.${e.autoStatus}`) : '—'}</td>
                  <td>{t(`admin.events.action.${e.action}`)}</td>
                  <td>{t(`admin.outcomes.${e.outcome}`)}</td>
                  <td>{t(`admin.decisionReasons.${e.reasonCode}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <LoadMoreFooter list={list} />
        </>
      )}
    </>
  );
};

/** Nhật ký đổi vai trò (chỉ đọc). */
const RoleChangeLog = () => {
  const { t } = useTranslation();
  const fetchPage = useCallback(async (page) => {
    const res = await adminApi.getRoleChanges(page, 20);
    const { changes, pagination } = res.data.data;
    return { items: changes, pages: pagination?.pages, total: pagination?.total };
  }, []);
  const list = useInfiniteList(fetchPage);

  if (list.status === 'loading') return <div className="flex-center admin-loading"><div className="spinner" /></div>;
  if (list.items.length === 0) return <p className="admin-muted">{t('admin.events.empty')}</p>;

  return (
    <>
      <table className="admin-table">
        <thead>
          <tr>
            <th>{t('admin.events.when')}</th>
            <th>{t('admin.events.actor')}</th>
            <th>{t('admin.users.user')}</th>
            <th>{t('admin.users.change')}</th>
          </tr>
        </thead>
        <tbody>
          {list.items.map((c) => (
            <tr key={c._id}>
              <td>{timeAgo(t, c.createdAt)}</td>
              <td>{nameOf(c.actor)}</td>
              <td>{nameOf(c.target)}</td>
              <td>{t(`admin.roles.${c.from}`)} → {t(`admin.roles.${c.to}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <LoadMoreFooter list={list} />
    </>
  );
};

const EventsPanel = () => {
  const { t } = useTranslation();
  const [view, setView] = useState('decisions');

  return (
    <>
      <div className="admin-tabs admin-subtabs" role="tablist">
        {['decisions', 'roles'].map((key) => (
          <button key={key} type="button" role="tab" className="admin-tab" aria-selected={view === key} onClick={() => setView(key)}>
            {t(`admin.events.view.${key}`)}
          </button>
        ))}
      </div>
      {view === 'decisions' ? <DecisionLog /> : <RoleChangeLog />}
    </>
  );
};

export default EventsPanel;
