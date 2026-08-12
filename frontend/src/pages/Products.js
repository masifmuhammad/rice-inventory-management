import React, { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  FiAlertCircle,
  FiCheckCircle,
  FiDollarSign,
  FiEdit2,
  FiPackage,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiX,
} from 'react-icons/fi';

import api, { getErrorMessage } from '../services/api';
import useApi from '../hooks/useApi';
import useDebounce from '../hooks/useDebounce';
import { useSettings } from '../context/SettingsContext';
import { useConfirm } from '../components/ui/ConfirmProvider';
import { formatCompactMoney, formatMoney, formatQuantity } from '../utils/currency';
import PageHeader from '../components/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import StatCard, { StatGrid } from '../components/ui/StatCard';
import { Select } from '../components/ui/Field';
import { EmptyState, ErrorState } from '../components/ui/States';
import { SkeletonStatCards, SkeletonTable } from '../components/ui/Skeleton';
import RefetchIndicator from '../components/ui/RefetchIndicator';
import ProductFormModal from '../components/products/ProductFormModal';

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'stock', label: 'Most stock' },
];

const isLowStock = (product) => product.currentStock <= product.minStockLevel;

export default function Products() {
  const { currencySymbol } = useSettings();
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [sort, setSort] = useState('newest');
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  // One request when typing stops, instead of one per keystroke.
  const debouncedSearch = useDebounce(search, 350);

  const params = useMemo(
    () => ({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(category ? { category } : {}),
      ...(lowStockOnly ? { lowStock: 'true' } : {}),
      sort,
    }),
    [debouncedSearch, category, lowStockOnly, sort]
  );

  const products = useApi(
    (signal) => api.get('/products', { params, signal }).then((r) => r.data),
    [params],
    { keepPreviousData: true }
  );

  const summary = useApi((signal) => api.get('/products/summary', { signal }).then((r) => r.data), []);

  const meta = useApi((signal) => api.get('/products/meta', { signal }).then((r) => r.data), []);

  const list = useMemo(() => products.data || [], [products.data]);

  const totals = useMemo(() => {
    const data = summary.data;
    if (!data) return { total: 0, value: 0, low: 0, healthy: 0 };
    return {
      total: data.total,
      value: data.stockValue,
      low: data.lowStock,
      healthy: data.healthy,
    };
  }, [summary.data]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (product) => {
    setEditing(product);
    setModalOpen(true);
  };

  const handleSubmit = useCallback(
    async (values) => {
      const isEditing = Boolean(editing);

      try {
        if (isEditing) {
          const { data } = await api.put(`/products/${editing._id}`, values);
          // Patch the row in place rather than refetching the whole list — the
          // change is visible the instant the server confirms it.
          products.setData((current) =>
            (current || []).map((p) => (p._id === data._id ? data : p))
          );
          summary.refetch();
          toast.success(`${data.name} updated`);
        } else {
          const { data } = await api.post('/products', values);
          products.setData((current) => [data, ...(current || [])]);
          summary.refetch();
          toast.success(`${data.name} added`);
        }

        setModalOpen(false);
        setEditing(null);
      } catch (error) {
        toast.error(getErrorMessage(error, 'Could not save the product'));
        throw error;
      }
    },
    [editing, products, summary]
  );

  const handleDelete = useCallback(
    async (product) => {
      const confirmed = await confirm({
        title: `Archive ${product.name}?`,
        message:
          'It disappears from your product list, but its past transactions stay intact so your reports keep adding up.',
        confirmLabel: 'Archive',
        tone: 'danger',
      });
      if (!confirmed) return;

      // Optimistic: the row goes immediately, and comes back if the server says no.
      const snapshot = products.data || [];
      products.setData(snapshot.filter((p) => p._id !== product._id));

      try {
        await api.delete(`/products/${product._id}`);
        summary.refetch();
        toast.success(`${product.name} archived`);
      } catch (error) {
        products.setData(snapshot);
        toast.error(getErrorMessage(error, 'Could not archive the product'));
      }
    },
    [confirm, products, summary]
  );

  const hasFilters = Boolean(search || category || lowStockOnly);

  const clearFilters = () => {
    setSearch('');
    setCategory('');
    setLowStockOnly(false);
  };

  const loading = (products.loading && !products.data) || (summary.loading && !summary.data);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Everything you stock, what it cost and what it is worth."
        actions={
          <Button icon={FiPlus} onClick={openCreate}>
            Add product
          </Button>
        }
      />

      {loading ? (
        <SkeletonStatCards count={4} />
      ) : (
        <StatGrid>
          <StatCard title="Products" rawValue={totals.total} icon={FiPackage} />
          <StatCard
            title="Stock value"
            rawValue={totals.value}
            valueType="compactMoney"
            currencySymbol={currencySymbol}
            fullValue={formatMoney(totals.value, currencySymbol)}
            icon={FiDollarSign}
          />
          <StatCard title="Well stocked" rawValue={totals.healthy} icon={FiCheckCircle} />
          <StatCard
            title="Low stock"
            rawValue={totals.low}
            icon={FiAlertCircle}
            tone={totals.low > 0 ? 'danger' : 'neutral'}
          />
        </StatGrid>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative lg:col-span-2">
            <FiSearch
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-content-subtle"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, SKU or supplier…"
              aria-label="Search products"
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

          <Select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {(meta.data?.categories || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>

          <Select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort by">
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => setLowStockOnly((v) => !v)}
            aria-pressed={lowStockOnly}
            className={`inline-flex items-center gap-2 px-3 py-2 min-h-[40px] rounded-lg text-sm font-medium border transition-colors ${
              lowStockOnly
                ? 'bg-red-500/10 border-red-500/20 text-red-500'
                : 'bg-surface-1 border-hairline/[0.12] text-content-muted hover:bg-hairline/[0.05]'
            }`}
          >
            <FiAlertCircle className="w-4 h-4" aria-hidden="true" />
            Low stock only
          </button>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-content-subtle hover:text-content underline underline-offset-2"
            >
              Clear filters
            </button>
          )}

          {products.loading && products.data && (
            <RefetchIndicator active className="ml-auto" />
          )}
        </div>
      </Card>

      {/* List */}
      <Card className="overflow-hidden">
        {loading ? (
          <SkeletonTable rows={6} columns={5} />
        ) : products.error ? (
          <ErrorState message={products.error} onRetry={products.refetch} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={FiPackage}
            title={hasFilters ? 'No products match those filters' : 'No products yet'}
            description={
              hasFilters
                ? 'Try a different search or clear the filters.'
                : 'Add your first product to start tracking stock, costs and margins.'
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button icon={FiPlus} onClick={openCreate}>
                  Add product
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* Phones: a table would force horizontal scrolling, so each product
                becomes a card with the same information stacked. */}
            <ul className="lg:hidden divide-y divide-hairline">
              {list.map((product) => (
                <li key={product._id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-content truncate">{product.name}</h3>
                        {isLowStock(product) && <Badge tone="danger">Low</Badge>}
                      </div>
                      <p className="text-xs text-content-subtle mt-0.5">
                        {product.sku} · {product.category}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => openEdit(product)}
                        aria-label={`Edit ${product.name}`}
                        className="p-2.5 rounded-lg text-content-subtle hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-500/12 transition-colors"
                      >
                        <FiEdit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(product)}
                        aria-label={`Archive ${product.name}`}
                        className="p-2.5 rounded-lg text-content-subtle hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <dl className="grid grid-cols-3 gap-3 mt-3 text-sm">
                    <div>
                      <dt className="text-xs text-content-subtle">Stock</dt>
                      <dd
                        className={`font-medium tabular-nums ${
                          isLowStock(product) ? 'text-red-500' : 'text-content'
                        }`}
                      >
                        {formatQuantity(product.currentStock, product.unit)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-content-subtle">Sell price</dt>
                      <dd className="font-medium text-content tabular-nums">
                        {formatMoney(product.sellingPrice, currencySymbol)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-content-subtle">Value</dt>
                      <dd className="font-medium text-content tabular-nums">
                        {formatCompactMoney(product.currentStock * product.costPrice, currencySymbol)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>

            <div className="hidden lg:block scroll-x">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline/[0.07] bg-surface-sunken">
                    {['Product', 'Category', 'Stock', 'Cost', 'Selling', 'Value', ''].map((heading, i) => (
                      <th
                        key={heading || i}
                        scope="col"
                        className={`px-6 py-3 text-xs font-semibold text-content-subtle uppercase tracking-wide ${
                          i >= 2 && i <= 5 ? 'text-right' : i === 6 ? 'text-right' : 'text-left'
                        }`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {list.map((product) => (
                    <tr key={product._id} className="hover:bg-hairline/[0.05] transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary-500/12 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                            <FiPackage className="w-4 h-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-content truncate">{product.name}</span>
                              {isLowStock(product) && <Badge tone="danger">Low</Badge>}
                            </div>
                            <span className="text-xs text-content-subtle">{product.sku}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge tone="primary">{product.category}</Badge>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div
                          className={`font-medium tabular-nums ${
                            isLowStock(product) ? 'text-red-500' : 'text-content'
                          }`}
                        >
                          {formatQuantity(product.currentStock, product.unit)}
                        </div>
                        {isLowStock(product) && (
                          <div className="text-xs text-content-subtle tabular-nums">
                            min {formatQuantity(product.minStockLevel, product.unit)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right text-content-muted tabular-nums">
                        {formatMoney(product.costPrice, currencySymbol)}
                      </td>
                      <td className="px-6 py-3.5 text-right text-content font-medium tabular-nums">
                        {formatMoney(product.sellingPrice, currencySymbol)}
                      </td>
                      <td className="px-6 py-3.5 text-right font-semibold text-content tabular-nums">
                        {formatMoney(product.currentStock * product.costPrice, currencySymbol)}
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(product)}
                            aria-label={`Edit ${product.name}`}
                            className="p-2 rounded-lg text-content-subtle hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-500/12 transition-colors"
                          >
                            <FiEdit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(product)}
                            aria-label={`Archive ${product.name}`}
                            className="p-2 rounded-lg text-content-subtle hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <ProductFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
        product={editing}
        meta={meta.data}
        metaLoading={meta.loading && !meta.data}
      />
    </div>
  );
}
