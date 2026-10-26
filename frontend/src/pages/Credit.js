import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiArrowLeft, FiArrowUpRight, FiCheck, FiChevronRight, FiCopy, FiDownload, FiPhone, FiPlus, FiUsers } from 'react-icons/fi';
import api, { getErrorMessage } from '../services/api';
import useApi from '../hooks/useApi';
import useLedgerSubmission from '../hooks/useLedgerSubmission';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { translate as t, useAppLanguage } from '../context/LanguageContext';
import { formatMoney } from '../utils/currency';
import { formatSafe, todayInput } from '../utils/date';
import { toast } from '../utils/toast';
import PageHeader from '../components/PageHeader';
import Button from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Field';
import Modal from '../components/ui/Modal';
import { EmptyState, ErrorState } from '../components/ui/States';
import { SkeletonTable } from '../components/ui/Skeleton';
import TransactionFormModal from '../components/transactions/TransactionFormModal';
import { useConfirm } from '../components/ui/ConfirmProvider';
import './Credit.css';

const METHODS = { cash: 'Cash', bank: 'Bank transfer', easypaisa: 'Easypaisa', jazzcash: 'JazzCash', other: 'Other' };
const initials = (name) => name.trim().split(/\s+/).slice(0,2).map((word) => word[0]).join('');
const day = (value) => String(value || '').slice(0,10);

export function CreditForm({ mode, customer, balance, customers, onCustomerChange, onClose, onSave }) {
  const { currencySymbol } = useSettings();
  const customerForm = mode === 'customer' || mode === 'edit';
  const financial = useLedgerSubmission('customer-payment.' + (customer?.id || 'choose'), async (payload) => {
    const result = await api.post('/credit/customers/' + customer.id + '/payments', payload);
    onSave(result.data); onClose();
  });
  const [values, setValues] = useState(!customerForm && financial.pending?.draft ? financial.pending.draft : mode === 'edit' ? {name:customer.name,phone:customer.phone,notes:customer.notes} : mode === 'customer' ? { name: '', phone: '', notes: '', openingBalance: '', dueDate: todayInput() }
    : { amount: '', paymentDate: todayInput(), method: 'cash', reference: '', notes: '' });
  const [error,setError] = useState('');
  const [saving,setSaving] = useState(false);
  const set = (field) => (event) => setValues((current) => ({...current,[field]:event.target.value}));
  const busy = saving || financial.saving;
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (busy) return;
    if (!customerForm && financial.pending) { await financial.save(null, null); return; }
    if (!customerForm && !customer?.id) { setError(t('Choose a customer')); return; }
    if (customerForm && !values.name.trim()) { setError(t('Enter a customer name.')); return; }
    if (!customerForm && (!(Number(values.amount) > 0) || Number(values.amount) > balance)) { setError(t('Enter a payment up to the outstanding balance.')); return; }
    if (!customerForm) { await financial.save(values, values); return; }
    setSaving(true);
    try {
      const result = mode==='edit' ? await api.put(`/credit/customers/${customer.id}`,values) : await api.post('/credit/customers', {...values,openingBalance:values.openingBalance || 0});
      onSave(result.data); onClose();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };
  return <Modal open onClose={onClose} disableClose={busy} busy={busy}
    title={mode==='edit' ? t('Edit customer') : customerForm ? t('Add customer') : t('Record repayment')}
    description={customerForm ? t('Keep their credit and repayments together.') : customer?.name}
    submit={{form:'credit-form',label:!customerForm && financial.pending && !busy ? t('Confirm previous save') : mode==='edit' ? t('Save customer') : customerForm ? t('Add customer') : t('Record repayment'),loading:busy}}>
    <form id="credit-form" onSubmit={submit} className="space-y-3">
      {!customerForm && financial.pending && !busy && <p role="status" className="text-sm">{t('The previous save may already be recorded. Confirm it before making another entry. Stock and money will not be recorded twice.')}</p>}
      <fieldset disabled={!customerForm && Boolean(financial.pending)} className="space-y-3 min-w-0">
      {customerForm ? <>
        <Input label={t('Customer name')} required value={values.name} onChange={set('name')} maxLength={120} autoComplete="name" />
        <Input label={t('Phone number')} type="tel" value={values.phone} onChange={set('phone')} maxLength={40} autoComplete="tel" />
        {mode!=='edit' && <details className="credit-opening"><summary>{t('Already owes you money?')}</summary><div className="space-y-3 pt-3">
          <Input label={t('Existing balance')} type="number" min="0" max="9999999999" step="0.01" inputMode="decimal" prefix={currencySymbol} value={values.openingBalance} onChange={set('openingBalance')} />
          {Number(values.openingBalance)>0 && <Input label={t('Payment due date')} type="date" required value={values.dueDate} onChange={set('dueDate')} />}
          <p className="text-xs text-content-muted">{t('Adds an opening balance only. Stock and cash stay as recorded.')}</p>
        </div></details>}
        <Textarea label={t('Customer notes')} value={values.notes} onChange={set('notes')} maxLength={1000} />
      </> : <>
        {customers && <Select label={t('Customer')} required value={customer?.id || ''} onChange={onCustomerChange}><option value="">{t('Choose a customer')}</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>}
        <div className="credit-form-balance"><span>{t('Outstanding balance')}</span><strong>{formatMoney(balance,currencySymbol)}</strong></div>
        <Input label={t('Amount received')} required type="number" min="0.01" max={balance} step="0.01" inputMode="decimal" prefix={currencySymbol} value={values.amount} onChange={set('amount')} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label={t('Payment date')} required type="date" max={todayInput()} value={values.paymentDate} onChange={set('paymentDate')} />
          <Select label={t('Payment method')} value={values.method} onChange={set('method')}>{Object.entries(METHODS).map(([value,label]) => <option key={value} value={value}>{t(label)}</option>)}</Select>
        </div>
        <details className="rounded-xl border border-hairline/10 px-3"><summary className="min-h-[44px] flex items-center cursor-pointer text-sm">{t('Reference & notes')}</summary><div className="space-y-3 pb-3">
          <Input label={t('Reference')} value={values.reference} onChange={set('reference')} maxLength={120} />
          <Textarea label={t('Notes')} value={values.notes} onChange={set('notes')} maxLength={500} />
        </div></details>
        <p className="text-xs text-content-muted">{t('Pays the oldest due balance first and adds the received amount to the cash book.')}</p>
      </>}
      </fieldset>
      {(error || financial.error) && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t(error || financial.error)}</p>}
    </form>
  </Modal>;
}

function ReversePayment({ customer, payment, onClose, onSave }) {
  const [reason,setReason] = useState(''); const [error,setError] = useState(''); const [saving,setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await api.post(payment.kind==='charge' ? `/credit/customers/${customer.id}/opening/${payment.id}/reverse` : `/credit/customers/${customer.id}/payments/${payment.id}/reverse`,{reason}); onSave(); onClose(); }
    catch(err) { setError(getErrorMessage(err)); } finally {setSaving(false);}
  };
  return <Modal open onClose={onClose} disableClose={saving} title={t(payment.kind==='charge' ? 'Reverse opening balance' : 'Reverse repayment')} description={t(payment.kind==='charge' ? 'Removes this opening debt. The original entry stays in the history.' : 'Restores the debt and removes this receipt from the cash book. The original payment stays in the history.')}
    submit={{form:'reverse-credit',label:t(payment.kind==='charge' ? 'Reverse opening balance' : 'Reverse repayment'),variant:'danger',loading:saving}}>
    <form id="reverse-credit" onSubmit={submit} className="space-y-3"><Textarea label={t('Reason for reversal')} required minLength={3} maxLength={300} value={reason} onChange={(e)=>setReason(e.target.value)} />
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t(error)}</p>}
    </form>
  </Modal>;
}

export default function Credit() {
  useAppLanguage();
  const { can } = useAuth(); const { currencySymbol, settings } = useSettings();
  const confirm = useConfirm();
  const [params,setParams] = useSearchParams(); const selected = params.get('customer');
  const [search,setSearch] = useState(''); const [filter,setFilter] = useState('all');
  const [form,setForm] = useState(null); const [saleOpen,setSaleOpen] = useState(false); const [reversing,setReversing] = useState(null);
  const [exporting,setExporting] = useState(false); const [saleError,setSaleError] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [statementRange, setStatementRange] = useState({ startDate: '', endDate: '' });
  const invalidStatementRange = statementRange.startDate && statementRange.endDate && statementRange.startDate > statementRange.endDate;
  const accounts = useApi((signal)=>api.get('/credit',{signal}).then(r=>r.data),[]);
  const detail = useApi((signal)=>api.get(`/credit/customers/${selected}`,{signal}).then(r=>r.data),[selected],{immediate:Boolean(selected)});
  const products = useApi((signal)=>api.get('/products',{signal}).then(r=>r.data),[],{immediate:saleOpen});
  const customers = accounts.data?.customers || [];
  const totals = customers.reduce((a,c)=>({balance:a.balance+c.balance,overdue:a.overdue+c.overdue,repaid:a.repaid+c.repaid}),{balance:0,overdue:0,repaid:0});
  const filtered = customers.filter(c=>(`${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())) && (filter==='archived' ? Boolean(c.archivedAt) : !c.archivedAt && (filter==='all' || (filter==='overdue' ? c.overdue>0 : c.balance===0))));
  const account = detail.data; const customer = account?.customer;
  const refresh = () => {window.dispatchEvent(new Event('rim:refresh'));};
  const select = (id) => {setParams(id ? {customer:id} : {});setStatementRange({startDate:'',endDate:''});};
  const toggleArchived = async () => {
    const archived = !customer.archivedAt;
    if (archived && !await confirm({ title: t('Archive customer?'), message: t('Sales and balances stay in the ledger. You can still collect payments and restore this customer later.'), confirmLabel: t('Archive customer'), tone: 'neutral' })) return;
    setArchiving(true);
    try { await api.post(`/credit/customers/${customer.id}/archive`, { archived }); refresh(); toast.success(t(archived ? 'Customer archived' : 'Customer restored')); }
    catch(error) { toast.error(getErrorMessage(error)); } finally { setArchiving(false); }
  };
  const salePrefill = useMemo(()=>({type:'stock_out',paymentType:'credit',customerId:selected || ''}),[selected]);
  const history = account ? [
    ...account.charges.map(c=>({...c,kind:'charge',date:c.occurredDate || c.occurredAt})),
    ...account.payments.map(p=>({...p,kind:'payment',date:`${day(p.paymentDate)}T00:00:00`,description:t(p.voidedAt ? 'Repayment reversed' : 'Repayment received')})),
  ].sort((a,b)=>day(b.date).localeCompare(day(a.date)) || new Date(b.createdAt || b.occurredAt)-new Date(a.createdAt || a.occurredAt)) : [];
  const copyReminder = async () => {
    const next = account.charges.find(c=>c.outstanding>0);
    const message = t('Hello {0}, your outstanding balance with {1} is {2}.{3} Please let us know when you can make a payment. Thank you.',
      [customer.name,settings?.businessName || t('our business'),formatMoney(account.balance,currencySymbol),next ? ` ${t('Payment due date')}: ${formatSafe(next.dueDate,'d MMM yyyy')}.` : '']);
    try { await navigator.clipboard.writeText(message);toast.success(t('Reminder copied. You can send it to your customer.')); }
    catch {toast.error(t('Could not copy the reminder. Please try again.'));}
  };
  const download = async () => {
    setExporting(true);
    try {const {generateCreditStatementPDF}=await import('../utils/pdfGenerator');await generateCreditStatementPDF(account,settings,statementRange);}
    catch {toast.error(t('Could not download the statement. Please try again.'));} finally {setExporting(false);}
  };
  return <div className={`credit-page space-y-5 ${selected ? 'credit-show-account' : ''}`}>
    <PageHeader className="credit-page-header" title={t('Customer credit')} description={t('Know who owes you, when it is due, and what has been paid back.')}
      actions={<Button icon={FiPlus} onClick={()=>setForm('customer')}>{t('Add customer')}</Button>} />
    {accounts.error ? <ErrorState message={accounts.error} onRetry={accounts.refetch} /> : accounts.loading && !accounts.data ? <SkeletonTable rows={5} columns={3} /> : <>
      <dl className="credit-overview" aria-label={t('Credit overview')}>
        <div><dt>{t('To collect')}</dt><dd>{formatMoney(totals.balance,currencySymbol)}</dd></div>
        <div data-overdue={totals.overdue>0}><dt>{t('Overdue')}</dt><dd>{formatMoney(totals.overdue,currencySymbol)}</dd></div>
        <div><dt>{t('Repaid')}</dt><dd>{formatMoney(totals.repaid,currencySymbol)}</dd></div>
      </dl>
      <p className="text-sm text-content-muted">{t('Totals include outstanding balances on archived customers.')}</p>
      {!customers.length ? <div className="credit-welcome"><div className="credit-welcome-mark"><FiUsers aria-hidden="true" /></div>
        <h2>{t('A clear account for every customer.')}</h2><p>{t('Start with the people you sell to on credit. Add what they already owe, record new sales, and keep every repayment in one place.')}</p>
        <Button icon={FiPlus} onClick={()=>setForm('customer')}>{t('Add your first customer')}</Button>
        <div className="credit-welcome-steps"><span>{t('Add a customer')}</span><FiChevronRight aria-hidden="true"/><span>{t('Record credit')}</span><FiChevronRight aria-hidden="true"/><span>{t('Collect payment')}</span></div>
      </div> : <div className={`credit-workspace ${selected ? 'credit-has-selection' : ''}`}>
        <aside className="credit-directory" aria-label={t('Credit customers')}>
          <div className="credit-directory-tools"><Input type="search" label={t('Find a customer')} value={search} onChange={e=>setSearch(e.target.value)} />
            <div className="credit-filters flex-wrap" aria-label={t('Filter customers')}>{[['all','Active'],['overdue','Overdue'],['settled','Settled'],['archived','Archived']].map(([value,label])=><button key={value} type="button" aria-pressed={filter===value} onClick={()=>setFilter(value)}>{t(label)}</button>)}</div>
          </div>
          {!filtered.length ? <p className="p-5 text-sm text-content-muted">{t('No customers match this view.')}</p> : <ul>{filtered.map(c=><li key={c.id}><button type="button" className="credit-person" aria-current={selected===c.id ? 'true' : undefined} onClick={()=>select(c.id)}>
            <span className="credit-avatar" aria-hidden="true">{initials(c.name)}</span><span className="credit-person-copy"><strong>{c.name}</strong><span>{c.overdue>0 ? t('Overdue') : c.balance===0 ? t('All settled') : t('Due {0}',[formatSafe(c.nextDueDate,'d MMM')])}</span></span>
            <span className="credit-person-amount">{formatMoney(c.balance,currencySymbol)}<FiChevronRight aria-hidden="true" /></span>
          </button></li>)}</ul>}
        </aside>
        <section className="credit-account" aria-label={t('Customer account')}>
          {!selected ? <EmptyState icon={FiUsers} title={t('Choose a customer')} description={t('Their balance, credit sales and repayments will appear here.')} />
          : detail.loading ? <SkeletonTable rows={4} columns={2}/> : detail.error ? <><Button variant="ghost" icon={FiArrowLeft} onClick={()=>select(null)}>{t('Back to customers')}</Button><ErrorState message={detail.error} onRetry={detail.refetch}/></> : customer && <>
            <div className="credit-account-header"><Button className="credit-back" variant="ghost" icon={FiArrowLeft} onClick={()=>select(null)}>{t('Customers')}</Button>
              <div className="credit-account-identity"><span className="credit-avatar credit-avatar-large" aria-hidden="true">{initials(customer.name)}</span><div><h2>{customer.name}</h2>{customer.phone ? <a href={`tel:${customer.phone.replace(/[^+\d]/g,'')}`}><FiPhone aria-hidden="true"/>{customer.phone}</a> : <p>{t('Customer account')}</p>}</div></div>
              <button type="button" className="credit-edit" onClick={()=>setForm('edit')}>{t('Edit customer')}</button>
              {can('credit.manage') && <Button variant="ghost" size="sm" loading={archiving} onClick={toggleArchived}>{t(customer.archivedAt ? 'Restore customer' : 'Archive customer')}</Button>}
              {customer.archivedAt && <p className="text-sm text-content-muted mt-3">{t('Archived customer. Payments and statements remain available. Restore to record a new credit sale.')}</p>}
              {customer.notes && <p className="credit-notes">{customer.notes}</p>}
              <div className="credit-account-balance"><span>{t('Outstanding balance')}</span><strong>{formatMoney(account.balance,currencySymbol)}</strong>{account.balance===0 && <span className="credit-settled"><FiCheck aria-hidden="true"/>{t('All settled')}</span>}</div>
              <div className="credit-account-actions"><Button icon={FiArrowUpRight} disabled={account.balance<=0} onClick={()=>setForm('payment')}>{t('Record repayment')}</Button><Button variant="secondary" icon={FiPlus} disabled={Boolean(customer.archivedAt)} onClick={()=>{setSaleError('');setSaleOpen(true);}}>{t('New credit sale')}</Button></div>
            </div>
            <details className="mx-4 sm:mx-7 mb-4"><summary className="min-h-[44px] flex items-center text-sm cursor-pointer text-content-muted">{t('Statement period')}</summary><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Input type="date" label={t('From')} value={statementRange.startDate} max={statementRange.endDate || undefined} onChange={e=>setStatementRange(r=>({...r,startDate:e.target.value}))}/><Input type="date" label={t('To')} value={statementRange.endDate} min={statementRange.startDate || undefined} onChange={e=>setStatementRange(r=>({...r,endDate:e.target.value}))}/></div>{invalidStatementRange && <p role="alert">{t('The start date must be on or before the end date.')}</p>}</details>
            <div className="credit-history-heading"><h3>{t('Account history')}</h3><div><Button variant="ghost" size="sm" icon={FiCopy} disabled={account.balance<=0} onClick={copyReminder}>{t('Copy reminder')}</Button><Button variant="ghost" size="sm" icon={FiDownload} loading={exporting} disabled={Boolean(invalidStatementRange)} onClick={download}>{t('Statement')}</Button></div></div>
            {!history.length ? <EmptyState title={t('Ready for the first sale')} description={t('Record a credit sale when this customer takes products to pay for later.')} /> : <ol className="credit-history">{history.map(entry=>{
              const payment = entry.kind==='payment'; const overdue = !payment && entry.outstanding>0 && day(entry.dueDate)<account.today;
              return <li key={`${entry.kind}-${entry.id}`} className={entry.voidedAt ? 'credit-entry-void' : ''}>
                <span className={`credit-entry-sign ${payment ? 'credit-entry-payment' : ''}`} aria-hidden="true">{payment ? <FiCheck/> : <FiArrowUpRight/>}</span>
                <div className="credit-entry-copy"><h4>{entry.voidedAt && !payment ? t(entry.chargeType==='sale' ? 'Credit sale reversed' : 'Opening balance reversed') : entry.chargeType==='sale' ? entry.description : payment ? entry.description : t(entry.description)}</h4><p>{formatSafe(entry.date,'d MMM yyyy')}{payment ? ` · ${t(METHODS[entry.method])}` : ` · ${t('Due {0}',[formatSafe(entry.dueDate,'d MMM yyyy')])}`}</p>
                  {entry.reference && <p>{t('Ref {0}',[entry.reference])}</p>}{entry.notes && <p>{entry.notes}</p>}
                  {payment && <p>{t('Recorded by {0}',[entry.recordedBy])}</p>}
                  {entry.voidedAt ? <p>{t('Reversal reason')}: {entry.voidReason}</p> : !payment && <span className={`credit-status ${overdue ? 'credit-status-overdue' : ''}`}>{entry.outstanding===0 ? t('Paid') : overdue ? t('Overdue') : entry.paid>0 ? t('Partly paid') : t('Unpaid')}</span>}
                </div><div className="credit-entry-amount"><strong>{payment ? '−' : '+'}{formatMoney(entry.amount,currencySymbol)}</strong>
                  {!payment && entry.paid>0 && entry.outstanding>0 && <span>{t('{0} left',[formatMoney(entry.outstanding,currencySymbol)])}</span>}
                  {payment && !entry.voidedAt && can('credit.reverse') && <button type="button" onClick={()=>setReversing(entry)} aria-label={t('Reverse payment of {0}',[formatMoney(entry.amount,currencySymbol)])}>{t('Reverse')}</button>}
                  {!payment && entry.chargeType==='opening' && !entry.voidedAt && can('credit.reverse') && <button type="button" onClick={()=>setReversing(entry)}>{t('Reverse opening balance')}</button>}
                </div>
              </li>;
            })}</ol>}
          </>}
        </section>
      </div>}
    </>}
    {form && <CreditForm key={`${form}-${selected}`} mode={form} customer={customer} balance={account?.balance || 0} onClose={()=>setForm(null)} onSave={(result)=>{if(form==='customer') {select(result.id);accounts.refetch();} else {refresh();toast.success(t(form==='edit' ? 'Customer updated' : 'Repayment recorded'));}}} />}
    {reversing && <ReversePayment customer={customer} payment={reversing} onClose={()=>setReversing(null)} onSave={()=>{refresh();toast.success(t('Repayment reversed'));}}/>}
    <TransactionFormModal open={saleOpen} onClose={()=>setSaleOpen(false)} products={products.data || []} productsLoading={products.loading} initialValues={salePrefill}
      onSubmit={async(values)=>{setSaleError('');try {await api.post('/transactions',values);setSaleOpen(false);refresh();toast.success(t('Credit sale recorded'));}catch(err){setSaleError(getErrorMessage(err));throw err;}}} serverError={saleError}/>
  </div>;
}
