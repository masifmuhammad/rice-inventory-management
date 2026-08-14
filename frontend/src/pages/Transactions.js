import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from '../utils/toast';
import { formatSafe } from '../utils/date';
import {
  FiArrowRight,
  FiDownload,
  FiEdit,
  FiEdit2,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiTrendingDown,
  FiTrendingUp,
  FiX,
} from 'react-icons/fi';

import api, { getErrorMessage } from '../services/api';
import useApi from '../hooks/useApi';
import useDebounce from '../hooks/useDebounce';
import { useSettings } from '../context/SettingsContext';
import { useConfirm } from '../components/ui/ConfirmProvider';
import { formatMoney, formatQuantity } from '../utils/currency';
import PageHeader from '../components/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge, { transactionTone } from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';
import { Select } from '../components/ui/Field';
import { EmptyState, ErrorState } from '../components/ui/States';
import { SkeletonTable } from '../components/ui/Skeleton';
import RefetchIndicator from '../components/ui/RefetchIndicator';
import Modal from '../components/ui/Modal';
import SwipeAction from '../components/ui/SwipeAction';
import TransactionFormModal from '../components/transactions/TransactionFormModal';

const TYPE_FILTERS = [
  { value: '', label: 'All types' },
  { value: 'stock_in', label: 'Stock in' },
  { value: 'stock_out', label: 'Stock out' },
  { value: 'adjustment', label: 'Adjustments' },
];

const typeIcon = {
  stock_in: FiTrendingUp,
  stock_out: FiTrendingDown,
  adjustment: FiEdit,
  transfer: FiArrowRight,
};

const LIMIT = 20;

/** Just the given name — the row is tight and the surname adds nothing here. */
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Unknown';

export default function Transactions() {
  const { currencySymbol, settings } = useSettings();
  const confirm = useConfirm();

  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [scanPrefill, setScanPrefill] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const scan = location.state?.aiScan;
    if (scan?.proposedTransaction) {
      const tx = scan.proposedTransaction;
      setScanPrefill({
        type: 'stock_in',
        product: tx.product,
        quantity: tx.quantity,
        price: scan.product?.costPrice,
        supplier: tx.supplier || '',
        reference: tx.reference || '',
        notes: tx.notes || 'From AI delivery note scan',
      });
      setModalOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }

    if (location.state?.openCreate) {
      setScanPrefill(null);
      setModalOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const [downloadingId, setDownloadingId] = useState(null);
  const [detail, setDetail] = useState(null);
  // The transaction currently being corrected, or null when creating a new one.
  const [editing, setEditing] = useState(null);

  const debouncedSearch = useDebounce(search, 350);

  const params = useMemo(
    () => ({
      page,
      limit: LIMIT,
      ...(type ? { type } : {}),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
    }),
    [page, type, debouncedSearch]
  );

  const transactions = useApi(
    (signal) => api.get('/transactions', { params, signal }).then((r) => r.data),
    [params],
    { keepPreviousData: true }
  );

  // Needed for the form's product picker; kept separate so the list can refresh
  // without refetching every product.
  const products = useApi(
    (signal) => api.get('/products', { params: { sort: 'name' }, signal }).then((r) => r.data),
    []
  );

  const list = transactions.data?.data || [];
  const pagination = transactions.data?.pagination;

  const changeFilter = (setter) => (value) => {
    setter(value);
    setPage(1); // a new filter always starts at the first page
  };

  const handleCreate = useCallback(
    async (values) => {
      try {
        await api.post('/transactions', values);
        toast.success('Transaction recorded');
        setModalOpen(false);
        // The scan prefill has been consumed. Leaving it set meant the next
        // "New transaction" reopened the form already filled with the previous
        // delivery note — one inattentive Save away from a duplicate stock-in.
        setScanPrefill(null);
        setPage(1);
        // Stock levels moved, so both lists are now stale.
        transactions.refetch();
        products.refetch();
      } catch (error) {
        toast.error(getErrorMessage(error, 'Could not record the transaction'));
        throw error;
      }
    },
    [transactions, products]
  );

  /**
   * Corrects a transaction in place.
   *
   * The server moves the stock difference, rewrites the row and re-posts the
   * cash line in one database transaction, so a correction can never leave the
   * stock and the books disagreeing — which is the whole reason this is a PUT
   * rather than a delete followed by a create.
   */
  const handleEdit = useCallback(
    async (values) => {
      try {
        await api.put(`/transactions/${editing._id}`, values);
        toast.success('Transaction corrected');
        setModalOpen(false);
        setEditing(null);
        transactions.refetch();
        products.refetch();
      } catch (error) {
        toast.error(getErrorMessage(error, 'Could not correct the transaction'));
        throw error;
      }
    },
    [editing, transactions, products]
  );

  const handleReverse = useCallback(
    async (transaction) => {
      const confirmed = await confirm({
        title: 'Reverse this transaction?',
        message:
          'The stock it moved goes back, and if it was a sale its cash-book line is removed too.',
        confirmLabel: 'Reverse',
        tone: 'danger',
      });
      if (!confirmed) return;

      try {
        const id = transaction._id || transaction.id;
        await api.delete(`/transactions/${id}`);
        toast.success('Transaction reversed');
        // Reversing the only row on the last page leaves that page empty, and
        // the empty state renders instead of the pager — so there is no control
        // left to get back. Step back a page when we just emptied this one.
        setPage((current) => (list.length === 1 && current > 1 ? current - 1 : current));
        transactions.refetch();
        products.refetch();
      } catch (error) {
        toast.error(getErrorMessage(error, 'Could not reverse the transaction'));
      }
    },
    [confirm, transactions, products, list.length]
  );

  const handleReceipt = useCallback(
    async (transaction) => {
      if (!transaction.product) {
        toast.error('This transaction has no product attached.');
        return;
      }

      setDownloadingId(transaction._id);
      try {
        // Kept out of the main bundle; only loaded the first time someone
        // actually asks for a receipt.
        const { generateTransactionPDF } = await import('../utils/pdfGenerator');
        const outcome = await generateTransactionPDF(transaction, transaction.product, settings);

        // iOS routes the file through the share sheet, so "downloaded" would be
        // wrong there — and dismissing that sheet is a choice, not a failure.
        if (outcome === 'cancelled') {
          toast.dismiss();
        } else if (outcome === 'shared') {
          toast.success('Receipt ready — choose "Save to Files" to keep it', { feedback: 'download' });
        } else if (outcome === 'insecure') {
          toast.error('Open the app over https to save files on iPhone');
        } else if (outcome === 'opened') {
          toast.success('Receipt opened — use your browser’s share menu to save it');
        } else {
          toast.success('Receipt downloaded', { feedback: 'download' });
        }
      } catch (error) {
        toast.error(getErrorMessage(error, 'Could not build the receipt. Please try again.'));
      } finally {
        setDownloadingId(null);
      }
    },
    [settings]
  );

  const loading = transactions.loading && !transactions.data;
  const refetching = transactions.loading && Boolean(transactions.data);
  const hasFilters = Boolean(type || search);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Every movement in and out of the warehouse."
        actions={
          <Button icon={FiPlus} onClick={() => setModalOpen(true)}>
            New transaction
          </Button>
        }
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <FiSearch
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-content-subtle"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => changeFilter(setSearch)(event.target.value)}
              placeholder="Search reference, supplier, customer or notes…"
              aria-label="Search transactions"
              className="field-control w-full pl-11 pr-10 py-2.5 min-h-[44px]"
            />
            {search && (
              <button
                type="button"
                onClick={() => changeFilter(setSearch)('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center min-h-[44px] min-w-[44px] text-content-subtle hover:text-content-muted rounded-lg"
              >
                <FiX className="w-4 h-4" />
              </button>
            )}
          </div>

          <Select
            value={type}
            onChange={(event) => changeFilter(setType)(event.target.value)}
            aria-label="Filter by type"
          >
            {TYPE_FILTERS.map((option) => (
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
          <SkeletonTable rows={6} columns={4} />
        ) : transactions.error ? (
          <ErrorState message={transactions.error} onRetry={transactions.refetch} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={FiTrendingUp}
            title={hasFilters ? 'Nothing matches those filters' : 'No transactions yet'}
            description={
              hasFilters
                ? 'Try a different search or clear the type filter.'
                : 'Record a delivery or a sale and it will show up here.'
            }
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setType('');
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button icon={FiPlus} onClick={() => setModalOpen(true)}>
                  New transaction
                </Button>
              )
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-hairline">
              {list.map((transaction) => {
                const tone = transactionTone[transaction.type] || transactionTone.adjustment;
                const Icon = typeIcon[transaction.type] || FiEdit;

                return (
                  <li key={transaction._id}>
                  <SwipeAction label="Reverse" onAction={() => handleReverse(transaction)}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      // The row's own buttons sit inside it; a tap on one of
                      // those is not a request to open the detail sheet.
                      if (event.target.closest('button, a')) return;
                      setDetail(transaction);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setDetail(transaction);
                      }
                    }}
                    className="p-4 sm:px-6 hover:bg-hairline/[0.05] transition-colors cursor-pointer
                      focus-visible:outline-none focus-visible:bg-hairline/[0.06]"
                  >
                    <div className="flex items-start gap-3 sm:gap-4">
                      <span
                        className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                          transaction.type === 'stock_in'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : transaction.type === 'stock_out'
                            ? 'bg-red-500/10 text-red-500'
                            : 'bg-primary-500/12 text-primary-600 dark:text-primary-400'
                        }`}
                      >
                        <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-content truncate">
                            {transaction.product?.name || 'Deleted product'}
                          </h3>
                          <Badge tone={tone.tone}>{tone.label}</Badge>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-content-muted">
                          <span className="tabular-nums">
                            <span className="text-content-subtle">Qty</span>{' '}
                            <span className="font-medium text-content">
                              {formatQuantity(transaction.quantity, transaction.unit)}
                            </span>
                          </span>

                          {transaction.totalValue > 0 && (
                            <span className="tabular-nums">
                              <span className="text-content-subtle">Total</span>{' '}
                              <span className="font-medium text-content">
                                {formatMoney(transaction.totalValue, currencySymbol)}
                              </span>
                            </span>
                          )}

                          <span className="tabular-nums text-content-subtle">
                            {formatQuantity(transaction.stockBefore, transaction.unit)} →{' '}
                            {formatQuantity(transaction.stockAfter, transaction.unit)}
                          </span>
                        </div>

                        {(transaction.reference || transaction.supplier || transaction.customer) && (
                          <p className="mt-1.5 text-xs text-content-subtle truncate">
                            {[
                              transaction.reference && `Ref ${transaction.reference}`,
                              transaction.supplier && `From ${transaction.supplier}`,
                              transaction.customer && `To ${transaction.customer}`,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        )}

                        {transaction.notes && (
                          <p className="mt-1.5 text-xs text-content-subtle line-clamp-2">{transaction.notes}</p>
                        )}

                        <p className="mt-2 text-xs text-content-subtle">
                          {formatSafe(transaction.createdAt, 'd MMM yyyy, h:mm a')} ·{' '}
                          {firstName(transaction.createdBy?.name)}
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center gap-1 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={FiDownload}
                          loading={downloadingId === transaction._id}
                          onClick={() => handleReceipt(transaction)}
                          className="whitespace-nowrap"
                        >
                          <span className="hidden sm:inline">Receipt</span>
                        </Button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(transaction);
                            setModalOpen(true);
                          }}
                          aria-label="Correct transaction"
                          className="grid place-items-center min-h-[44px] min-w-[44px] rounded-lg text-content-subtle hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-500/12 transition-colors"
                        >
                          <FiEdit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReverse(transaction)}
                          aria-label="Reverse transaction"
                          className="grid place-items-center min-h-[44px] min-w-[44px] rounded-lg text-content-subtle hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  </SwipeAction>
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

      {/* Detail sheet. Modal already carries the spring enter/exit, the drag
          dismiss and the keyboard handling, so this is just its contents. */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.product?.name || 'Transaction'}
        description={detail ? (transactionTone[detail.type] || transactionTone.adjustment).label : ''}
        size="sm"
        footer={
          detail && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                icon={FiDownload}
                fullWidth
                loading={downloadingId === detail._id}
                onClick={() => handleReceipt(detail)}
              >
                Receipt
              </Button>
              <Button
                variant="secondary"
                icon={FiEdit2}
                onClick={() => {
                  setEditing(detail);
                  setDetail(null);
                  setModalOpen(true);
                }}
                aria-label="Correct transaction"
              />
              <Button
                variant="dangerGhost"
                icon={FiTrash2}
                onClick={async () => {
                  const target = detail;
                  setDetail(null);
                  await handleReverse(target);
                }}
                aria-label="Reverse transaction"
              />
            </div>
          )
        }
      >
        {detail && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-sm">
            {[
              ['Quantity', formatQuantity(detail.quantity, detail.unit)],
              ['Unit price', detail.price ? formatMoney(detail.price, currencySymbol) : '—'],
              ['Total', detail.totalValue ? formatMoney(detail.totalValue, currencySymbol) : '—'],
              ['Stock after', formatQuantity(detail.stockAfter, detail.unit)],
              ['Stock before', formatQuantity(detail.stockBefore, detail.unit)],
              ['SKU', detail.product?.sku || '—'],
              ['Reference', detail.reference || '—'],
              [detail.type === 'stock_out' ? 'Customer' : 'Supplier', detail.customer || detail.supplier || '—'],
              ['Recorded by', firstName(detail.createdBy?.name)],
              ['When', formatSafe(detail.createdAt, 'd MMM yyyy, h:mm a')],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-content-subtle">{label}</dt>
                <dd className="font-medium text-content tabular-nums break-words">{value}</dd>
              </div>
            ))}
            {detail.notes && (
              <div className="col-span-2 min-w-0">
                <dt className="text-xs text-content-subtle">Notes</dt>
                <dd className="text-content-muted break-words">{detail.notes}</dd>
              </div>
            )}
          </dl>
        )}
      </Modal>

      <TransactionFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setScanPrefill(null);
          setEditing(null);
        }}
        onSubmit={editing ? handleEdit : handleCreate}
        editing={Boolean(editing)}
        products={products.data || []}
        productsLoading={products.loading && !products.data}
        initialValues={
          editing
            ? {
                type: editing.type,
                product: editing.product?._id || editing.product,
                quantity: editing.quantity,
                price: editing.price,
                reference: editing.reference,
                supplier: editing.supplier,
                customer: editing.customer,
                notes: editing.notes,
              }
            : scanPrefill
        }
      />
    </div>
  );
}
