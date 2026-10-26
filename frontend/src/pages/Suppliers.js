import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiArrowLeft, FiCheck, FiChevronRight, FiDownload, FiPhone, FiPlus, FiTruck } from 'react-icons/fi';
import api, { getErrorMessage } from '../services/api';
import useApi from '../hooks/useApi';
import useLedgerSubmission from '../hooks/useLedgerSubmission';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { translate as t, useAppLanguage } from '../context/LanguageContext';
import { formatMoney, formatQuantity } from '../utils/currency';
import { formatSafe, todayInput } from '../utils/date';
import { toast } from '../utils/toast';
import PageHeader from '../components/PageHeader';
import Button from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Field';
import Modal from '../components/ui/Modal';
import { EmptyState, ErrorState } from '../components/ui/States';
import { SkeletonTable } from '../components/ui/Skeleton';
import './Credit.css';
import './Suppliers.css';

const METHODS = { cash: 'Cash', bank: 'Bank transfer', easypaisa: 'Easypaisa', jazzcash: 'JazzCash', other: 'Other' };
const AGING = [['current', 'Not overdue'], ['days1to30', '1–30 days'], ['days31to60', '31–60 days'], ['days61to90', '61–90 days'], ['daysOver90', 'Over 90 days']];
const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('');
const refresh = () => window.dispatchEvent(new Event('rim:refresh'));

export function SupplierForm({ mode, supplier, balance, suppliers, onSupplierChange, onClose, onSave }) {
  const { currencySymbol } = useSettings();
  const contact = mode === 'add' || mode === 'edit';
  const financial = useLedgerSubmission('supplier-payment.' + (supplier?.id || 'choose'), async (payload) => {
    const result = await api.post(`/suppliers/${supplier.id}/payments`, payload);
    onSave(result.data); onClose();
  });
  const [values, setValues] = useState(!contact && financial.pending?.draft ? financial.pending.draft : contact
    ? { name: supplier?.name || '', phone: supplier?.phone || '', notes: supplier?.notes || '', openingBalance: '', dueDate: todayInput(), openingDate: todayInput() }
    : { amount: '', paymentDate: todayInput(), method: 'cash', reference: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = saving || financial.saving;
  const set = field => event => setValues(current => ({ ...current, [field]: event.target.value }));
  const title = mode === 'add' ? 'Add supplier' : mode === 'edit' ? 'Edit supplier' : 'Record supplier payment';
  const submit = async event => {
    event.preventDefault();
    setError('');
    if (busy) return;
    if (!contact && financial.pending) { await financial.save(null, null); return; }
    if (!contact && !supplier?.id) { setError(t('Choose a supplier')); return; }
    if (contact && !values.name.trim()) { setError('Enter a supplier name.'); return; }
    if (!contact && (!(Number(values.amount) > 0) || Number(values.amount) > balance)) { setError('Enter a payment up to the outstanding balance.'); return; }
    if (!contact) { await financial.save({ ...values, amount: Number(values.amount) }, values); return; }
    setSaving(true);
    try {
      const result = mode === 'add'
        ? await api.post('/suppliers', { ...values, openingBalance: Number(values.openingBalance) || 0 })
        : await api.put(`/suppliers/${supplier.id}`, { name: values.name, phone: values.phone, notes: values.notes });
      onSave(result.data);
      onClose();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };
  return <Modal open onClose={onClose} disableClose={busy} busy={busy} title={t(title)} description={contact ? t('Keep purchases, bills and payments together.') : supplier?.name}
    submit={{ form: 'supplier-form', label: t(!contact && financial.pending && !busy ? 'Confirm previous save' : mode === 'edit' ? 'Save supplier' : title), loading: busy }}>
    <form id="supplier-form" onSubmit={submit} className="space-y-3">
      {!contact && financial.pending && !busy && <p role="status" className="text-sm">{t('The previous save may already be recorded. Confirm it before making another entry. Stock and money will not be recorded twice.')}</p>}
      <fieldset disabled={!contact && Boolean(financial.pending)} className="space-y-3 min-w-0">
      {!contact && suppliers && <Select label={t('Supplier')} required value={supplier?.id || ''} onChange={onSupplierChange}><option value="">{t('Choose a supplier')}</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>}
      {contact ? <>
        <Input label={t('Supplier name')} required maxLength={120} value={values.name} onChange={set('name')} autoComplete="organization" />
        <Input label={t('Phone number')} type="tel" maxLength={40} value={values.phone} onChange={set('phone')} autoComplete="tel" />
        {mode === 'add' && <details className="credit-opening"><summary>{t('Already owe this supplier?')}</summary><div className="space-y-3 pt-3">
          <Input label={t('Existing balance')} type="number" min="0" max="9999999999" step="0.01" prefix={currencySymbol} value={values.openingBalance} onChange={set('openingBalance')} />
          {Number(values.openingBalance) > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label={t('Opening balance date')} type="date" required max={todayInput()} value={values.openingDate} onChange={set('openingDate')} />
            <Input label={t('Payment due date')} type="date" required value={values.dueDate} onChange={set('dueDate')} />
          </div>}
          <p className="text-sm text-content-muted">{t('Adds an opening balance only. Stock and cash stay as recorded.')}</p>
        </div></details>}
        <Textarea label={t('Supplier notes')} maxLength={1000} value={values.notes} onChange={set('notes')} />
      </> : <>
        <div className="credit-form-balance"><span>{t('Outstanding balance')}</span><strong>{formatMoney(balance, currencySymbol)}</strong></div>
        <Input label={t('Amount paid')} required type="number" min="0.01" max={balance} step="0.01" prefix={currencySymbol} value={values.amount} onChange={set('amount')} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label={t('Payment date')} required type="date" max={todayInput()} value={values.paymentDate} onChange={set('paymentDate')} />
          <Select label={t('Payment method')} value={values.method} onChange={set('method')}>{Object.entries(METHODS).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</Select>
        </div>
        <details className="rounded-xl border border-hairline/10 px-3"><summary className="min-h-[44px] flex items-center cursor-pointer text-sm">{t('Reference & notes')}</summary><div className="space-y-3 pb-3">
          <Input label={t('Reference')} maxLength={120} value={values.reference} onChange={set('reference')} />
          <Textarea label={t('Notes')} maxLength={500} value={values.notes} onChange={set('notes')} />
        </div></details>
        <p className="text-sm text-content-muted">{t('Pays the oldest due bill first and records money out. This does not send a bank transfer.')}</p>
      </>}
      </fieldset>
      {(error || financial.error) && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t(error || financial.error)}</p>}
    </form>
  </Modal>;
}

export function PurchaseForm({ supplier, suppliers, onSupplierChange, onClose, onSave }) {
  const { currencySymbol } = useSettings();
  const financial = useLedgerSubmission('supplier-purchase.' + (supplier?.id || 'choose'), async (payload) => {
    await api.post(`/suppliers/${supplier.id}/purchases`, payload);
    onSave(); onClose();
  });
  const products = useApi(signal => api.get('/products', { signal }).then(r => r.data), []);
  const [values, setValues] = useState(financial.pending?.draft || { product: '', quantity: '', price: '', purchaseDate: todayInput(), dueDate: todayInput(), amountPaid: '0', method: 'cash', reference: '', notes: '' });
  const [error, setError] = useState('');
  const saving = financial.saving;
  const productList = Array.isArray(products.data) ? products.data : products.data?.products || [];
  const product = productList.find(p => (p._id || p.id) === values.product);
  const total = Math.round(Number(values.quantity) * Number(values.price) * 100) / 100;
  const due = Math.max(0, total - Number(values.amountPaid));
  const set = field => event => setValues(current => ({ ...current, [field]: event.target.value }));
  const submit = async event => {
    event.preventDefault(); setError('');
    if (saving) return;
    if (financial.pending) { await financial.save(null, null); return; }
    if (!supplier?.id) { setError(t('Choose a supplier')); return; }
    if (!product || !(Number(values.quantity) > 0) || !(Number(values.price) > 0)) { setError('Choose a product and enter a positive quantity and cost.'); return; }
    if (Number(values.amountPaid) < 0 || Number(values.amountPaid) > total) { setError('The deposit cannot exceed the purchase total.'); return; }
    await financial.save({ ...values, quantity: Number(values.quantity), price: Number(values.price), amountPaid: Number(values.amountPaid) }, values);
  };
  return <Modal open onClose={onClose} disableClose={saving} busy={saving} title={t('Receive a purchase')} description={supplier?.name}
    submit={{ form: 'supplier-purchase', label: t(financial.pending && !saving ? 'Confirm previous save' : 'Receive stock and record bill'), loading: saving }}>
    <form id="supplier-purchase" onSubmit={submit} className="space-y-3">
      {financial.pending && !saving && <p role="status" className="text-sm">{t('The previous save may already be recorded. Confirm it before making another entry. Stock and money will not be recorded twice.')}</p>}
      <fieldset disabled={Boolean(financial.pending)} className="space-y-3 min-w-0">
      {suppliers && <Select label={t('Supplier')} required value={supplier?.id || ''} onChange={onSupplierChange}><option value="">{t('Choose a supplier')}</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>}
      <p className="text-sm text-content-muted">{t('Save once. Stock, supplier bill and payment update together.')}</p>
      {products.error ? <ErrorState message={products.error} onRetry={products.refetch} /> : <Select required label={t('Product')} value={values.product} disabled={products.loading} onChange={event => {
        const selected = productList.find(p => (p._id || p.id) === event.target.value);
        setValues(current => ({ ...current, product: event.target.value, price: selected?.costPrice ?? '' }));
      }}><option value="">{t(products.loading ? 'Loading products…' : 'Choose a product')}</option>{productList.map(p => <option value={p._id || p.id} key={p._id || p.id}>{p.name} · {t(p.unit)}</option>)}</Select>}
      {!products.loading && !products.error && !productList.length && <p className="text-sm text-content-muted">{t('Add a product in Stock before receiving a purchase.')}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label={t('Quantity')} hint={product ? t('Unit: {0}', [t(product.unit)]) : undefined} required type="number" min="0.0001" max="999999999" step="0.0001" value={values.quantity} onChange={set('quantity')} />
        <Input label={t('Cost per unit')} prefix={currencySymbol} required type="number" min="0.0001" max="999999999" step="0.0001" value={values.price} onChange={set('price')} />
        <Input label={t('Purchase date')} required type="date" max={todayInput()} value={values.purchaseDate} onChange={set('purchaseDate')} />
        <Input label={t('Payment due date')} required type="date" value={values.dueDate} onChange={set('dueDate')} />
        <Input label={t('Paid now')} prefix={currencySymbol} type="number" min="0" max={total || 0} step="0.01" value={values.amountPaid} onChange={set('amountPaid')} />
        <Select label={t('Payment method')} value={values.method} onChange={set('method')}>{Object.entries(METHODS).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</Select>
      </div>
      <dl className="supplier-purchase-summary"><div><dt>{t('Purchase total')}</dt><dd>{formatMoney(total || 0, currencySymbol)}</dd></div><div><dt>{t('Left to pay')}</dt><dd>{formatMoney(due || 0, currencySymbol)}</dd></div></dl>
      {product && Number(values.quantity) > 0 && <p className="text-sm text-content-muted">{t('Stock after receiving: {0}', [formatQuantity(Number(product.currentStock) + Number(values.quantity), product.unit)])}</p>}
      <details className="rounded-xl border border-hairline/10 px-3"><summary className="min-h-[44px] flex items-center cursor-pointer text-sm">{t('Reference & notes')}</summary><div className="space-y-3 pb-3">
        <Input label={t('Supplier bill reference')} maxLength={120} value={values.reference} onChange={set('reference')} />
        <Textarea label={t('Notes')} maxLength={500} value={values.notes} onChange={set('notes')} />
      </div></details>
      </fieldset>
      {(error || financial.error) && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t(error || financial.error)}</p>}
    </form>
  </Modal>;
}

function ReverseEntry({ supplier, entry, onClose, onSave }) {
  const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const submit = async event => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api.post(`/suppliers/${supplier.id}/${entry.kind === 'payment' ? 'payments' : 'charges'}/${entry.id}/reverse`, { reason });
      onSave(); onClose();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };
  return <Modal open onClose={onClose} disableClose={saving} busy={saving} title={t('Reverse supplier entry')}
    description={t(entry.kind === 'payment' ? 'Restores the supplier debt and reverses the money-out entry. The original payment stays in history.' : entry.chargeType === 'opening' ? 'Removes the opening debt only. Reverse payments applied to it first. The original entry stays in history.' : 'Removes the purchase stock and bill. Reverse all payments against this bill, including its deposit, first. The original bill stays in history.')}
    submit={{ form: 'supplier-reversal', label: t('Reverse entry'), variant: 'danger', loading: saving }}>
    <form id="supplier-reversal" onSubmit={submit} className="space-y-3"><Textarea label={t('Reason for reversal')} required minLength={3} maxLength={300} value={reason} onChange={event => setReason(event.target.value)} />
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t(error)}</p>}
    </form>
  </Modal>;
}

export default function Suppliers() {
  useAppLanguage();
  const { can } = useAuth();
  const { currencySymbol, settings } = useSettings();
  const [params, setParams] = useSearchParams();
  const selected = params.get('supplier');
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState('all');
  const [form, setForm] = useState(null); const [purchaseOpen, setPurchaseOpen] = useState(false); const [reversing, setReversing] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [range, setRange] = useState({ startDate: '', endDate: '' });
  const invalidRange = Boolean(range.startDate && range.endDate && range.startDate > range.endDate);
  const query = useMemo(() => Object.fromEntries(Object.entries(range).filter(([, value]) => value)), [range]);
  const accounts = useApi(signal => api.get('/suppliers', { signal }).then(r => r.data), []);
  const detail = useApi(signal => api.get(`/suppliers/${selected}`, { signal, params: query }).then(r => r.data), [selected, query], { immediate: Boolean(selected) && !invalidRange });
  const suppliers = accounts.data?.suppliers || [];
  const totals = suppliers.reduce((a, supplier) => ({ balance: a.balance + Number(supplier.balance), overdue: a.overdue + Number(supplier.overdue), paid: a.paid + Number(supplier.totalPaid || 0) }), { balance: 0, overdue: 0, paid: 0 });
  const filtered = suppliers.filter(supplier => `${supplier.name} ${supplier.phone || ''}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || (filter === 'overdue' ? supplier.overdue > 0 : supplier.balance === 0)));
  const account = detail.data?.supplier?.id === selected ? detail.data : null;
  const supplier = account?.supplier;
  const statement = account?.statement;
  const history = account ? [...(account.charges || []).map(entry => ({ ...entry, kind: 'charge', date: entry.occurredAt })), ...(account.payments || []).map(entry => ({ ...entry, kind: 'payment', date: entry.paymentDate }))].sort((a, b) => String(b.date).localeCompare(String(a.date))) : [];
  const money = amount => formatMoney(amount || 0, currencySymbol);
  const select = id => { setParams(id ? { supplier: id } : {}); setRange({ startDate: '', endDate: '' }); };
  const saved = message => { refresh(); toast.success(t(message)); };
  const download = async () => {
    if (invalidRange || !account) return;
    setExporting(true);
    try {
      const { generateSupplierStatementPDF } = await import('../utils/pdfGenerator');
      const outcome = await generateSupplierStatementPDF(account, settings, range);
      if (outcome === 'insecure') toast.error(t('Open the app over https to save files on iPhone'));
      else if (outcome !== 'cancelled') toast.success(t(outcome === 'shared' ? 'Statement ready to share' : outcome === 'opened' ? 'Statement opened' : 'Statement downloaded'));
    } catch (err) { toast.error(getErrorMessage(err, 'Could not download the statement. Please try again.')); } finally { setExporting(false); }
  };
  return <div className={`credit-page supplier-page space-y-5 ${selected ? 'credit-show-account' : ''}`}>
    <PageHeader className="credit-page-header" title={t('Supplier ledger')} description={t('Rice received, bills due and payments to suppliers, in one account.')}
      actions={can('suppliers.manage') && <Button icon={FiPlus} onClick={() => setForm('add')}>{t('Add supplier')}</Button>} />
    {accounts.error ? <ErrorState message={accounts.error} onRetry={accounts.refetch} /> : accounts.loading && !accounts.data ? <SkeletonTable rows={5} columns={3} /> : <>
      <dl className="credit-overview" aria-label={t('Supplier balances')}><div><dt>{t('To pay')}</dt><dd>{money(totals.balance)}</dd></div><div data-overdue={totals.overdue > 0}><dt>{t('Overdue')}</dt><dd>{money(totals.overdue)}</dd></div><div><dt>{t('Payments recorded')}</dt><dd>{money(totals.paid)}</dd></div></dl>
      {!suppliers.length ? <EmptyState icon={FiTruck} title={t('Start your supplier ledger')} description={t('Add a supplier and any existing debt, then receive purchases and record payments as they happen.')}
        action={can('suppliers.manage') ? <Button icon={FiPlus} onClick={() => setForm('add')}>{t('Add supplier')}</Button> : undefined} /> : <div className={`credit-workspace ${selected ? 'credit-has-selection' : ''}`}>
        <aside className="credit-directory" aria-label={t('Suppliers')}><div className="credit-directory-tools">
          <Input label={t('Find a supplier')} type="search" value={search} onChange={event => setSearch(event.target.value)} />
          <div className="credit-filters" aria-label={t('Filter suppliers')}>{[['all', 'All'], ['overdue', 'Overdue'], ['settled', 'Settled']].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{t(label)}</button>)}</div>
        </div>{!filtered.length ? <p className="p-5 text-sm text-content-muted">{t('No suppliers match this view.')}</p> : <ul>{filtered.map(item => <li key={item.id}><button type="button" className="credit-person" aria-current={selected === item.id ? 'true' : undefined} onClick={() => select(item.id)}>
          <span className="credit-avatar" aria-hidden="true">{initials(item.name)}</span><span className="credit-person-copy"><strong>{item.name}</strong><span>{item.overdue > 0 ? t('Overdue') : item.balance === 0 ? t('All settled') : t('Due {0}', [formatSafe(item.nextDueDate, 'd MMM')])}</span></span><span className="credit-person-amount">{money(item.balance)}<FiChevronRight aria-hidden="true" /></span>
        </button></li>)}</ul>}</aside>
        <section className="credit-account" aria-label={t('Supplier account')}>
          {!selected ? <EmptyState icon={FiTruck} title={t('Choose a supplier')} description={t('Their purchases, payments and running balance will appear here.')} />
            : detail.loading ? <SkeletonTable rows={5} columns={3} /> : detail.error ? <><Button variant="ghost" icon={FiArrowLeft} onClick={() => select(null)}>{t('Back to suppliers')}</Button><ErrorState message={detail.error} onRetry={detail.refetch} /></> : supplier && <>
              <div className="credit-account-header"><Button className="credit-back" variant="ghost" icon={FiArrowLeft} onClick={() => select(null)}>{t('Suppliers')}</Button>
                <div className="credit-account-identity"><span className="credit-avatar credit-avatar-large" aria-hidden="true"><FiTruck /></span><div><h2>{supplier.name}</h2>{supplier.phone && <a href={`tel:${supplier.phone.replace(/[^+\d]/g, '')}`}><FiPhone aria-hidden="true" />{supplier.phone}</a>}</div></div>
                {can('suppliers.manage') && <button className="credit-edit" type="button" onClick={() => setForm('edit')}>{t('Edit supplier')}</button>}
                {supplier.notes && <p className="credit-notes">{supplier.notes}</p>}
                <div className="credit-account-balance"><span>{t('Outstanding balance')}</span><strong>{money(account.balance)}</strong>{account.balance === 0 && <span className="credit-settled"><FiCheck aria-hidden="true" />{t('All settled')}</span>}</div>
                {can('suppliers.manage') && <div className="credit-account-actions"><Button onClick={() => setForm('payment')} disabled={account.balance <= 0}>{t('Record payment')}</Button><Button variant="secondary" icon={FiPlus} onClick={() => setPurchaseOpen(true)}>{t('Receive a purchase')}</Button></div>}
                {account.aging && <details className="supplier-aging"><summary>{t('How long bills have been overdue')}</summary><dl>{AGING.map(([key, label]) => <div key={key}><dt>{t(label)}</dt><dd>{money(account.aging[key])}</dd></div>)}</dl></details>}
                {account.charges.some(entry => !entry.voidedAt && entry.outstanding > 0) && <details className="supplier-open-bills"><summary>{t('Bills to pay')}</summary><ul>{account.charges.filter(entry => !entry.voidedAt && entry.outstanding > 0).map(entry => <li key={entry.id}><div><strong>{entry.chargeType === 'opening' ? t('Opening balance') : entry.description}</strong><span>{t('Due {0}', [formatSafe(entry.dueDate, 'd MMM yyyy')])}{entry.reference ? ` · ${entry.reference}` : ''}</span></div><div><strong>{money(entry.outstanding)}</strong><span>{t(entry.dueDate < account.today ? 'Overdue' : entry.paid > 0 ? 'Partly paid' : 'Unpaid')}</span></div></li>)}</ul></details>}
              </div>
              <div className="credit-history-heading"><h3>{t('Account statement')}</h3><Button variant="ghost" size="sm" icon={FiDownload} loading={exporting} disabled={invalidRange || detail.loading} onClick={download}>{t('Export statement')}</Button></div>
              <div className="supplier-period"><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Input label={t('From')} type="date" max={range.endDate || undefined} value={range.startDate} onChange={event => setRange(current => ({ ...current, startDate: event.target.value }))} /><Input label={t('To')} type="date" min={range.startDate || undefined} value={range.endDate} onChange={event => setRange(current => ({ ...current, endDate: event.target.value }))} /></div>
                {(range.startDate || range.endDate) ? <Button variant="ghost" size="sm" onClick={() => setRange({ startDate: '', endDate: '' })}>{t('Show all dates')}</Button> : <p className="text-sm text-content-muted mt-2">{t('All dates. Choose a period to see its opening and closing balance.')}</p>}
                {invalidRange && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t('The start date must be on or before the end date.')}</p>}
              </div>
              {!invalidRange && statement && <><div className="supplier-statement-scroll" tabIndex={0} role="region" aria-label={t('Supplier statement table')}><table className="supplier-statement"><thead><tr>{['Date', 'Description', 'Bills', 'Payments', 'Balance'].map(label => <th key={label} scope="col">{t(label)}</th>)}</tr></thead><tbody>
                <tr className="supplier-balance-row"><th scope="row" colSpan={4}>{t('Opening balance')}</th><td>{money(statement.openingBalance)}</td></tr>
                {statement.rows.map(row => <tr key={row.id} className={row.voidedAt ? 'supplier-row-reversed' : ''}><td>{formatSafe(row.date, 'd MMM yyyy')}</td><td>{row.description.startsWith('Payment - ') ? `${t('Supplier payment')} · ${t(METHODS[row.description.slice(10)] || row.description.slice(10))}` : row.description === 'Opening balance' ? t('Opening balance') : row.description}{row.reference && <small>{t('Ref {0}', [row.reference])}</small>}{row.voidedAt && <small>{t('Reversed')}{row.voidReason ? `: ${row.voidReason}` : ''}</small>}</td><td>{row.debit ? money(row.debit) : '—'}</td><td>{row.credit ? money(row.credit) : '—'}</td><td>{money(row.balance)}</td></tr>)}
                {!statement.rows.length && <tr><td colSpan={5}>{t('No entries in this period.')}</td></tr>}
              </tbody><tfoot><tr><th scope="row" colSpan={2}>{t('Closing balance')}</th><td>{money(statement.totalCharges)}</td><td>{money(statement.totalPayments)}</td><td>{money(statement.closingBalance)}</td></tr></tfoot></table></div><p className="supplier-statement-note">{t('Bills increase what you owe. Payments reduce it. The outstanding balance above includes all dates.')}</p></>}
              {history.length > 0 && can('suppliers.reverse') && <details className="supplier-corrections"><summary>{t('Correct an entry')}</summary><p>{t('Reverse mistakes with a reason. Original entries remain in the ledger.')}</p><ul>{history.filter(entry => !entry.voidedAt).map(entry => <li key={`${entry.kind}-${entry.id}`}><div><strong>{entry.kind === 'payment' ? t('Supplier payment') : entry.description}</strong><span>{formatSafe(entry.date, 'd MMM yyyy')} · {money(entry.amount)}</span></div><Button variant="ghost" size="sm" onClick={() => setReversing(entry)}>{t('Reverse')}</Button></li>)}</ul></details>}
            </>}
        </section>
      </div>}
    </>}
    {form && <SupplierForm key={`${form}-${selected}`} mode={form} supplier={supplier} balance={account?.balance || 0} onClose={() => setForm(null)} onSave={result => {
      if (form === 'add') select(result.id || result.supplier?.id);
      saved(form === 'add' ? 'Supplier added' : form === 'edit' ? 'Supplier updated' : 'Supplier payment recorded');
    }} />}
    {purchaseOpen && supplier && <PurchaseForm supplier={supplier} onClose={() => setPurchaseOpen(false)} onSave={() => saved('Purchase received and bill recorded')} />}
    {reversing && supplier && <ReverseEntry supplier={supplier} entry={reversing} onClose={() => setReversing(null)} onSave={() => saved('Supplier entry reversed')} />}
  </div>;
}
