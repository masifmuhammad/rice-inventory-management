import React, { useEffect, useRef, useState } from 'react';
import { FiCheck, FiCheckCircle, FiDelete, FiGrid, FiMinus, FiPackage, FiPlus, FiRefreshCw, FiRadio, FiSettings, FiShoppingBag, FiTrash2, FiTruck } from 'react-icons/fi';
import api from '../services/api';
import useApi from '../hooks/useApi';
import useLedgerSubmission from '../hooks/useLedgerSubmission';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useShopMode } from '../context/ShopModeContext';
import { translate, useAppLanguage } from '../context/LanguageContext';
import { usePageTitle } from '../context/PageTitleContext';
import { formatMoney, formatQuantity } from '../utils/currency';
import { roundDecimal } from '../utils/decimal';
import { feedbackSuccess } from '../utils/feedback';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import ShopSetup from '../components/products/ShopSetup';
import './ShopFloor.css';
import ScanStation from '../components/barcodes/ScanStation';
import { readStored, writeStored } from '../utils/barcode';

const readDraft = (key) => { try { const data = JSON.parse(sessionStorage.getItem(key)); return Array.isArray(data?.carts?.sale) && Array.isArray(data?.carts?.receive) ? data : null; } catch { return null; } };
const packetsAvailable = (p) => p.packQuantity ? Math.floor(Math.round(p.availableStock * 10000) / Math.round(p.packQuantity * 10000)) : 0;
const lineValue = (p, mode) => roundDecimal((mode === 'sale' ? p.sellingPrice : p.costPrice) * roundDecimal(p.packQuantity * p.count, 4));

function PacketKeypad({ count, onClose, onSave }) {
  const [digits, setDigits] = useState(String(count));
  const [fresh, setFresh] = useState(true);
  return <Modal open onClose={onClose} title={translate('How many packets?')} size="sm">
    <div className="shop-count-display" aria-live="polite">{digits || '0'}</div>
    <div className="shop-keypad">{['1','2','3','4','5','6','7','8','9','0'].map((digit) => <button type="button" key={digit} onClick={() => { setDigits((value) => (fresh || value === '0' ? digit : value + digit).slice(0, 4)); setFresh(false); }}>{digit}</button>)}<button type="button" aria-label={translate('Delete last digit')} onClick={() => { setDigits((value) => value.slice(0,-1)); setFresh(false); }}><FiDelete aria-hidden="true" /></button><button type="button" className="shop-keypad-confirm" aria-label={translate('Use packet count')} disabled={!(Number(digits) > 0)} onClick={() => onSave(Number(digits))}><FiCheck aria-hidden="true" /></button></div>
  </Modal>;
}

export default function ShopFloor() {
  useAppLanguage();
  const { user, businessId, can } = useAuth();
  const { currencySymbol } = useSettings();
  const { setTitle } = usePageTitle();
  const { setPending } = useShopMode();
  const key = `rim.shop-cart.${user?.id || user?._id}.${businessId}`;
  const catalogue = useApi((signal) => api.get('/shop/products', { signal }).then((r) => r.data), [], { keepPreviousData: true });
  const refreshCatalogue = catalogue.refetch;
  const scanQueue = useRef(readStored(`rim.barcode.scans.${user?.id || user?._id}.${businessId}`, []));
  const [scanPending, setScanPending] = useState(scanQueue.current.length > 0);
  const [scanner, setScanner] = useState(() => scanQueue.current.length > 0 || readStored(`${key}.scanner`, false));
  const [receipt, setReceipt] = useState(null);
  const [setup, setSetup] = useState(false);
  const [keypad, setKeypad] = useState(null);
  const submission = useLedgerSubmission('shop', async (payload) => {
    const { data } = await api.post('/shop/checkout', payload);
    setReceipt(data); setCarts((current) => ({ ...current, [payload.mode]: [] }));
    catalogue.refetch({ keepPreviousData: true }); window.dispatchEvent(new Event('rim:refresh')); feedbackSuccess();
  });
  const initial = useRef(submission.pending?.draft || readDraft(key));
  const [mode, setMode] = useState(scanQueue.current.length ? (scanQueue.current[0].mode === 'stock_in' ? 'receive' : 'sale') : initial.current?.mode || 'sale');
  const [carts, setCarts] = useState(() => ({ sale: [], receive: [], ...(initial.current?.carts || {}),
    ...(initial.current?.lines ? { [initial.current.mode]: initial.current.lines } : {}) }));
  const [receiveCount, setReceiveCount] = useState(1);
  const locked = Boolean(submission.pending) || submission.saving || scanPending;
  const lines = submission.pending?.draft?.lines || carts[mode];
  const products = catalogue.data?.products || [];
  const configured = products.filter((p) => p.packQuantity > 0);
  const totalCount = lines.reduce((sum, line) => sum + line.count, 0);
  const total = roundDecimal(lines.reduce((sum, line) => sum + lineValue(line, mode), 0));
  const short = mode === 'sale' && lines.some((line) => {
    const current = products.find((p) => p.id === line.id);
    return !current || line.count > packetsAvailable({ ...current, packQuantity: line.packQuantity });
  });

  useEffect(() => { setTitle(translate('Shop mode')); return () => setTitle(''); }, [setTitle]);
  useEffect(() => { setPending(Boolean(submission.pending) || scanPending); return () => setPending(false); }, [submission.pending, scanPending, setPending]);
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify({ mode, carts })); } catch { /* Cart remains available in this view. */ } }, [key, mode, carts]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') refreshCatalogue({ keepPreviousData: true }); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [refreshCatalogue]);

  const changeLines = (update) => { if (locked) return; setReceipt(null); setCarts((current) => ({ ...current, [mode]: update(current[mode]) })); };
  const setCount = (id, count) => { if (locked) return; if (mode === 'receive') setReceiveCount(Math.max(1, Math.min(9999, count))); changeLines((current) => current.map((p) => p.id === id ? { ...p, count: Math.min(9999, count) } : p).filter((p) => p.count > 0)); };
  const add = (product) => changeLines((current) => {
    if (mode === 'receive') return [{ ...product, count: receiveCount }];
    const present = current.find((p) => p.id === product.id);
    return present ? current.map((p) => p.id === product.id ? { ...p, count: Math.min(9999, p.count + 1) } : p) : [...current, { ...product, count: 1 }];
  });
  const preset = (count) => { if (locked) return; setReceiveCount(count); if (mode === 'receive') changeLines((current) => current.map((p) => ({ ...p, count }))); };
  const refreshPrices = async () => {
    const data = await catalogue.refetch({ keepPreviousData: true });
    if (!data) return;
    setCarts((current) => ({ ...current, [mode]: current[mode].flatMap((line) => {
      const product = data.products.find((p) => p.id === line.id && p.packQuantity > 0);
      return product ? [{ ...product, count: line.count }] : [];
    }) }));
    submission.clearError();
  };
  const checkout = () => {
    if (submission.pending) { submission.save(null, null); return; }
    submission.save({ mode, items: lines.map((p) => ({ product: p.id, count: p.count, packQuantity: p.packQuantity,
      unitPrice: mode === 'sale' ? p.sellingPrice : p.costPrice, ...(mode === 'receive' ? { supplierId: p.supplierId } : {}) })) }, { mode, lines });
  };

  return <section className={`shop-floor ${scanner ? 'shop-floor-scanning' : ''}`} aria-label={translate('Shop mode')}>
    <div className="shop-heading"><div><h1>{translate('Shop mode')}</h1><p>{translate(scanner ? 'Scan a bag. Wait for confirmation.' : 'Tap rice. Choose packets. Save.')}</p></div>{can('products.manage') && <Button variant="secondary" className="shop-setup-button" aria-label={translate('Set up buttons')} icon={FiSettings} onClick={() => setSetup(true)} disabled={locked || scanner}><span>{translate('Set up buttons')}</span></Button>}</div>
    <div className="shop-actions" role="group" aria-label={translate('Shop action')}>
      <button type="button" aria-pressed={mode === 'sale'} disabled={locked} onClick={() => { setMode('sale'); setReceipt(null); }}><FiShoppingBag aria-hidden="true" /><span>{translate('Sell')}</span></button>
      <button type="button" aria-pressed={mode === 'receive'} disabled={locked} onClick={() => { setMode('receive'); setReceipt(null); }}><FiTruck aria-hidden="true" /><span>{translate('Receive')}</span></button>
    </div>
    <div className="shop-input-method" role="group" aria-label={translate('How to record')}><button type="button" aria-pressed={!scanner} disabled={locked} onClick={() => { setScanner(false); writeStored(`${key}.scanner`, false); }}><FiGrid aria-hidden="true" />{translate('Tap products')}</button><button type="button" aria-pressed={scanner} disabled={locked || Boolean(carts[mode].length)} onClick={() => { setScanner(true); setReceipt(null); writeStored(`${key}.scanner`, true); }}><FiRadio aria-hidden="true" />{translate('Use scanner')}</button></div>
    {!scanner && carts[mode].length > 0 && <p className="shop-note">{translate('Save or clear these packets before using the scanner.')}</p>}
    {scanner ? <ScanStation key={mode} shop initialMode={mode === 'sale' ? 'stock_out' : 'stock_in'} onPendingChange={setScanPending} /> : <>
    {receipt && <div className="shop-receipt" role="status"><FiCheckCircle aria-hidden="true" /><div><strong>{translate(receipt.count)} {translate('packets')}</strong><span>{translate(receipt.mode === 'sale' ? 'Sale saved — cash and stock updated' : 'Received — stock and supplier bill saved')}</span></div><b>{translate(formatMoney(receipt.total, currencySymbol))}</b></div>}
    {submission.pending && !submission.saving && <p role="status" className="shop-message">{translate('The previous save may already be recorded. Confirm it before making another entry. Stock and money will not be recorded twice.')}</p>}
    {mode === 'receive' && <div className="shop-quantities" role="group" aria-label={translate('Packets received')}>{[1,5,10,25,50].map((count) => <button type="button" key={count} aria-pressed={receiveCount === count} disabled={locked} onClick={() => preset(count)}><FiPackage aria-hidden="true" />{count}</button>)}<button type="button" disabled={locked} aria-label={translate('Other packet count')} onClick={() => setKeypad('receive')}><FiGrid aria-hidden="true" /></button></div>}
    {mode === 'receive' && <p className="shop-note">{translate('Count the packets. The supplier bill is saved unpaid; an admin handles the payment.')}</p>}
    {(catalogue.error || submission.error) && <div role="alert" className="shop-message"><p>{translate(submission.error || catalogue.error)}</p><Button className="mt-2" variant="secondary" icon={FiRefreshCw} onClick={refreshPrices} disabled={locked}>{translate('Refresh products')}</Button></div>}
    {!catalogue.data && catalogue.loading ? <div className="shop-product-grid" aria-label={translate('Loading products')}><div className="shop-product shop-skeleton" /><div className="shop-product shop-skeleton" /></div> : !configured.length ? <div className="shop-empty"><FiPackage aria-hidden="true" /><h2>{translate('Admin setup needed')}</h2><p>{translate('An administrator sets packet sizes and prices once. Then selling takes two taps.')}</p>{can('products.manage') && <Button onClick={() => setSetup(true)}>{translate('Set up buttons')}</Button>}</div> : <div className="shop-product-grid">{configured.map((p) => {
      const selected = lines.find((line) => line.id === p.id);
      const packValue = lineValue({ ...p, count: 1 }, mode);
      const canAdd = mode === 'sale' ? packValue > 0 && packetsAvailable(p) > (selected?.count || 0) : Boolean(p.supplierId && packValue > 0);
      const caption = packValue <= 0 ? (mode === 'sale' ? 'Admin: set selling price' : 'Admin: set cost price') : mode === 'sale' ? (packetsAvailable(p) > 0 ? '{0} packets available' : 'No packets available') : p.supplierName ? 'From {0}' : 'Admin: choose a supplier';
      return <article className={`shop-product ${selected ? 'is-selected' : ''}`} data-colour={p.colour} key={p.id}>
        <button type="button" className="shop-product-main" aria-label={translate('Add {0}', [p.buttonLabel || p.name])} disabled={locked || !canAdd} onClick={() => add(p)}>
          <span className="shop-product-symbol"><b>{p.buttonNumber}</b><FiPackage aria-hidden="true" /></span>
          <strong>{p.buttonLabel || p.name}</strong><span className="shop-pack-size">{translate(formatQuantity(p.packQuantity))} {translate(p.unit)} / {translate('packet')}</span>
          <b className="shop-price">{translate(formatMoney(lineValue({ ...p, count: 1 }, mode), currencySymbol))}</b>
          <span className="shop-available">{translate(caption, [mode === 'sale' ? packetsAvailable(p) : p.supplierName])}</span>
        </button>
        <div className="shop-product-count"><button type="button" aria-label={translate('Remove one {0}', [p.buttonLabel || p.name])} disabled={locked || !selected} onClick={() => setCount(p.id, selected.count - 1)}><FiMinus aria-hidden="true" /></button><button type="button" className="shop-count-value" aria-label={translate('Packet count for {0}', [p.buttonLabel || p.name])} disabled={locked || !selected} onClick={() => setKeypad(p.id)}>{translate(selected?.count || 0)}</button><button type="button" aria-label={translate('Add one {0}', [p.buttonLabel || p.name])} disabled={locked || !canAdd} onClick={() => mode === 'receive' && selected ? setCount(p.id, selected.count + 1) : add(p)}><FiPlus aria-hidden="true" /></button></div>
      </article>;
    })}</div>}
    <div className="shop-checkout"><div className="shop-checkout-summary"><span><FiPackage aria-hidden="true" />{translate(totalCount)} {translate('packets')}</span><button type="button" disabled={locked || !lines.length} aria-label={translate('Clear packets')} onClick={() => changeLines(() => [])}><FiTrash2 aria-hidden="true" /></button><strong>{translate(formatMoney(total, currencySymbol))}</strong></div>
      {short && !submission.pending && <p role="alert" className="shop-note">{translate('Not enough stock. Reduce the packet count.')}</p>}
      <button type="button" className="shop-save" disabled={submission.saving || (!submission.pending && (!lines.length || short || total <= 0))} aria-busy={submission.saving || undefined} onClick={checkout}>
        {submission.saving ? <FiRefreshCw className="animate-spin" aria-hidden="true" /> : <FiCheck aria-hidden="true" />}<span>{translate(submission.pending && !submission.saving ? 'Confirm previous save' : mode === 'sale' ? 'Record cash sale' : 'Receive packets')}</span>
      </button>
    </div>
    </>}
    {setup && can('products.manage') && <ShopSetup products={products} onClose={() => setSetup(false)} onSaved={() => catalogue.refetch({ keepPreviousData: true })} />}
    {keypad && <PacketKeypad count={keypad === 'receive' ? receiveCount : lines.find((p) => p.id === keypad)?.count || 1} onClose={() => setKeypad(null)} onSave={(count) => { if (keypad === 'receive' || mode === 'receive') preset(count); else setCount(keypad, count); setKeypad(null); }} />}
  </section>;
}
