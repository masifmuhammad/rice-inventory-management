import React, { useCallback, useMemo, useState } from 'react';
import { toast } from '../utils/toast';
import {
  FiCheck,
  FiClock,
  FiKey,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiUserCheck,
  FiUserX,
  FiX,
} from 'react-icons/fi';

import api, { getErrorMessage } from '../services/api';
import useApi from '../hooks/useApi';
import useDebounce from '../hooks/useDebounce';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../components/ui/ConfirmProvider';
import PageHeader from '../components/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import StatCard, { StatGrid } from '../components/ui/StatCard';
import { Select } from '../components/ui/Field';
import { EmptyState, ErrorState, InlineError } from '../components/ui/States';
import { SkeletonStatCards, SkeletonTable } from '../components/ui/Skeleton';
import RefetchIndicator from '../components/ui/RefetchIndicator';
import Modal from '../components/ui/Modal';

const ROLES = [
  { value: 'worker', label: 'Worker' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'admin', label: 'Admin' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All users' },
  { value: 'pending', label: 'Pending approval' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected', label: 'Rejected' },
];

const statusTone = {
  pending: 'warning',
  active: 'success',
  suspended: 'danger',
  rejected: 'danger',
};

const roleTone = {
  admin: 'primary',
  accountant: 'purple',
  worker: 'neutral',
};

const normalizeRole = (role) => (ROLES.some((item) => item.value === role) ? role : 'worker');

const roleLabel = (role) => ROLES.find((item) => item.value === normalizeRole(role))?.label ?? 'Worker';

function RoleBadge({ role }) {
  const value = normalizeRole(role);
  return <Badge tone={roleTone[value] || 'neutral'}>{roleLabel(value)}</Badge>;
}

function RoleSelect({ value, onChange, disabled, 'aria-label': ariaLabel }) {
  return (
    <Select
      bare
      value={normalizeRole(value)}
      onChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      selectClassName="!min-h-[32px] !py-1 !px-2.5 !pr-8 !text-xs font-medium w-[7.5rem] rounded-lg"
    >
      {ROLES.map((role) => (
        <option key={role.value} value={role.value}>
          {role.label}
        </option>
      ))}
    </Select>
  );
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const confirm = useConfirm();

  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [tempPassword, setTempPassword] = useState(null);
  const [acting, setActing] = useState(null);

  const debouncedSearch = useDebounce(search, 350);

  const params = useMemo(
    () => ({
      status: statusFilter,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
    }),
    [statusFilter, debouncedSearch]
  );

  const overview = useApi((signal) => api.get('/admin/overview', { signal }).then((r) => r.data), []);

  const usersQuery = useApi(
    (signal) => api.get('/admin/users', { params, signal }).then((r) => r.data),
    [params],
    { keepPreviousData: true }
  );

  const users = usersQuery.data?.users || [];
  const pendingCount = usersQuery.data?.pendingCount ?? overview.data?.users?.pending ?? 0;

  const runAction = useCallback(
    async (key, request, successMessage) => {
      setActing(key);
      try {
        const { data } = await request();
        toast.success(data.message || successMessage);
        usersQuery.refetch();
        overview.refetch();
        return data;
      } catch (error) {
        toast.error(getErrorMessage(error, 'That action could not be completed'));
        throw error;
      } finally {
        setActing(null);
      }
    },
    [usersQuery, overview]
  );

  const handleApprove = (target, role = 'worker') =>
    runAction(
      `approve-${target.id}`,
      () => api.post(`/admin/users/${target.id}/approve`, { role }),
      `${target.name} approved`
    );

  const handleReject = async (target) => {
    const confirmed = await confirm({
      title: `Decline ${target.name}?`,
      message: 'They will not be able to sign in unless you reactivate them later.',
      confirmLabel: 'Decline',
      tone: 'danger',
    });
    if (!confirmed) return;
    await runAction(
      `reject-${target.id}`,
      () => api.post(`/admin/users/${target.id}/reject`),
      'Request declined'
    );
  };

  const handleSuspend = async (target) => {
    const confirmed = await confirm({
      title: `Suspend ${target.name}?`,
      message: 'They will be signed out immediately and cannot use the app until reactivated.',
      confirmLabel: 'Suspend',
      tone: 'danger',
    });
    if (!confirmed) return;
    await runAction(
      `suspend-${target.id}`,
      () => api.post(`/admin/users/${target.id}/suspend`),
      'User suspended'
    );
  };

  const handleReactivate = (target) =>
    runAction(
      `reactivate-${target.id}`,
      () => api.post(`/admin/users/${target.id}/reactivate`),
      `${target.name} reactivated`
    );

  const handleRoleChange = (target, role) =>
    runAction(
      `role-${target.id}`,
      () => api.put(`/admin/users/${target.id}/role`, { role }),
      'Role updated'
    );

  const handleResetPassword = async (target) => {
    const confirmed = await confirm({
      title: `Reset password for ${target.name}?`,
      message: 'A temporary password will be shown once. They must change it when they sign in.',
      confirmLabel: 'Reset password',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      const data = await runAction(
        `reset-${target.id}`,
        () => api.post(`/admin/users/${target.id}/reset-password`),
        'Temporary password issued'
      );
      setTempPassword({ name: target.name, password: data.temporaryPassword });
    } catch {
      /* toast handled in runAction */
    }
  };

  const loading = usersQuery.loading && !usersQuery.data;
  const refetching = usersQuery.loading && Boolean(usersQuery.data);
  const counts = overview.data?.users;

  return (
    <div className="space-y-6">
      <PageHeader
        title="User management"
        description="Approve sign-ups, assign roles and manage access."
      />

      {overview.loading && !overview.data ? (
        <SkeletonStatCards count={4} />
      ) : overview.error ? (
        <InlineError message={overview.error} onRetry={overview.refetch} />
      ) : (
        <StatGrid>
          <StatCard
            title="Pending approval"
            rawValue={counts?.pending ?? pendingCount}
            icon={FiClock}
            tone={pendingCount > 0 ? 'warning' : 'neutral'}
          />
          <StatCard title="Active" rawValue={counts?.active ?? 0} icon={FiUserCheck} />
          <StatCard title="Suspended" rawValue={counts?.suspended ?? 0} icon={FiShield} />
          <StatCard title="Declined" rawValue={counts?.rejected ?? 0} icon={FiUserX} />
        </StatGrid>
      )}

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="relative lg:col-span-2">
            <FiSearch
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-content-subtle"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email…"
              aria-label="Search users"
              className="field-control w-full pl-11 pr-10 py-2.5 min-h-[44px]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-content-subtle hover:text-content-muted rounded-lg"
              >
                <FiX className="w-4 h-4" />
              </button>
            )}
          </div>

          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden relative">
        {refetching && (
          <div className="absolute top-3 right-3 z-10">
            <RefetchIndicator active />
          </div>
        )}
        {loading ? (
          <SkeletonTable rows={6} columns={5} />
        ) : usersQuery.error ? (
          <ErrorState message={usersQuery.error} onRetry={usersQuery.refetch} />
        ) : users.length === 0 ? (
          <EmptyState
            icon={FiShield}
            title="No users match"
            description="Try a different search or filter."
            action={
              <Button variant="secondary" onClick={() => { setSearch(''); setStatusFilter('all'); }}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <div className="lg:hidden divide-y divide-hairline">
              {users.map((target) => {
                const isSelf = target.id === currentUser?.id;
                return (
                  <div key={target.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-content">{target.name}</p>
                        <p className="text-xs text-content-subtle truncate">{target.email}</p>
                      </div>
                      <Badge tone={statusTone[target.status] || 'primary'}>{target.status}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!isSelf && target.status === 'active' ? (
                        <RoleSelect
                          value={target.role}
                          onChange={(event) => handleRoleChange(target, event.target.value)}
                          disabled={Boolean(acting)}
                          aria-label={`Role for ${target.name}`}
                        />
                      ) : (
                        <RoleBadge role={target.role} />
                      )}
                      {target.status === 'pending' && (
                        <>
                          <Button size="sm" icon={FiCheck} loading={acting === `approve-${target.id}`} onClick={() => handleApprove(target)}>
                            Approve
                          </Button>
                          <Button size="sm" variant="dangerGhost" icon={FiX} loading={acting === `reject-${target.id}`} onClick={() => handleReject(target)}>
                            Decline
                          </Button>
                        </>
                      )}
                      {target.status === 'active' && !isSelf && (
                        <Button size="sm" variant="dangerGhost" loading={acting === `suspend-${target.id}`} onClick={() => handleSuspend(target)}>
                          Suspend
                        </Button>
                      )}
                      {(target.status === 'suspended' || target.status === 'rejected') && (
                        <Button size="sm" variant="secondary" icon={FiRefreshCw} loading={acting === `reactivate-${target.id}`} onClick={() => handleReactivate(target)}>
                          Reactivate
                        </Button>
                      )}
                      {target.status === 'active' && (
                        <Button size="sm" variant="ghost" icon={FiKey} loading={acting === `reset-${target.id}`} onClick={() => handleResetPassword(target)}>
                          Reset password
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden lg:block scroll-x">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-hairline/[0.07] bg-surface-sunken">
                  {['User', 'Role', 'Status', 'Joined', 'Actions'].map((heading, i) => (
                    <th
                      key={heading}
                      scope="col"
                      className={`px-4 sm:px-6 py-3 text-xs font-semibold text-content-subtle uppercase tracking-wide ${
                        i === 4 ? 'text-right' : 'text-left'
                      }`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {users.map((target) => {
                  const isSelf = target.id === currentUser?.id;

                  return (
                    <tr key={target.id} className="hover:bg-hairline/[0.05] transition-colors">
                      <td className="px-4 sm:px-6 py-3.5">
                        <div className="font-medium text-content">{target.name}</div>
                        <div className="text-xs text-content-subtle truncate max-w-[16rem]">
                          {target.email}
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-3.5">
                        {isSelf || target.status !== 'active' ? (
                          <RoleBadge role={target.role} />
                        ) : (
                          <RoleSelect
                            value={target.role}
                            onChange={(event) => handleRoleChange(target, event.target.value)}
                            disabled={Boolean(acting)}
                            aria-label={`Role for ${target.name}`}
                          />
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-3.5">
                        <Badge tone={statusTone[target.status] || 'primary'}>{target.status}</Badge>
                      </td>
                      <td className="px-4 sm:px-6 py-3.5 text-content-muted whitespace-nowrap">
                        {target.createdAt ? new Date(target.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 sm:px-6 py-3.5">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {target.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                icon={FiCheck}
                                loading={acting === `approve-${target.id}`}
                                onClick={() => handleApprove(target)}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="dangerGhost"
                                icon={FiX}
                                loading={acting === `reject-${target.id}`}
                                onClick={() => handleReject(target)}
                              >
                                Decline
                              </Button>
                            </>
                          )}

                          {target.status === 'active' && !isSelf && (
                            <Button
                              size="sm"
                              variant="dangerGhost"
                              loading={acting === `suspend-${target.id}`}
                              onClick={() => handleSuspend(target)}
                            >
                              Suspend
                            </Button>
                          )}

                          {(target.status === 'suspended' || target.status === 'rejected') && (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={FiRefreshCw}
                              loading={acting === `reactivate-${target.id}`}
                              onClick={() => handleReactivate(target)}
                            >
                              Reactivate
                            </Button>
                          )}

                          {target.status === 'active' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={FiKey}
                              loading={acting === `reset-${target.id}`}
                              onClick={() => handleResetPassword(target)}
                            >
                              Reset password
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </Card>

      <Modal
        open={Boolean(tempPassword)}
        onClose={() => setTempPassword(null)}
        title="Temporary password"
        size="sm"
      >
        {tempPassword && (
          <div className="space-y-4">
            <p className="text-sm text-content-muted">
              Share this with <strong>{tempPassword.name}</strong> securely. It is shown only once and they must
              change it when signing in.
            </p>
            <div className="rounded-lg border border-hairline/[0.07] bg-surface-sunken px-4 py-3 font-mono text-lg text-center tracking-wide">
              {tempPassword.password}
            </div>
            <Button fullWidth onClick={() => setTempPassword(null)}>
              Done
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
