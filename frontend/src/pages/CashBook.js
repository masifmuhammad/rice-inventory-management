import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from '../utils/toast';
import { format } from 'date-fns';
import {
  FiArrowDownLeft,
  FiArrowUpRight,
  FiBookOpen,
  FiEdit2,
  FiSearch,
  FiTrash2,
  FiTrendingUp,
  FiDollarSign,
  FiX,
  FiZap,
} from 'react-icons/fi';

import api, { getErrorMessage } from '../services/api';
import useApi from '../hooks/useApi';
import useDebounce from '../hooks/useDebounce';
import { useSettings } from '../context/SettingsContext';
import { useConfirm } from '../components/ui/ConfirmProvider';
import { formatCompactMoney, formatMoney } from '../utils/currency';
import PageHeader from '../components/PageHeader';
import Button from '../components/ui/Button';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import StatCard, { StatGrid } from '../components/ui/StatCard';
import PillFilter from '../components/ui/PillFilter';
import Pagination from '../components/ui/Pagination';
import { EmptyState, ErrorState } from '../components/ui/States';
import { SkeletonStatCards, SkeletonTable } from '../components/ui/Skeleton';
import RefetchIndicator from '../components/ui/RefetchIndicator';
import CashEntryModal from '../components/cash/CashEntryModal';

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'in', label: 'Money in' },
  { value: 'out', label: 'Money out' },
];

const LIMIT = 25;

export default function CashBook() {
  const { currencySymbol } = useSettings();
  const confirm = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();

  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [defaultDirection, setDefaultDirection] = useState('in');

  useEffect(() => {
    const direction = location.state?.openCreate;
    if (direction !== 'in' && direction !== 'out') return;
    setEditing(null);
    setDefaultDirection(direction);
    setModalOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const debouncedSearch = useDebounce(search, 350);

  const params = useMemo(
    () => ({
      page,
      limit: LIMIT,
      ...(tab !== 'all' ? { direction: tab } : {}),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
    }),
    [page, tab, debouncedSearch]
  );

  const ledger = useApi(
    (signal) => api.get('/cash-book', { params, signal }).then((r) => r.data),
    [params],
    { keepPreviousData: true }
  );

  const summary = useApi(
    (signal) => api.get('/cash-book/summary', { signal }).then((r) => r.data),
    [],
    { keepPreviousData: true }
  );

  const meta = useApi((signal) => api.get('/cash-book/meta', { signal }).then((r) => r.data), []);

  const entries = ledger.data?.data || [];
  const pagination = ledger.data?.pagination;

  const refreshAll = useCallback(() => {
    ledger.refetch();
    summary.refetch();
  }, [ledger, summary]);

  const openCreate = (direction) => {
    setEditing(null);
    setDefaultDirection(direction);
    setModalOpen(true);
  };

  const handleSubmit = useCallback(
    async (values) => {
      try {
        if (editing) {
          await api.put(`/cash-book/${editing._id}`, values);
          toast.success('Entry updated');
        } else {
          await api.post('/cash-book', values);
          toast.success(values.direction === 'in' ? 'Money in recorded' : 'Money out recorded');
        }

        setModalOpen(false);
        setEditing(null);
        setPage(1);
        refreshAll();
      } catch (error) {
        toast.error(getErrorMessage(error, 'Could not save the entry'));
        throw error;
      }
    },
    [editing, refreshAll]
  );

  const handleDelete = useCallback(
    async (entry) => {
      const confirmed = await confirm({
        title: 'Delete this entry?',
        message: `${formatMoney(entry.amount, currencySymbol)} — ${entry.purpose}. This cannot be undone.`,
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (!confirmed) return;

      try {
        await api.delete(`/cash-book/${entry._id}`);
        toast.success('Entry deleted');
        refreshAll();
      } catch (error) {
        toast.error(getErrorMessage(error, 'Could not delete the entry'));
      }
    },
    [confirm, currencySymbol, refreshAll]
  );

  const loading = ledger.loading && !ledger.data;
  const summaryLoading = summary.loading && !summary.data;
  const refetching = ledger.loading && Boolean(ledger.data);
  const balance = summary.data?.balance ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Book"
        description="Money in and money out, with a running balance. Sales post themselves."
        actions={
          <>
            <Button variant="secondary" icon={FiArrowUpRight} onClick={() => openCreate('out')}>
              Money out
            </Button>
            <Button variant="success" icon={FiArrowDownLeft} onClick={() => openCreate('in')}>
              Money in
            </Button>
          </>
        }
      />

      {summaryLoading ? (
        <SkeletonStatCards count={4} />
      ) : (
        <StatGrid>
          <StatCard
            title="Cash balance"
            rawValue={balance}
            valueType="compactMoney"
            currencySymbol={currencySymbol}
            fullValue={formatMoney(balance, currencySymbol)}
            hint={balance >= 0 ? 'In hand' : 'More out than in'}
            icon={FiDollarSign}
            tone={balance < 0 ? 'danger' : 'neutral'}
          />
          <StatCard
            title="Total in"
            rawValue={summary.data?.totalIn}
            valueType="compactMoney"
            currencySymbol={currencySymbol}
            fullValue={formatMoney(summary.data?.totalIn, currencySymbol)}
            hint={`${summary.data?.countIn || 0} entries`}
            icon={FiArrowDownLeft}
          />
          <StatCard
            title="Total out"
            rawValue={summary.data?.totalOut}
            valueType="compactMoney"
            currencySymbol={currencySymbol}
            fullValue={formatMoney(summary.data?.totalOut, currencySymbol)}
            hint={`${summary.data?.countOut || 0} entries`}
            icon={FiArrowUpRight}
          />
          <StatCard
            title="This month"
            rawValue={summary.data?.thisMonth?.net}
            valueType="compactMoney"
            currencySymbol={currencySymbol}
            fullValue={formatMoney(summary.data?.thisMonth?.net, currencySymbol)}
            hint={`${formatCompactMoney(summary.data?.thisMonth?.in, currencySymbol)} in · ${formatCompactMoney(
              summary.data?.thisMonth?.out,
              currencySymbol
            )} out`}
            icon={FiTrendingUp}
          />
        </StatGrid>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <PillFilter
            options={TABS}
            value={tab}
            onChange={(next) => {
              setTab(next);
              setPage(1);
            }}
            ariaLabel="Cash direction"
            className="self-start"
          />

          <div className="relative flex-1">
            <FiSearch
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-content-subtle"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search purpose, person or reference…"
              aria-label="Search cash entries"
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
        </div>
      </Card>

      {/* Ledger */}
      <Card className="overflow-hidden relative">
        {refetching && (
          <div className="absolute top-3 right-3 z-10">
            <RefetchIndicator active />
          </div>
        )}
        {loading ? (
          <SkeletonTable rows={8} columns={4} />
        ) : ledger.error ? (
          <ErrorState message={ledger.error} onRetry={ledger.refetch} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={FiBookOpen}
            title={search || tab !== 'all' ? 'Nothing matches' : 'The cash book is empty'}
            description={
              search || tab !== 'all'
                ? 'Try a different search, or switch back to All.'
                : 'Record money coming in or going out, and every sale you make will be added here automatically.'
            }
            action={
              <Button icon={FiArrowDownLeft} variant="success" onClick={() => openCreate('in')}>
                Record money in
              </Button>
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-hairline">
              {entries.map((entry) => {
                const isIn = entry.direction === 'in';
                const auto = entry.source === 'sale';

                return (
                  <li key={entry._id} className="p-4 sm:px-6 hover:bg-hairline/[0.05] transition-colors">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <span
                        className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                          isIn ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                        }`}
                      >
                        {isIn ? (
                          <FiArrowDownLeft className="w-[18px] h-[18px]" aria-hidden="true" />
                        ) : (
                          <FiArrowUpRight className="w-[18px] h-[18px]" aria-hidden="true" />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-content truncate">{entry.purpose}</h3>
                          <Badge tone={isIn ? 'success' : 'danger'}>{entry.category}</Badge>
                          {auto && (
                            <Badge tone="neutral" icon={FiZap}>
                              Auto
                            </Badge>
                          )}
                        </div>

                        <p className="mt-1 text-xs text-content-subtle">
                          {[
                            entry.party && (isIn ? `From ${entry.party}` : `Taken by ${entry.party}`),
                            entry.reference && `Ref ${entry.reference}`,
                            format(new Date(entry.occurredAt || entry.createdAt), 'd MMM yyyy'),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>

                        {entry.notes && (
                          <p className="mt-1 text-xs text-content-subtle line-clamp-2">{entry.notes}</p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span
                          className={`text-sm font-semibold tabular-nums whitespace-nowrap ${
                            isIn ? 'text-emerald-500' : 'text-red-500'
                          }`}
                        >
                          {isIn ? '+' : '−'}
                          {formatMoney(entry.amount, currencySymbol)}
                        </span>
                        <span className="text-xs text-content-subtle tabular-nums whitespace-nowrap">
                          bal {formatMoney(entry.balanceAfter, currencySymbol)}
                        </span>

                        {/* Sale lines mirror a transaction; editing them here
                            would let the two records disagree. */}
                        {!auto && (
                          <div className="flex gap-0.5 mt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(entry);
                                setModalOpen(true);
                              }}
                              aria-label="Edit entry"
                              className="p-2 rounded-lg text-content-subtle hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-500/12 transition-colors"
                            >
                              <FiEdit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(entry)}
                              aria-label="Delete entry"
                              className="p-2 rounded-lg text-content-subtle hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <Pagination
              page={pagination?.page || 1}
              pages={pagination?.pages || 1}
              total={pagination?.total || 0}
              limit={LIMIT}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      {/* Where the money goes */}
      {summary.data?.byCategory?.length > 0 && (
        <Card>
          <CardHeader title="By category" subtitle="Across everything recorded" icon={FiBookOpen} />
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
              {summary.data.byCategory.slice(0, 10).map((row) => (
                <div
                  key={`${row.direction}-${row.category}`}
                  className="flex items-center justify-between gap-4 py-2 border-b border-hairline/[0.07] last:border-0"
                >
                  <span className="flex items-center gap-2 text-sm text-content-muted min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        row.direction === 'in' ? 'bg-emerald-500' : 'bg-red-500'
                      }`}
                    />
                    <span className="truncate">{row.category}</span>
                    <span className="text-xs text-content-subtle flex-shrink-0">({row.count})</span>
                  </span>
                  <span
                    className={`text-sm font-medium tabular-nums whitespace-nowrap ${
                      row.direction === 'in' ? 'text-emerald-500' : 'text-red-500'
                    }`}
                  >
                    {formatMoney(row.total, currencySymbol)}
                  </span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <CashEntryModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
        meta={meta.data}
        metaLoading={meta.loading && !meta.data}
        entry={editing}
        defaultDirection={defaultDirection}
      />
    </div>
  );
}
