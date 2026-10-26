import usePageState from '../hooks/usePageState';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from '../utils/toast';
import {
  FiAlertCircle,
  FiCheckCircle,
  FiDollarSign,
  FiEdit2,
  FiPackage,
  FiPlus,
  FiPrinter,
  FiTrash2,
  FiX,
} from 'react-icons/fi';

import api, { getErrorMessage } from '../services/api';
import useApi from '../hooks/useApi';
import useDebounce from '../hooks/useDebounce';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useConfirm } from '../components/ui/ConfirmProvider';
import { formatCompactMoney, formatMoney, formatQuantity } from '../utils/currency';
import PageHeader from '../components/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import StatCard, { StatGrid } from '../components/ui/StatCard';
import { Input, Select } from '../components/ui/Field';
import { EmptyState, ErrorState, InlineError } from '../components/ui/States';
import { SkeletonStatCards, SkeletonTable } from '../components/ui/Skeleton';
import RefetchIndicator from '../components/ui/RefetchIndicator';
import ProductFormModal from '../components/products/ProductFormModal';
import ArchivedProducts from '../components/products/ArchivedProducts';
import { translate, useAppLanguage } from '../context/LanguageContext';

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'stock', label: 'Most stock' },
];

const isLowStock = (product) => product.currentStock <= product.minStockLevel;

export default function Products() {
  useAppLanguage();
  const { currencySymbol } = useSettings();
  const { can } = useAuth();
  const confirm = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();

  const [search, setSearch] = usePageState('products.search', '');
  const [category, setCategory] = usePageState('products.category', '');
  const [lowStockOnly, setLowStockOnly] = usePageState('products.lowStockOnly', false);
  const [sort, setSort] = usePageState('products.sort', 'newest');
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedSearch, setArchivedSearch] = useState('');

  useEffect(() => {
    const state = location.state;
    if (!state) return;
    if (typeof state.search === 'string') setSearch(state.search);
    // Arriving from the home screen's low-stock alert: land on the filtered
    // view, not the full list the user would then have to filter themselves.
    if (state.lowStockOnly) setLowStockOnly(true);
    if (state.openCreate) {
      setEditing(null);
      setModalOpen(true);
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, setLowStockOnly, setSearch]);

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
    { keepPreviousData: true, cacheKey: 'products' }
  );

  // `keepPreviousData` so a post-save refetch does not blank the figures — and
  // so the stat cards can roll from the old number to the new one.
  const summary = useApi(
    (signal) => api.get('/products/summary', { signal }).then((r) => r.data),
    [],
    { keepPreviousData: true, cacheKey: 'products/summary' }
  );

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
        // Show the newly created product even when old filters hid its row.
        products.refetch({ keepPreviousData: true });
        summary.refetch();
        toast.success(`${data.name} added`);
        setSearch(''); setCategory(''); setLowStockOnly(false); setSort('newest');
      }

      setModalOpen(false);
      setEditing(null);
      window.dispatchEvent(new Event('rim:refresh'));
    },
    [editing, products, summary, setSearch, setCategory, setLowStockOnly, setSort]
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
        window.dispatchEvent(new Event('rim:refresh'));
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

  // Two independent requests, so two independent loading flags. Gating the list
  // on the summary meant every save replaced the whole table with a skeleton
  // while /products/summary was in flight — hiding the row that had just been
  // patched in place and throwing away the scroll position.
  const loadingList = products.loading && !products.data;
  const loadingStats = summary.loading && !summary.data;

  return (
    <div className="space-y-6">
      <PageHeader
        summary={translate("{0} products | {1} stock", [totals.total, formatCompactMoney(totals.value, currencySymbol)])}
        title={translate("Stock")}
        description={translate("Your rice, available quantity and prices.")}
        actions={
          <><Button hidden={!can('products.manage')} icon={FiPlus} onClick={openCreate}>{translate("Add product")}</Button><Button variant="secondary" icon={FiPrinter} onClick={() => navigate('/barcodes?tab=labels')}>{translate("Make labels")}</Button>{can('products.delete') && <Button variant="ghost" aria-expanded={showArchived} onClick={() => setShowArchived((value) => !value)}>{translate('Archived products')}</Button>}</>
        }
      />

      {showArchived && can('products.delete') && <ArchivedProducts search={archivedSearch} onSearch={setArchivedSearch} onRestored={(product) => {
        setShowArchived(false);
        setSearch(product.name); setCategory(''); setLowStockOnly(false);
        products.refetch({ keepPreviousData: true }); summary.refetch();
        toast.success(translate('Product restored. Stock and history are unchanged.'));
        window.dispatchEvent(new Event('rim:refresh'));
      }} />}

      {summary.error ? (
        /* Without this the four cards confidently render 0 products and
           Rs. 0.00 next to a table listing eighty, with no way to retry. */
        <InlineError message={translate(summary.error)} onRetry={summary.refetch} />
      ) : loadingStats ? (
        <SkeletonStatCards count={4} />
      ) : (
        <StatGrid className="products-overview">
          <StatCard title={translate("Products")} rawValue={totals.total} icon={FiPackage} />
          <StatCard
            title={translate("Stock value")}
            rawValue={totals.value}
            valueType="compactMoney"
            currencySymbol={currencySymbol}
            fullValue={formatMoney(totals.value, currencySymbol)}
            icon={FiDollarSign}
          />
          <StatCard title={translate("Well stocked")} rawValue={totals.healthy} icon={FiCheckCircle} />
          <StatCard
            title={translate("Low stock")}
            rawValue={totals.low}
            icon={FiAlertCircle}
            tone={totals.low > 0 ? 'danger' : 'neutral'}
          />
        </StatGrid>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative col-span-2">
            <Input label={translate("Search products")}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={translate("Search name, SKU or supplier…")}
              aria-label={translate("Search products")}

            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={translate("Clear search")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center min-h-[44px] min-w-[44px] text-content-subtle hover:text-content-muted rounded-lg"
              >
                <FiX className="w-4 h-4" />
              </button>
            )}
          </div>

          <Select value={category} onChange={(event) => setCategory(event.target.value)} aria-label={translate("Category")}>
            <option value="">{translate("All categories")}</option>
            {(meta.data?.categories || []).map((option) => (
              <option key={option} value={option}>
                {translate(option)}
              </option>
            ))}
          </Select>

          <Select value={sort} onChange={(event) => setSort(event.target.value)} aria-label={translate("Sort by")}>
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {translate(option.label)}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => setLowStockOnly((v) => !v)}
            aria-pressed={lowStockOnly}
            className={`inline-flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium border transition-colors ${
              lowStockOnly
                ? 'bg-red-500/10 border-red-500/20 text-red-500'
                : 'bg-surface-1 border-hairline/[0.12] text-content-muted hover:bg-hairline/[0.05]'
            }`}
          >
            <FiAlertCircle className="w-4 h-4" aria-hidden="true" />{translate("Low stock only")}</button>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-content-subtle hover:text-content underline underline-offset-2"
            >{translate("Clear filters")}</button>
          )}

          {products.loading && products.data && (
            <RefetchIndicator active className="ml-auto" />
          )}
        </div>
      </Card>

      {/* List */}
      <Card className="overflow-hidden">
        {loadingList ? (
          <SkeletonTable rows={6} columns={5} />
        ) : products.error ? (
          <ErrorState message={translate(products.error)} onRetry={products.refetch} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={FiPackage}
            title={translate(hasFilters ? 'No products match those filters' : 'No products yet')}
            description={
              translate(hasFilters
                ? 'Try a different search or clear the filters.'
                : 'Add your first product to start tracking stock, costs and margins.')
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>{translate("Clear filters")}</Button>
              ) : (
                <Button hidden={!can('products.manage')} icon={FiPlus} onClick={openCreate}>{translate("Add product")}</Button>
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
                        {isLowStock(product) && <Badge tone="danger">{translate("Low")}</Badge>}
                      </div>
                      <p className="text-xs text-content-subtle mt-0.5 break-words">
                        {product.sku} · {translate(product.category)}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button type="button" onClick={() => navigate(`/barcodes?tab=labels&product=${product.id || product._id}`)} aria-label={translate("Make labels for {0}", [product.name])} className="grid place-items-center min-h-[44px] min-w-[44px] rounded-lg text-content-muted hover:bg-surface-3"><FiPrinter className="w-4 h-4" aria-hidden="true" /></button>
                      {can('products.manage') && <button
                        type="button"
                        onClick={() => openEdit(product)}
                        aria-label={translate("Edit {0}", [product.name])}
                        className="grid place-items-center min-h-[44px] min-w-[44px] rounded-lg text-content-subtle hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-500/12 transition-colors"
                      >
                        <FiEdit2 className="w-4 h-4" />
                      </button>}
                      {can('products.delete') && <button
                        type="button"
                        onClick={() => handleDelete(product)}
                        aria-label={translate("Archive {0}", [product.name])}
                        className="grid place-items-center min-h-[44px] min-w-[44px] rounded-lg text-content-subtle hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>}
                    </div>
                  </div>

                  {/* Two up on phones, three from 400px. Three columns at 375px
                      leaves ~95px per track, and `Rs. 12,345.00` needs ~109px —
                      the price and value figures painted outside their cells. */}
                  <dl className="grid grid-cols-2 xs:grid-cols-3 gap-x-4 gap-y-3 mt-3 text-sm">
                    <div>
                      <dt className="text-xs text-content-subtle">{translate("Available stock")}</dt>
                      <dd
                        className={`font-semibold tabular-nums text-xl leading-tight break-words mt-1 ${
                          isLowStock(product) ? 'text-red-500' : 'text-content'
                        }`}
                      >
                        {translate(formatQuantity(product.currentStock, product.unit))}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-content-subtle">{translate("Sell price")}</dt>
                      <dd className="font-medium text-content tabular-nums text-[15px] leading-tight break-words">
                        {translate(formatMoney(product.sellingPrice, currencySymbol))}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-content-subtle">{translate("Value")}</dt>
                      <dd className="font-medium text-content tabular-nums text-[15px] leading-tight break-words">
                        {translate(formatCompactMoney(product.currentStock * product.costPrice, currencySymbol))}
                      </dd>
                    </div>
                  </dl>
                  {product.location && <p className="text-xs text-content-muted mt-3">{translate("Location: ")}{product.location}</p>}
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
                        className={`px-6 py-3 text-xs font-semibold text-content-subtle tracking-normal ${
                          i >= 2 && i <= 5 ? 'text-right' : i === 6 ? 'text-right' : 'text-left'
                        }`}
                      >
                        {translate(heading)}
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
                              {isLowStock(product) && <Badge tone="danger">{translate("Low")}</Badge>}
                            </div>
                            <span className="text-xs text-content-subtle">{product.sku}</span>
                            {product.location && <span className="block text-xs text-content-muted mt-1">{product.location}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge tone="primary">{translate(product.category)}</Badge>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div
                          className={`font-medium tabular-nums ${
                            isLowStock(product) ? 'text-red-500' : 'text-content'
                          }`}
                        >
                          {translate(formatQuantity(product.currentStock, product.unit))}
                        </div>
                        {isLowStock(product) && (
                          <div className="text-xs text-content-subtle tabular-nums">{translate("min ")}{translate(formatQuantity(product.minStockLevel, product.unit))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right text-content-muted tabular-nums">
                        {translate(formatMoney(product.costPrice, currencySymbol))}
                      </td>
                      <td className="px-6 py-3.5 text-right text-content font-medium tabular-nums">
                        {translate(formatMoney(product.sellingPrice, currencySymbol))}
                      </td>
                      <td className="px-6 py-3.5 text-right font-semibold text-content tabular-nums">
                        {translate(formatMoney(product.currentStock * product.costPrice, currencySymbol))}
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => navigate(`/barcodes?tab=labels&product=${product.id || product._id}`)} aria-label={translate("Make labels for {0}", [product.name])} className="grid place-items-center min-h-[36px] min-w-[36px] rounded-lg text-content-muted hover:bg-surface-3"><FiPrinter className="w-4 h-4" aria-hidden="true" /></button>
                          {can('products.manage') && <button
                            type="button"
                        onClick={() => openEdit(product)}
                            aria-label={translate("Edit {0}", [product.name])}
                            className="p-2 rounded-lg text-content-subtle hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-500/12 transition-colors"
                          >
                            <FiEdit2 className="w-4 h-4" />
                          </button>}
                          {can('products.delete') && <button
                            type="button"
                        onClick={() => handleDelete(product)}
                            aria-label={translate("Archive {0}", [product.name])}
                            className="p-2 rounded-lg text-content-subtle hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>}
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
        onViewArchived={can('products.delete') ? (sku) => { setModalOpen(false); setEditing(null); setArchivedSearch(sku); setShowArchived(true); window.scrollTo({ top: 0, behavior: 'auto' }); } : undefined}
        product={editing}
        meta={meta.data}
        metaLoading={meta.loading && !meta.data}
      />
    </div>
  );
}
