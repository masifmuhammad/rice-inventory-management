import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiArrowDownLeft, FiArrowUpRight, FiCamera, FiCheck, FiCheckCircle, FiCircle, FiImage, FiPause, FiPrinter, FiRotateCcw, FiSearch, FiZap } from 'react-icons/fi';
import api, { getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useConfirm } from '../ui/ConfirmProvider';
import { Input, Select } from '../ui/Field';
import useApi from '../../hooks/useApi';
import Button from '../ui/Button';
import { formatMoney, formatQuantity } from '../../utils/currency';
import { feedbackError, feedbackSuccess } from '../../utils/feedback';
import { printLabels, readStored, requestId, writeStored } from '../../utils/barcode';
import BarcodeLabel, { LABEL_STATUS } from './BarcodeLabel';
import CameraReader from './CameraReader';
import { decodeBarcodePhoto } from '../../utils/barcodeReader';
import { translate, useAppLanguage } from '../../context/LanguageContext';

const MODES = [
  { id: 'stock_out', title: 'Stock out', icon: FiArrowUpRight, description: 'Scan a bag to sell it. Stock reduces and the sale enters the cash book at the current selling price.' },
  { id: 'stock_in', title: 'Stock in', icon: FiArrowDownLeft, description: 'Scan a prepared label to receive that bag. Stock is added once. A bag already in stock cannot be received twice.' },
  { id: 'lookup', title: 'Read label', icon: FiSearch, description: 'Check a bag, its stock status and movement history. Reading a label does not change stock.' },
];

export default function ScanStation({ initialMode = 'stock_out', size }) {
  useAppLanguage();
  const { user, businessId, can } = useAuth();
  const { businessName, currencySymbol } = useSettings();
  const confirm = useConfirm();
  const key = `rim.barcode.scans.${user?.id || user?._id}.${businessId}`;
  const queue = useRef(readStored(key, []));
  const alive = useRef(true);
  const running = useRef(false);
  const paused = useRef(queue.current.length > 0);
  const input = useRef(null);
  const imageInput = useRef(null);
  const [mode, setMode] = useState(MODES.some((m) => m.id === initialMode) ? initialMode : 'stock_out');
  const [armed, setArmed] = useState(false);
  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const [station, setStation] = useState(() => readStored(`${key}.station`, ''));
  const [customer, setCustomer] = useState('');
  const [paymentType,setPaymentType] = useState('cash');
  const [customerId,setCustomerId] = useState('');
  const [dueDate,setDueDate] = useState('');
  const customers = useApi((signal)=>api.get('/credit',{signal}).then(r=>r.data.customers),[],{immediate:can('credit.view')});
  const [pending, setPending] = useState(queue.current.length);
  const [blocked, setBlocked] = useState(paused.current);
  const [entries, setEntries] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [camera, setCamera] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const selected = MODES.find((item) => item.id === mode);
  const modeDescription = mode==='stock_out' && paymentType==='credit'
    ? 'Scan a bag to sell it on credit. Stock reduces and the balance is added to the selected customer.' : selected.description;
  const SelectedIcon = selected.icon;
  const ready = (armed || mode === 'lookup') && !blocked && online;

  useEffect(() => {
    alive.current = true;
    const network = () => setOnline(navigator.onLine);
    const stop = () => { alive.current = false; };
    window.addEventListener('online', network); window.addEventListener('offline', network);
    window.addEventListener('rim:business-changed', stop);
    return () => { alive.current = false; window.removeEventListener('online', network); window.removeEventListener('offline', network); window.removeEventListener('rim:business-changed', stop); };
  }, []);

  const addEntry = useCallback((entry) => {
    setEntries((current) => [entry, ...current.filter((item) => item.requestId !== entry.requestId)].slice(0, 50));
  }, []);
  const pump = async () => {
    if (running.current || paused.current || !alive.current) return;
    running.current = true;
    while (queue.current.length && !paused.current && alive.current) {
      const operation = queue.current[0];
      try {
        const { data } = operation.mode === 'lookup'
          ? await api.get(`/barcodes/labels/${encodeURIComponent(operation.code)}`)
          : await api.post('/barcodes/scan', operation);
        queue.current.shift(); writeStored(key, queue.current.length ? queue.current : null);
        if (!alive.current) break;
        setResult({ ...data, mode: operation.mode }); setError('');
        addEntry({ ...operation, label: data.label, transaction: data.transaction, replayed: data.replayed, ok: true });
        feedbackSuccess();
        window.dispatchEvent(new Event('rim:refresh'));
      } catch (err) {
        const uncertain = !err.response || err.response.status >= 500 || err.response.status === 401 || err.response.status === 403 || err.response.status === 429;
        if (!uncertain) { queue.current.shift(); writeStored(key, queue.current.length ? queue.current : null); }
        else { paused.current = true; }
        if (!alive.current) break;
        const message = getErrorMessage(err);
        setError(message); setResult(null); setBlocked(uncertain);
        addEntry({ ...operation, ok: false, uncertain, message }); feedbackError();
      }
      if (alive.current) setPending(queue.current.length);
    }
    running.current = false;
  };
  const enqueue = (value) => {
    const clean = String(value).trim();
    if (!ready) return;
    if (!clean) return;
    if (!/^99\d{16}$/.test(clean)) { setError('Use a pack label made in this app: 18 digits starting with 99.'); feedbackError(); return; }
    if (queue.current.length >= 50) { setError('The scanner is ahead of the server. Let the queued scans finish before scanning more.'); return; }
    if (queue.current.some((item) => item.code === clean && item.mode === mode)) { setCode(''); return; }
    queue.current.push({ requestId: requestId(), code: clean, mode, station, customer: mode === 'stock_out' ? customer : '',
      ...(mode==='stock_out' && paymentType==='credit' ? {paymentType,customerId,dueDate} : {}),
    });
    writeStored(key, queue.current); setPending(queue.current.length); setCode(''); setError(''); setResult(null);
    pump();
  };
  const start = () => {
    if (mode==='stock_out' && paymentType==='credit' && (!customerId || !dueDate)) {setError('Choose a credit customer and a payment due date before scanning.');return;}
    setArmed(true); setError(''); requestAnimationFrame(() => input.current?.focus());
  };
  const retry = () => { paused.current = false; setBlocked(false); setArmed(true); setError(''); pump(); };
  const undo = async (entry) => {
    if (!entry?.transaction?.id || pending || undoBusy) return;
    setArmed(false);
    if (!await confirm({ title: 'Reverse this scan?', message: `${entry.label.productName} · ${formatQuantity(entry.label.quantity)} ${entry.label.unit}. Stock and any linked cash entry will be restored.`, confirmLabel: 'Reverse scan', tone: 'danger' })) return;
    setUndoBusy(true);
    try {
      await api.delete(`/transactions/${entry.transaction.id}`);
      if (!alive.current) return;
      setEntries((current) => current.map((item) => item.transaction?.id === entry.transaction.id ? { ...item, reversed: true } : item));
      setResult(null); setError(''); feedbackSuccess(); window.dispatchEvent(new Event('rim:refresh'));
    } catch (err) { if (alive.current) setError(getErrorMessage(err)); }
    finally { if (alive.current) setUndoBusy(false); }
  };
  const readImage = async (file) => {
    if (!file || !ready) return;
    if (file.size > 15 * 1024 * 1024) { setError('Choose a barcode photo smaller than 15 MB.'); return; }
    setImageBusy(true); setError('');
    try {
      const decoded = await decodeBarcodePhoto(file);
      if (alive.current) enqueue(decoded);
    } catch { if (alive.current) setError('No readable barcode was found. Take a sharper photo showing the whole barcode, or type its number.'); }
    finally { if (alive.current) setImageBusy(false); if (imageInput.current) imageInput.current.value = ''; }
  };
  const doPrint = () => {
    try { printLabels([result.label], { size, businessName }); } catch (err) { setError(err.message); }
  };
  const latest = entries.find((entry) => entry.ok && !entry.reversed && entry.transaction);

  return <div className="barcode-scan-layout">
    <section className={`barcode-station ${armed || mode === 'lookup' ? 'is-armed' : ''}`} aria-label={translate("Scan station")}>
      <div className="barcode-mode-grid" role="group" aria-label={translate("Scan action")}>
        {MODES.map(({ id, title, icon: Icon }) => <button key={id} type="button" aria-pressed={mode === id} disabled={pending > 0 || imageBusy || undoBusy}
          className={`barcode-mode barcode-mode-${id} ${mode === id ? 'is-selected' : ''}`}
          onClick={() => { setMode(id); setArmed(false); setResult(null); setError(''); setCode(''); }}>
          <Icon aria-hidden="true" /><span>{translate(title)}</span>
        </button>)}
      </div>
      <div className="barcode-station-body">
        <div className="barcode-mode-intro flex items-start justify-between gap-4 mb-5"><div><h2 className="text-xl font-semibold text-content">{translate(selected.title === 'Read label' ? 'Know your bag' : selected.title === 'Stock in' ? 'Receive your rice' : 'Scan. Sell. Next bag.')}</h2><p className="barcode-mode-description text-sm text-content-muted mt-2 max-w-xl">{translate(modeDescription)}</p><p className="barcode-mobile-description">{translate(mode === 'stock_out' ? 'One scan sells one bag and records its sale.' : mode === 'stock_in' ? 'One scan receives one bag into stock.' : 'Check a bag without changing stock.')}</p></div><SelectedIcon className="w-6 h-6 text-content-muted shrink-0" aria-hidden="true" /></div>
        {!online && <p role="alert" className="barcode-alert mb-4">{translate("You’re offline. Reconnect before scanning. A bag is only moved after the server confirms it.")}</p>}
        {blocked && <div className="barcode-alert mb-4" role="alert"><strong>{translate("Scans need checking")}</strong><p className="mt-1">{translate(pending)}{translate(" scan")}{translate(pending === 1 ? '' : 's')}{translate(" pending. A connection problem may have interrupted the confirmation. Retry safely with the same request.")}</p><Button className="mt-3" variant="secondary" icon={FiRotateCcw} onClick={retry} disabled={!online}>{translate("Recover pending scans")}</Button></div>}
        {mode==='stock_out' && can('credit.manage') && <div className="space-y-3 mb-4">
          <Select label={translate('Sale payment')} value={paymentType} disabled={armed || pending>0} onChange={e=>setPaymentType(e.target.value)}><option value="cash">{translate('Paid in full')}</option><option value="credit">{translate('Pay later · credit')}</option></Select>
          {paymentType==='credit' && <><div className="grid sm:grid-cols-2 gap-3"><Select label={translate('Credit customer')} value={customerId} disabled={armed || pending>0 || customers.loading} onChange={e=>setCustomerId(e.target.value)}><option value="">{translate('Choose a customer')}</option>{(customers.data || []).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select><Input type="date" label={translate('Payment due date')} value={dueDate} disabled={armed || pending>0} onChange={e=>setDueDate(e.target.value)}/></div><p className="text-xs text-content-muted">{translate('Each scanned bag goes on this customer’s account. Record their repayment in Customer credit when the money arrives.')}</p></>}
        </div>}
        {!armed && mode !== 'lookup' && !blocked ? <div className={`barcode-start barcode-start-${mode}`}>
          <SelectedIcon className="w-9 h-9 mb-3" aria-hidden="true" /><h3 className="text-lg font-semibold">{translate(mode === 'stock_out' ? 'Ready to sell?' : 'Ready to receive?')}</h3>
          <p className="text-sm mt-2 mb-5">{translate(mode === 'stock_out' ? 'Each scan sells one labelled bag. Check the action above before you begin.' : 'Each scan adds the quantity printed on that bag’s label.')}</p>
          <Button onClick={start} disabled={!online || pending > 0} icon={FiZap}>{translate(mode === 'stock_out' ? 'Start stock out' : 'Start stock in')}</Button>
        </div> : <div className={`barcode-input-area ${ready && focused ? 'is-ready' : ''}`}>
          <label htmlFor="pack-code" className="text-sm font-semibold text-content">{translate("Scan a bag or enter its barcode")}</label>
          <div className="barcode-code-row flex gap-2 mt-3"><input ref={input} id="pack-code" className="barcode-code-input" value={code} onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey && code)) { e.preventDefault(); enqueue(code); } }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            disabled={!ready} autoComplete="off" autoCorrect="off" spellCheck={false} inputMode="numeric" maxLength={64} placeholder="99…" aria-describedby="pack-code-hint" />
            <Button onClick={() => { enqueue(code); input.current?.focus(); }} disabled={!ready || !code.trim()} aria-label={translate("Submit barcode")} icon={FiCheck} size="icon" /></div>
          <p id="pack-code-hint" className="barcode-code-hint text-xs text-content-muted mt-3">{translate("Scanner in keyboard mode · Enter or Tab after each scan")}</p>
          <div className="barcode-ready-line" role="status">{ready && focused ? <FiCheckCircle aria-hidden="true" /> : <FiCircle aria-hidden="true" />}<span>{translate(pending ? `${pending} scan${pending === 1 ? '' : 's'} waiting for confirmation` : !online ? 'Offline — scanning paused' : blocked ? 'Waiting for recovery' : focused ? 'Ready for the next bag' : 'Tap the barcode field to scan')}</span></div>
        </div>}
        <div className="flex flex-wrap gap-2 mt-4">
          <Button variant="secondary" icon={FiCamera} onClick={() => setCamera(true)} disabled={!ready || imageBusy}>{translate("Use camera")}</Button>
          <Button variant="ghost" icon={FiImage} onClick={() => imageInput.current?.click()} loading={imageBusy} disabled={!ready}>{translate("Read a photo")}</Button>
          {armed && !pending && <Button variant="ghost" icon={FiPause} onClick={() => { setArmed(false); setCode(''); }}>{translate("Pause")}</Button>}
          <input ref={imageInput} type="file" accept="image/*" className="sr-only" aria-label={translate("Barcode photo")} tabIndex={-1} onChange={(e) => readImage(e.target.files?.[0])} />
        </div>
        <details className="barcode-details mt-4"><summary>{translate("Counter & customer (optional)")}</summary><div className="grid sm:grid-cols-2 gap-3 mt-3">
          <Input label={translate("Shop / counter (optional)")} value={station} maxLength={120} disabled={pending > 0 || armed} onChange={(e) => { setStation(e.target.value); writeStored(`${key}.station`, e.target.value); }} placeholder={translate("e.g. Main shop")} />
          {mode === 'stock_out' && paymentType==='cash' && <Input label={translate("Customer (optional)")} value={customer} maxLength={120} disabled={pending > 0 || armed} onChange={(e) => setCustomer(e.target.value)} />}
        </div></details>
        {error && <p className="barcode-alert mt-4" role="alert">{translate(error)}</p>}
        {result && <div className="barcode-result mt-5" role="status">
          <div className="flex gap-3 items-start"><FiCheckCircle className="w-6 h-6 shrink-0" aria-hidden="true" /><div><p className="font-semibold">{translate(result.replayed ? 'Previous scan confirmed' : result.mode === 'lookup' ? LABEL_STATUS[result.label.status] : result.mode === 'stock_in' ? 'Bag added to stock' : 'Bag sold · stock updated')}</p>
            <p className="mt-1">{result.label.productName} · {translate(formatQuantity(result.label.quantity))} {translate(result.label.unit)}</p>
            {result.transaction && <p className="text-sm mt-1">{translate("Stock after this scan: ")}<strong>{translate(formatQuantity(result.transaction.stockAfter))} {translate(result.label.unit)}</strong>{translate(result.mode === 'stock_out' ? ` · Sale ${formatMoney(result.transaction.totalValue, currencySymbol)}` : '')}</p>}
            {result.transaction?.paymentType==='credit' && <p className="text-sm mt-1 font-medium">{translate('Added to {0}’s credit account',[result.transaction.customer])}</p>}
            {result.mode === 'lookup' && <p className="text-sm mt-1">{translate(formatQuantity(result.currentStock))} {translate(result.label.unit)}{translate(" total product stock")}{translate(result.active ? '' : ' · Product archived')}</p>}
            {result.replayed && <p className="text-sm mt-1">{translate("This request was already recorded. No second movement was made. Read the label to check its current status.")}</p>}
          </div></div>
        </div>}
        {result?.mode === 'lookup' && <div className="mt-5 space-y-4"><BarcodeLabel label={translate(result.label)} businessName={businessName} /><Button variant="secondary" icon={FiPrinter} onClick={doPrint}>{translate("Reprint this label")}</Button>
          {result.history?.length > 0 && <div><h3 className="font-semibold text-sm mb-2">{translate("Bag history")}</h3><ul className="divide-y divide-hairline/10">{result.history.map((row) => <li key={row.id} className="py-3 text-sm"><span className="font-medium">{translate(row.type === 'stock_in' ? 'Stock in' : 'Stock out')}</span><span className="text-content-muted"> · {translate(row.user_name)} · {translate(new Date(row.created_at).toLocaleString())}</span>{row.notes && <p className="text-content-muted mt-1">{row.notes}</p>}</li>)}</ul></div>}
        </div>}
      </div>
    </section>
    <aside className="barcode-session" aria-label={translate("This scanning session")}><div className="flex justify-between items-center gap-3"><h2 className="font-semibold text-lg">{translate("This session")}</h2><span className="text-sm text-content-muted">{translate(entries.filter((entry) => entry.ok && !entry.reversed && entry.transaction).length)}{translate(" bags moved")}</span></div>
      {entries.length === 0 ? <div className="barcode-session-empty"><FiCheckCircle className="w-8 h-8 mb-4 text-content-subtle" aria-hidden="true" /><h3 className="font-medium">{translate("Every bag, confirmed.")}</h3><p className="text-sm text-content-muted mt-2">{translate("Your scans appear here after they are checked. A scanner beep alone does not confirm a stock movement.")}</p></div> : <ul className="barcode-session-list">{entries.map((entry) => <li key={entry.requestId}>
        <div className={`barcode-entry-icon ${entry.ok && !entry.reversed ? 'is-success' : ''}`}>{entry.ok ? entry.reversed ? <FiRotateCcw /> : <FiCheck /> : <FiPause />}</div>
        <div className="min-w-0 flex-1"><p className="font-medium text-sm break-words">{translate(entry.label?.productName || 'Scan needs attention')}</p><p className="text-xs text-content-muted mt-1">{translate(entry.reversed ? 'Reversed' : entry.ok ? entry.mode === 'lookup' ? LABEL_STATUS[entry.label.status] : `${entry.mode === 'stock_in' ? 'Added' : 'Sold'} · ${formatQuantity(entry.label.quantity)} ${entry.label.unit}` : entry.message)}</p><p className="text-xs text-content-muted mt-1 tabular-nums break-all">{entry.code}</p></div>
        {can('transactions.reverse') && entry === latest && <Button variant="ghost" size="icon" icon={FiRotateCcw} aria-label={translate("Reverse scan {0}", [entry.code])} loading={undoBusy} disabled={pending > 0} onClick={() => undo(entry)} />}
      </li>)}</ul>}
      <p className="text-xs text-content-muted pt-4 mt-auto">{translate("Both shops must select the same business to scan these labels. The counter name is saved with each movement.")}</p>
    </aside>
    <CameraReader open={camera} onClose={() => setCamera(false)} onRead={(value) => { setCamera(false); enqueue(value); }} />
  </div>;
}
