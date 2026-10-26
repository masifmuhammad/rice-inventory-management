import React, { useState } from 'react';
import api, { getErrorMessage } from '../../services/api';
import useApi from '../../hooks/useApi';
import useDebounce from '../../hooks/useDebounce';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { Input } from '../ui/Field';
import { formatQuantity } from '../../utils/currency';
import { translate, useAppLanguage } from '../../context/LanguageContext';

export default function ArchivedProducts({ search, onSearch, onRestored }) {
  useAppLanguage();
  const query = useDebounce(search, 250);
  const archived = useApi((signal) => api.get('/products/archived', { signal, params: { search: query } }).then((r) => r.data), [query]);
  const [restoring, setRestoring] = useState(null);
  const [error, setError] = useState('');
  const restore = async (product) => {
    if (restoring) return;
    setRestoring(product.id); setError('');
    try {
      const { data } = await api.post(`/products/${product.id}/restore`);
      archived.refetch(); onRestored(data);
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setRestoring(null); }
  };
  return <Card className="p-4 space-y-4">
    <div><h2 className="text-lg font-semibold">{translate('Archived products')}</h2><p className="text-sm text-content-muted mt-1">{translate('Restore a product to use it again. Its existing stock, SKU and transaction history are kept. No labels are required.')}</p></div>
    <Input type="search" label={translate('Search archived products')} value={search} onChange={(event) => onSearch(event.target.value)} maxLength={120} />
    {(error || archived.error) && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{translate(error || archived.error)} {archived.error && <Button variant="ghost" onClick={() => archived.refetch()}>{translate('Try again')}</Button>}</p>}
    {archived.loading ? <p role="status">{translate('Loading archived products...')}</p> : archived.data?.length ? <ul className="divide-y divide-hairline/10">{archived.data.map((product) => <li key={product.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1"><p className="font-medium break-words">{product.name}</p><p className="text-sm text-content-muted break-words">{product.sku} / {translate(formatQuantity(product.currentStock))} {translate(product.unit)}</p></div>
      <Button variant="secondary" loading={restoring === product.id} disabled={Boolean(restoring)} onClick={() => restore(product)} aria-label={translate('Restore {0}', [product.name])}>{translate('Restore product')}</Button>
    </li>)}</ul> : !archived.error && <p className="text-sm text-content-muted">{translate('No archived products found.')}</p>}
  </Card>;
}
