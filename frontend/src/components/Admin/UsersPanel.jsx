import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import adminApi from '../../api/adminApi';
import useInfiniteList from '../../hooks/useInfiniteList';
import useToast from '../Common/Toast';
import { LoadMoreFooter } from '../Video/VideoListParts';
import { useAuth } from '../../context/useAuth';
import { ROLES } from '../../utils/roles';

const nameOf = (user) => user?.displayName || user?.username || '?';

/**
 * Vai trò người dùng (chỉ admin). Máy chủ chặn đổi vai trò của chính mình và hạ admin cuối cùng; ở đây
 * chỉ vô hiệu hoá ô chọn của chính mình để người dùng không bấm vào điều chắc chắn bị từ chối.
 */
const UsersPanel = () => {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const [toast, showToast] = useToast();
  const [q, setQ] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');
  const [role, setRole] = useState('');
  const [pendingId, setPendingId] = useState(null);

  const fetchPage = useCallback(
    async (page) => {
      const res = await adminApi.getUsers({ q: submittedQ, role, page, limit: 20 });
      const { users, pagination } = res.data.data;
      return { items: users, pages: pagination?.pages, total: pagination?.total };
    },
    [submittedQ, role],
  );
  const list = useInfiniteList(fetchPage);
  const { items, setItems } = list;

  const handleChange = async (target, nextRole) => {
    setPendingId(target._id);
    try {
      const res = await adminApi.changeRole(target._id, nextRole);
      setItems((prev) => prev.map((u) => (u._id === target._id ? { ...u, role: res.data.data.user.role } : u)));
      showToast(t('admin.users.changedToast', { name: nameOf(target), role: t(`admin.roles.${nextRole}`) }));
    } catch (err) {
      showToast(t('admin.decideFailed', { message: err.response?.data?.message || err.message }));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <>
      <form
        className="admin-inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmittedQ(q.trim());
        }}
      >
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.users.search')} maxLength={64} />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label={t('admin.users.filterRole')}>
          <option value="">{t('admin.users.allRoles')}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary">{t('admin.users.searchButton')}</button>
      </form>

      {list.status === 'loading' ? (
        <div className="flex-center admin-loading"><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <p className="admin-muted">{t('admin.users.empty')}</p>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin.users.user')}</th>
                <th>{t('admin.users.email')}</th>
                <th>{t('admin.users.role')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u._id}>
                  <td>{nameOf(u)} <span className="admin-muted">@{u.username}</span></td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={u._id === me?._id || pendingId === u._id}
                      onChange={(e) => handleChange(u, e.target.value)}
                      aria-label={t('admin.users.role')}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <LoadMoreFooter list={list} />
        </>
      )}
      {toast}
    </>
  );
};

export default UsersPanel;
