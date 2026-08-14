import React, { useCallback, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  FiActivity,
  FiChevronDown,
  FiChevronUp,
  FiClock,
  FiFilter,
  FiSearch,
  FiX,
} from 'react-icons/fi';

import api from '../services/api';
import useApi from '../hooks/useApi';
import useDebounce from '../hooks/useDebounce';
import { daysAgoInput, todayInput } from '../utils/date';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';
import { Select } from '../components/ui/Field';
import { EmptyState, ErrorState } from '../components/ui/States';
import { SkeletonTable } from '../components/ui/Skeleton';
import RefetchIndicator from '../components/ui/RefetchIndicator';
import UserAvatar from '../components/UserAvatar';
import { userAvatarPalette } from '../utils/color';

const LIMIT = 25;

const RESOURCE_TONES = {
  PRODUCT: 'primary',
  TRANSACTION: 'purple',
  CASH_ENTRY: 'success',
  USER: 'warning',
  SETTINGS: 'neutral',
  BUSINESS: 'neutral',
  AUTH: 'neutral',
};

const ROLE_TONES = {
  admin: 'primary',
  accountant: 'purple',
  worker: 'neutral',
};

// Local dates, not UTC: at 02:00 in Karachi `toISOString()` still reports
// yesterday, so the "Today" preset filtered to the wrong day and an admin
// investigating an overnight change saw "No events match those filters".
const isoDaysAgo = daysAgoInput;
const todayIso = todayInput;

function DetailBlock({ label, value }) {
  if (value == null || (typeof value === 'object' && !Object.keys(value).length)) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide mb-1">{label}</p>
      <pre className="text-xs text-content-muted bg-surface-sunken rounded-well p-3 overflow-x-auto whitespace-pre-wrap break-words">
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function ActivityRow({ entry, expanded, onToggle }) {
  const tone = RESOURCE_TONES[entry.resourceType] || 'neutral';
  const userKey = entry.userId || entry.userName;
  const palette = userAvatarPalette(userKey);
  const when = entry.createdAt ? new Date(entry.createdAt) : null;

  return (
    <li className="relative border-b border-hairline/[0.07] last:border-0">
      <span
        className={`absolute left-0 top-0 bottom-0 w-1 ${palette.stripe} opacity-80`}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 sm:px-6 py-4 pl-5 sm:pl-7 hover:bg-hairline/[0.04] transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-3">
          <UserAvatar name={entry.userName} colorKey={userKey} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-content">{entry.userName}</p>
              {entry.userRole && (
                <Badge tone={ROLE_TONES[entry.userRole] || 'neutral'} className="capitalize">
                  {entry.userRole}
                </Badge>
              )}
              <Badge tone={tone}>{entry.resourceType?.replace(/_/g, ' ') || 'Activity'}</Badge>
            </div>
            <p className="text-sm text-content-muted mt-1">{entry.summary || entry.action}</p>
            <p className="text-xs text-content-subtle mt-1.5 flex items-center gap-1.5">
              <FiClock className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              {when && !Number.isNaN(when.getTime())
                ? format(when, 'EEE, d MMM yyyy · h:mm a')
                : 'Unknown time'}
            </p>
          </div>
          <span className="text-content-subtle flex-shrink-0 mt-1" aria-hidden="true">
            {expanded ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 sm:px-6 pb-4 pl-[4.25rem] sm:pl-[5rem] space-y-3">
          {entry.action && (
            <p className="text-xs text-content-subtle">
              Action code: <span className="font-mono text-content-muted">{entry.action}</span>
            </p>
          )}
          <DetailBlock label="Details" value={entry.details} />
          <DetailBlock label="Before" value={entry.previousState} />
          <DetailBlock label="After" value={entry.newState} />
          {!entry.details && !entry.previousState && !entry.newState && (
            <p className="text-xs text-content-subtle">No extra detail was recorded for this event.</p>
          )}
        </div>
      )}
    </li>
  );
}

export default function AdminActivity() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const debouncedSearch = useDebounce(search, 350);

  const filters = useApi((signal) => api.get('/admin/audit/filters', { signal }).then((r) => r.data), []);

  const queryParams = useMemo(
    () => ({
      page,
      limit: LIMIT,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(userId ? { userId } : {}),
      ...(action ? { action } : {}),
      ...(resourceType ? { resourceType } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    }),
    [page, debouncedSearch, userId, action, resourceType, startDate, endDate]
  );

  const log = useApi(
    (signal) => api.get('/admin/audit', { params: queryParams, signal }).then((r) => r.data),
    [queryParams],
    { keepPreviousData: true }
  );

  const entries = log.data?.data || [];
  const pagination = log.data?.pagination;
  const loading = log.loading && !log.data;
  const refetching = log.loading && Boolean(log.data);

  const applyPreset = useCallback((preset) => {
    setPage(1);
    if (preset === 'today') {
      setStartDate(todayIso());
      setEndDate(todayIso());
    } else if (preset === '7d') {
      setStartDate(isoDaysAgo(7));
      setEndDate(todayIso());
    } else if (preset === '30d') {
      setStartDate(isoDaysAgo(30));
      setEndDate(todayIso());
    } else if (preset === '90d') {
      setStartDate(isoDaysAgo(90));
      setEndDate(todayIso());
    } else {
      setStartDate('');
      setEndDate('');
    }
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setUserId('');
    setAction('');
    setResourceType('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  }, []);

  const hasFilters = search || userId || action || resourceType || startDate || endDate;

  // `return null` rendered a blank white page. The route is already gated in
  // App.js, so this only fires while capabilities are still loading — send them
  // somewhere real rather than showing nothing.
  if (!can('audit.view')) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity log"
        description="Permanent record of every change — who did it, what changed, and exactly when."
        actions={
          hasFilters ? (
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null
        }
      />

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'today', label: 'Today' },
            { id: '7d', label: 'Last 7 days' },
            { id: '30d', label: 'Last 30 days' },
            { id: '90d', label: 'Last 90 days' },
            { id: 'all', label: 'All time' },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              className="px-3 py-2 min-h-[40px] rounded-well border border-hairline/[0.12] bg-surface-1 text-sm font-medium
                text-content-muted hover:bg-surface-3 hover:text-content hover:border-hairline/20
                active:scale-[0.96] transition-all duration-150"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="activity-from" className="block text-sm font-medium text-content-muted mb-1.5">
              From
            </label>
            <input
              id="activity-from"
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPage(1);
              }}
              className="field-control px-3 py-2.5 min-h-[44px]"
            />
          </div>
          <div>
            <label htmlFor="activity-to" className="block text-sm font-medium text-content-muted mb-1.5">
              To
            </label>
            <input
              id="activity-to"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => {
                setEndDate(event.target.value);
                setPage(1);
              }}
              className="field-control px-3 py-2.5 min-h-[44px]"
            />
          </div>
          <Select
            label="User"
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All users</option>
            {(filters.data?.users || []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>
          <Select
            label="Action"
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All actions</option>
            {(filters.data?.actions || []).map((item) => (
              <option key={item} value={item}>
                {item.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Resource"
            value={resourceType}
            onChange={(event) => {
              setResourceType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All resources</option>
            {(filters.data?.resourceTypes || []).map((item) => (
              <option key={item} value={item}>
                {item.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
          <div className="relative">
            <label htmlFor="activity-search" className="block text-sm font-medium text-content-muted mb-1.5">
              Search
            </label>
            <FiSearch
              className="pointer-events-none absolute left-3.5 top-[2.65rem] w-[18px] h-[18px] text-content-subtle"
              aria-hidden="true"
            />
            <input
              id="activity-search"
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Name, action or summary…"
              className="field-control pl-11 pr-10 py-2.5 min-h-[44px]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-[2.35rem] p-2 text-content-subtle hover:text-content rounded-well transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden relative">
        <div className="px-4 sm:px-6 py-4 border-b border-hairline/[0.07] flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-content flex items-center gap-2">
            <FiActivity aria-hidden="true" />
            {pagination?.total != null ? `${pagination.total} events` : 'Events'}
          </h2>
          {refetching && <RefetchIndicator active />}
        </div>

        {loading ? (
          <SkeletonTable rows={8} columns={3} />
        ) : log.error ? (
          <ErrorState message={log.error} onRetry={log.refetch} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={FiFilter}
            title={hasFilters ? 'No events match those filters' : 'No activity recorded yet'}
            description={
              hasFilters
                ? 'Try a wider date range or clear the filters.'
                : 'Changes to products, transactions, cash and settings will appear here permanently.'
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul>
              {entries.map((entry) => (
                <ActivityRow
                  key={entry.id || entry._id}
                  entry={entry}
                  expanded={expandedId === (entry.id || entry._id)}
                  onToggle={() =>
                    setExpandedId((current) =>
                      current === (entry.id || entry._id) ? null : entry.id || entry._id
                    )
                  }
                />
              ))}
            </ul>
            <Pagination
              page={pagination?.page || page}
              pages={pagination?.pages || 1}
              total={pagination?.total || 0}
              limit={LIMIT}
              onChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}
