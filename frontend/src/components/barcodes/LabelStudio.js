import React, { useEffect, useRef, useState } from 'react';
import { FiArrowLeft, FiCheckCircle, FiPlus, FiPrinter, FiRefreshCw, FiSearch } from 'react-icons/fi';
import { Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../services/api';
import useApi from '../../hooks/useApi';
import useDebounce from '../../hooks/useDebounce';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import Button from '../ui/Button';
import { Input, Select } from '../ui/Field';
import { formatQuantity } from '../../utils/currency';
import { printLabels, readStored, requestId, writeStored } from '../../utils/barcode';
import { feedbackSuccess } from '../../utils/feedback';
import BarcodeLabel, { LABEL_STATUS } from './BarcodeLabel';
import { translate, useAppLanguage } from '../../context/LanguageContext';

const RECEIVING = [
  { id: 'receive', title: 'Receive new stock', description: 'Generate labels and add these bags to inventory now.' },
  { id: 'prepare', title: 'Print first, receive later', description: 'Prepare labels. Stock is added when each bag is scanned in.' },
  { id: 'existing', title: 'Label stock already counted', description: 'Attach unique labels to existing inventory. Stock stays the same.' },
];
const EMPTY_PRODUCTS = [];

export default function LabelStudio({ size, onScan }) {
  useAppLanguage();
  const { user, businessId, can } = useAuth();
  const { businessName } = useSettings();
  const [params] = useSearchParams();
  const key = `rim.barcode.batch.${user?.id || user?._id}.${businessId}`;
  const recovery = useRef(readStored(key, null));
  const alive = useRef(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [productId, setProductId] = useState(params.get('product') || '');
  const [chosenProduct, setChosenProduct] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [count, setCount] = useState('1');
  const [mode, setMode] = useState('receive');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(Boolean(recovery.current));
  const [batch, setBatch] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [historySearch, setHistorySearch] = useState('');
  const historyQuery = useDebounce(historySearch, 250);
  const catalogue = useApi((signal) => api.get('/products', { signal, params: { sort: 'name', search: debouncedSearch, limit: 100 } }).then((r) => r.data), [debouncedSearch]);
  const history = useApi((signal) => api.get('/barcodes/batches', { signal, params: { page, search: historyQuery } }).then((r) => r.data), [page, historyQuery]);
  const product = catalogue.data?.find((item) => item.id === productId) || chosenProduct;
  const candidates = catalogue.data || EMPTY_PRODUCTS;

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!productId || candidates.some((item) => item.id === productId) || chosenProduct?.id === productId) return undefined;
    const controller = new AbortController();
    api.get(`/products/${productId}`, { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) setChosenProduct(data); }).catch((err) => { if (!controller.signal.aborted) setError(getErrorMessage(err)); });
    return () => controller.abort();
  }, [productId, candidates, chosenProduct]);

  const generate = async (payload) => {
    if (busy) return;
    setBusy(true); setError('');
    recovery.current = payload; setPending(true); writeStored(key, payload);
    try {
      const { data } = await api.post('/barcodes/batches', payload);
      writeStored(key, null); recovery.current = null;
      if (!alive.current) return;
      setPending(false); setBatch(data); setPreviewIndex(0); setConfirmRelease(false); setNotice(''); feedbackSuccess();
      history.refetch(); catalogue.refetch(); window.dispatchEvent(new Event('rim:refresh'));
    } catch (err) {
      if (err.response && err.response.status < 500) { writeStored(key, null); recovery.current = null; if (alive.current) setPending(false); }
      if (alive.current) setError(getErrorMessage(err));
    } finally { if (alive.current) setBusy(false); }
  };
  const submit = (event) => {
    event.preventDefault();
    if (pending || !productId || busy) return;
    generate({ requestId: requestId(), product: productId, quantity: Number(quantity), count: Number(count), mode, batchNumber, expiryDate: expiryDate || null });
  };
  const openBatch = async (id) => {
    setBusy(true); setError('');
    try { const { data } = await api.get(`/barcodes/batches/${id}`); if (alive.current) { setBatch(data); setPreviewIndex(0); setConfirmRelease(false); setNotice(''); } }
    catch (err) { if (alive.current) setError(getErrorMessage(err)); }
    finally { if (alive.current) setBusy(false); }
  };
  const release = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/barcodes/batches/' + batch.id + '/release');
      if (!alive.current) return;
      setBatch(data); setConfirmRelease(false);
      setNotice('Labels released. Counted stock is unchanged. You can now record ordinary transactions without a scanner.');
      history.refetch(); catalogue.refetch(); window.dispatchEvent(new Event('rim:refresh'));
    } catch (err) { if (alive.current) setError(getErrorMessage(err)); }
    finally { if (alive.current) setBusy(false); }
  };
  const print = (labels, test = false) => {
    if (!test) labels = labels.filter((label) => label.status !== 'cancelled');
    if (!labels.length) return;
    try { printLabels(labels, { size, businessName, test }); } catch (err) { setError(err.message); }
  };
  const usableLabels = batch?.labels.filter((label) => label.status !== 'cancelled') || [];
  const total = Number(quantity) * Number(count);
  const sample = product ? { productName: product.name, sku: product.sku, quantity: Number(quantity) || 1, unit: product.unit, code: '990000000000000000', batchNumber, expiryDate } : null;

  return <div className="space-y-7">
    {error && <p role="alert" className="barcode-alert">{translate(error)}</p>}
    {notice && <p role="status" className="barcode-generation-summary">{translate(notice)} <Link className="underline" to="/transactions">{translate("Open transactions")}</Link></p>}
    {pending && <div className="barcode-alert" role="status"><strong>{translate("Check the previous label request")}</strong><p className="mt-1 text-sm">{translate("The previous request may already have created labels or received stock. Recover it safely before creating another batch.")}</p><Button icon={FiRefreshCw} variant="secondary" loading={busy} className="mt-3" onClick={() => generate(recovery.current)}>{translate("Recover label request")}</Button></div>}
    {batch && can('transactions.create') && batch.labels.some((label) => ['prepared', 'in_stock'].includes(label.status)) && <section className="barcode-generation-summary space-y-3">
      <h2 className="font-semibold">{translate("No printer or scanner? Release labels")}</h2>
      <p className="text-sm">{translate("Release unsold labels in this batch to use ordinary transactions. Counted stock and past sales stay unchanged. Released barcodes cannot be used again. Remove or discard any printed copies.")}</p>
      {confirmRelease ? <div className="flex flex-wrap gap-2"><Button loading={busy} onClick={release}>{translate("Confirm release")}</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirmRelease(false)}>{translate("Keep labels")}</Button></div> : <Button variant="secondary" disabled={busy} onClick={() => setConfirmRelease(true)}>{translate("Release labels")}</Button>}
    </section>}
    {batch ? <section className="barcode-studio">
      <div className="barcode-studio-form">
        <Button variant="ghost" icon={FiArrowLeft} disabled={busy} onClick={() => { setBatch(null); setConfirmRelease(false); setNotice(''); }}>{translate("Create another batch")}</Button>
        <div className="flex gap-3 mt-5 mb-4"><FiCheckCircle className="w-6 h-6 text-primary-700 dark:text-primary-400 shrink-0" aria-hidden="true" /><div><h2 className="text-xl font-semibold">{translate(usableLabels.length)}{translate(" unique labels ready")}</h2><p className="text-sm text-content-muted mt-1">{translate(!usableLabels.length ? 'Labels released. Counted stock is unchanged. You can now record ordinary transactions without a scanner.' : batch.mode === 'receive' ? 'New stock was received. These bags can now be scanned out.' : batch.mode === 'existing' ? 'Labels are linked to stock already counted. No stock was added.' : 'Stock will be added when each label is scanned in.')}</p></div></div>
        <p className="text-sm text-content-muted">{translate("Print and attach one label per physical bag. Reprinting keeps the original code.")}</p>
        <div className="flex flex-wrap gap-2 mt-5"><Button disabled={!usableLabels.length} icon={FiPrinter} onClick={() => print(batch.labels)}>{translate("Print batch")}</Button><Button variant="secondary" disabled={!usableLabels.length} onClick={() => print(usableLabels.slice(0, 1))}>{translate("Print first label")}</Button><Button variant="ghost" disabled={!usableLabels.length} onClick={() => onScan(batch.mode === 'prepare' ? 'stock_in' : 'stock_out')}>{translate("Go to scanner")}</Button></div>
        <div className="barcode-label-list mt-6" role="list" aria-label={translate("Generated labels")}>{batch.labels.map((label, index) => <button key={label.id} type="button" role="listitem" aria-label={translate("Preview label {0}: {1}", [index + 1, label.code])} aria-current={previewIndex === index ? 'true' : undefined} className={previewIndex === index ? 'is-selected' : ''} onClick={() => setPreviewIndex(index)}><span className="text-sm tabular-nums">{label.code}</span><span className={`barcode-label-status status-${label.status}`}>{translate(LABEL_STATUS[label.status])}</span></button>)}</div>
      </div>
      <aside className="barcode-studio-preview"><h3 className="text-sm font-semibold mb-6">{translate("Label ")}{translate(previewIndex + 1)}{translate(" of ")}{translate(batch.labels.length)}</h3><BarcodeLabel label={translate(batch.labels[previewIndex])} businessName={businessName} /><p className="text-sm text-content-muted mt-5">{translate(size === 'a4' ? 'A4 cut-out labels' : `${size.replace('x', ' × ')} mm`)}{translate(" · Code 128")}</p><Button className="mt-4" variant="secondary" icon={FiPrinter} disabled={batch.labels[previewIndex].status === 'cancelled'} onClick={() => print([batch.labels[previewIndex]])}>{translate("Print this label")}</Button></aside>
    </section> : <section className="barcode-studio">
      <form className="barcode-studio-form space-y-5" onSubmit={submit}>
        <div><h2 className="text-xl font-semibold text-content">{translate("A label for every bag")}</h2><p className="text-sm text-content-muted mt-2">{translate("Choose your rice, pack size and how many bags to label.")}</p></div>
        <fieldset disabled={busy || pending} className="space-y-4">
          <Input label={translate("Find rice by name or SKU")} type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select label={translate("Rice product")} value={productId} required onChange={(e) => { const id = e.target.value; setProductId(id); setChosenProduct(candidates.find((item) => item.id === id) || null); setQuantity('1'); }}>
            <option value="">{translate(catalogue.loading ? 'Loading rice products…' : 'Choose a rice product')}</option>
            {product && !candidates.some((item) => item.id === productId) && <option value={productId}>{product.name} · {product.sku}</option>}
            {candidates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}
          </Select>
          {catalogue.error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{translate(catalogue.error)} <button type="button" className="underline" onClick={() => catalogue.refetch()}>{translate("Try again")}</button></p>}
          {!catalogue.loading && !catalogue.error && candidates.length === 0 && <p className="text-sm text-content-muted">{translate(search ? 'No matching rice. Try a different name.' : 'Add a rice product before creating labels.')} {can('products.manage') && <Link to="/products" className="underline">{translate("Open products")}</Link>}</p>}
          {product && <p className="text-sm text-content-muted">{translate("Currently counted: ")}<strong className="text-content">{translate(formatQuantity(product.currentStock))} {translate(product.unit)}</strong>{translate(". Available to label as existing stock: ")}<strong className="text-content">{translate(formatQuantity(Math.max(0, product.currentStock - (product.labelledStock || 0))))} {translate(product.unit)}</strong>.</p>}
          <div className="grid sm:grid-cols-2 gap-3"><Input label={translate("Quantity per bag{0}", [product ? ` (${product.unit})` : ''])} type="number" min="0.0001" max="9999999999" step="0.0001" required value={quantity} onChange={(e) => setQuantity(e.target.value)} /><Input label={translate("Number of bags / labels")} type="number" min="1" max="200" step="1" required value={count} onChange={(e) => setCount(e.target.value)} /></div>
          {product?.unit === 'kg' && <div className="flex items-center flex-wrap gap-2"><span className="text-xs text-content-muted mr-1">{translate("Bag size")}</span>{[1, 5, 25, 50].map((value) => <button type="button" key={value} className={`barcode-size-chip ${Number(quantity) === value ? 'is-selected' : ''}`} onClick={() => setQuantity(String(value))}>{translate(value)}{translate(" kg")}</button>)}</div>}
          <fieldset className="space-y-2"><legend className="text-sm font-medium mb-2">{translate("What are you labelling?")}</legend>{RECEIVING.map((option) => <label className={`barcode-receive-option ${mode === option.id ? 'is-selected' : ''}`} key={option.id}><input type="radio" name="receiving-mode" value={option.id} checked={mode === option.id} onChange={() => setMode(option.id)} /><span><strong>{translate(option.title)}</strong><span>{translate(option.description)}</span></span></label>)}</fieldset>
          <details className="barcode-details"><summary>{translate("Batch number & expiry date (optional)")}</summary><div className="grid sm:grid-cols-2 gap-3 mt-4"><Input label={translate("Batch number")} maxLength={80} value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} /><Input label={translate("Expiry date")} type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></div></details>
        </fieldset>
        <div className="barcode-generation-summary"><p className="font-semibold">{translate(count || '0')}{translate(" bags × ")}{translate(quantity || '0')} {translate(product?.unit || 'units')} = {translate(formatQuantity(Number.isFinite(total) ? total : 0))} {translate(product?.unit || 'units')}</p><p className="text-sm text-content-muted mt-1">{translate(mode === 'receive' ? 'This quantity will be added to stock now.' : mode === 'existing' ? 'Existing stock will be labelled. The stock total stays the same.' : 'Printing only. No stock changes until the bags are scanned in.')}</p></div>
        <Button type="submit" icon={FiPlus} loading={busy} disabled={!productId || pending || !navigator.onLine}>{translate(mode === 'receive' ? 'Generate labels & receive stock' : 'Generate labels')}</Button>
      </form>
      <aside className="barcode-studio-preview"><h3 className="text-sm font-semibold mb-6">{translate("Label preview")}</h3>{sample ? <BarcodeLabel label={translate(sample)} businessName={businessName} /> : <div className="barcode-preview-empty"><FiPrinter className="w-10 h-10 text-content-subtle mb-4" aria-hidden="true" /><p>{translate("Choose a rice product to preview its label.")}</p></div>}<p className="text-sm text-content-muted mt-5">{translate(size === 'a4' ? 'A4 cut-out labels' : `${size.replace('x', ' × ')} mm`)}{translate(" · Code 128")}</p><p className="text-xs text-content-muted mt-3">{translate("Preview only. Each generated label gets a different barcode.")}</p>{sample && <Button className="mt-4" variant="secondary" icon={FiPrinter} onClick={() => print([sample], true)}>{translate("Print a test label")}</Button>}</aside>
    </section>}
    <section className="barcode-batches"><div className="barcode-section-heading"><div><h2 className="text-lg font-semibold">{translate("Your label batches")}</h2><p className="text-sm text-content-muted mt-1">{translate("Find and reprint labels without adding stock again.")}</p></div><Button variant="ghost" size="icon" icon={FiRefreshCw} aria-label={translate("Refresh label batches")} onClick={() => history.refetch()} loading={history.loading} /></div>
      <div className="px-5 pb-4"><Input label={translate("Find a batch, rice name or barcode")} type="search" value={historySearch} onChange={(e) => { setHistorySearch(e.target.value); setPage(1); }} /></div>
      {history.error ? <p role="alert" className="px-5 pb-5 text-sm text-red-600 dark:text-red-400">{translate(history.error)}</p> : history.loading ? <p role="status" className="px-5 pb-5 text-sm text-content-muted">{translate("Loading label batches…")}</p> : !history.data?.data.length ? <div className="px-5 pb-6 text-sm text-content-muted"><FiSearch className="inline mr-2" aria-hidden="true" />{translate(historySearch ? 'No matching label batches.' : 'Your first label batch will appear here.')}</div> : <ul className="barcode-batch-list">{history.data.data.map((item) => <li key={item.id}><div className="min-w-0"><p className="font-medium break-words">{translate(item.product_name)}</p><p className="text-xs text-content-muted mt-1">{translate(new Date(item.created_at).toLocaleString())} · {translate(item.count)}{translate(" labels")}</p><p className="text-xs text-content-muted mt-1">{translate(item.in_stock)}{translate(" in stock · ")}{translate(item.stock_out)}{translate(" stocked out · ")}{translate(item.count - item.in_stock - item.stock_out - (item.cancelled || 0))}{translate(" awaiting receipt")}{item.cancelled > 0 && <span> / {translate(item.cancelled)} {translate("released")}</span>}</p></div><Button variant="secondary" disabled={busy} onClick={() => openBatch(item.id)}>{translate("View labels")}</Button></li>)}</ul>}
      {history.data?.total > 15 && <div className="flex items-center justify-between gap-3 p-5"><Button variant="secondary" disabled={page === 1 || history.loading} onClick={() => setPage((v) => v - 1)}>{translate("Previous")}</Button><span className="text-sm text-content-muted">{translate(page)} / {translate(Math.ceil(history.data.total / 15))}</span><Button variant="secondary" disabled={page * 15 >= history.data.total || history.loading} onClick={() => setPage((v) => v + 1)}>{translate("Next")}</Button></div>}
    </section>
  </div>;
}
