import React, { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowDownLeft, FiArrowUpRight, FiPackage, FiTruck } from 'react-icons/fi';
import api, { getErrorMessage } from '../services/api';
import useApi from '../hooks/useApi';
import { readPendingLedger } from '../hooks/useLedgerSubmission';
import { useAuth } from '../context/AuthContext';
import { translate, useAppLanguage } from '../context/LanguageContext';
import Button from './ui/Button';
import Modal from './ui/Modal';
import './InventoryActions.css';

const TransactionForm = lazy(() => import('./transactions/TransactionFormModal'));
const CashForm = lazy(() => import('./cash/CashEntryModal'));
const CustomerForm = lazy(() => import('../pages/Credit').then((m) => ({ default: m.CreditForm })));
const SupplierForm = lazy(() => import('../pages/Suppliers').then((m) => ({ default: m.SupplierForm })));
const PurchaseForm = lazy(() => import('../pages/Suppliers').then((m) => ({ default: m.PurchaseForm })));
const INITIAL = { sale: { type: 'stock_out' }, delivery: { type: 'stock_in' } };

export default function DailyWork({ customers, suppliers }) {
  useAppLanguage();
  const { can, user, businessId } = useAuth();
  const pending = (kind) => readPendingLedger(kind, user?.id || user?._id, businessId);
  const [task, setTask] = useState(null);
  const [accountId, setAccountId] = useState('');
  const [newAccount, setNewAccount] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const products = useApi((signal) => api.get('/products', { signal, params: { sort: 'name' } }).then((r) => r.data), [], { immediate: Boolean(INITIAL[task]) });
  const cashMeta = useApi((signal) => api.get('/cash-book/meta', { signal }).then((r) => r.data), [], { immediate: task === 'in' || task === 'out' });
  const start = (next) => { setAccountId(''); setNewAccount(null); setError(''); setNotice(''); setTask(next); };
  // A departing dialog can finish its close event after the next form opens.
  const close = () => setTask((current) => current === task ? null : current);
  const saved = (message) => { setTask(null); setNotice(message); window.dispatchEvent(new Event('rim:refresh')); };
  const isCustomer = task === 'collect';
  const accounts = isCustomer ? customers : suppliers;
  const list = (isCustomer ? customers.data?.customers : suppliers.data?.suppliers) || [];
  const accountKind = task === 'collect' ? 'customer-payment' : task === 'receive' ? 'supplier-purchase' : 'supplier-payment';
  const available = list.filter((item) => pending(`${accountKind}.${item.id}`) || (!item.archivedAt && (task === 'receive' || Number(item.balance) > 0)));
  if (newAccount && !available.some((item) => item.id === newAccount.id)) available.push(newAccount);
  const selected = available.find((item) => item.id === accountId) || available.find((item) => pending(`${accountKind}.${item.id}`)) || null;
  const choose = (event) => setAccountId(event.target.value);
  const actions = [
    can('transactions.create') && { id: 'sale', title: 'Record sale', description: 'Stock, payment and customer dues together', tone: 'out', icon: FiArrowUpRight },
    can('transactions.create') && { id: can('suppliers.manage') ? 'receive' : 'delivery', title: 'Add delivery', description: can('suppliers.manage') ? 'Stock, supplier bill and payment together' : 'Add received rice to stock', tone: 'in', icon: FiTruck },
    can('credit.manage') && { id: 'collect', title: 'Collect customer payment', description: 'Reduce their dues and record money received', tone: 'stock', icon: FiArrowDownLeft },
    can('suppliers.manage') && { id: 'pay', title: 'Pay supplier', description: 'Reduce your dues and record money paid', tone: 'stock', icon: FiArrowUpRight },
  ].filter(Boolean);
  const accountTask = ['collect', 'receive', 'pay'].includes(task);
  const saveTransaction = async (values) => {
    setError('');
    try {
      await api.post('/transactions', values);
      saved(values.type === 'stock_in' ? 'Stock added. No supplier bill or payment was recorded.' : values.paymentType === 'credit' ? 'Sale recorded. Stock, money received and customer dues are updated.' : 'Sale recorded. Stock and cash are updated. Do not enter this sale again in Money in.');
    } catch (err) { setError(getErrorMessage(err)); throw err; }
  };
  return <section className="inventory-actions" aria-label={translate('Daily work')}>
    <div className="inventory-actions-heading"><h2><span className="sm:hidden">{translate('Daily work')}</span><span className="hidden sm:inline">{translate('What do you want to record?')}</span></h2><Link to="/products" className="inventory-action-stock"><FiPackage aria-hidden="true" />{translate('View stock')}</Link></div>
    <p className="daily-work-intro text-sm text-content-muted mb-4">{translate('Start here. Save once; the connected records update together. No scanner needed.')}</p>
    {notice && <p role="status" className="rounded-xl border border-primary-500/25 bg-surface-sunken p-4 mb-4 text-sm">{translate(notice)}</p>}
    {!task && (pending('transaction') || pending('cash')) && <div role="status" className="rounded-xl border border-hairline/15 p-3 mb-4 text-sm"><p>{translate('A previous save needs confirmation. Confirm it before entering the same work again.')}</p><Button variant="secondary" className="mt-2" onClick={() => start(pending('transaction') ? 'sale' : 'out')}>{translate('Confirm previous save')}</Button></div>}
    <div className="daily-action-grid">{actions.map(({ id, title, description, tone, icon: Icon }) => <button key={id} type="button" aria-label={translate(title)} aria-describedby={`daily-${id}-help`} className={`inventory-action inventory-action-${tone}`} onClick={() => start(id)}><Icon className="inventory-action-icon mb-3" aria-hidden="true" /><strong>{translate(title)}</strong><p id={`daily-${id}-help`}>{translate(description)}</p></button>)}</div>
    {can('cash.manage') && <div className="mt-4 space-y-2"><p className="text-sm text-content-muted">{translate('Other income or expenses? Use these only for money not already recorded above.')}</p><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => start('in')}>{translate('Money in')}</Button><Button variant="secondary" onClick={() => start('out')}>{translate('Money out')}</Button></div></div>}
    <Suspense fallback={<p role="status" className="mt-3">{translate('Opening form...')}</p>}>
      {INITIAL[task] && <TransactionForm open onClose={close} onSubmit={saveTransaction} intent={task} initialValues={INITIAL[task]} products={products.data || []} productsLoading={products.loading} serverError={error || products.error || ''} />}
      {(task === 'in' || task === 'out') && <CashForm open onClose={close} defaultDirection={task} meta={cashMeta.data} onSubmit={async (values) => { await api.post('/cash-book', values); saved('Cash entry recorded.'); }} />}
      {accountTask && (accounts.error || accounts.loading || !available.length) && <Modal open onClose={close} title={translate(isCustomer ? 'Collect customer payment' : task === 'receive' ? 'Add delivery' : 'Pay supplier')}>
        {accounts.error ? <div role="alert"><p>{translate(accounts.error)}</p><Button className="mt-3" onClick={() => accounts.refetch()}>{translate('Try again')}</Button></div> : accounts.loading ? <p role="status">{translate('Loading accounts...')}</p> : <div className="space-y-3"><p>{translate(task === 'receive' ? 'Add the supplier once, then receive this delivery and record its payment here.' : 'No outstanding payments for these accounts.')}</p>{task === 'receive' && <Button onClick={() => setTask('addSupplier')}>{translate('Add supplier')}</Button>}<Link className="block underline py-2" to={isCustomer ? '/credit' : '/suppliers'}>{translate('View accounts')}</Link></div>}
      </Modal>}
      {task === 'collect' && !accounts.loading && !accounts.error && available.length > 0 && <CustomerForm key={accountId} mode="payment" customer={selected} customers={available} onCustomerChange={choose} balance={Number(selected?.balance || 0)} onClose={close} onSave={() => saved('Customer payment recorded. Their dues and your cash book are updated.')} />}
      {task === 'pay' && !accounts.loading && !accounts.error && available.length > 0 && <SupplierForm key={accountId} mode="payment" supplier={selected} suppliers={available} onSupplierChange={choose} balance={Number(selected?.balance || 0)} onClose={close} onSave={() => saved('Supplier payment recorded. Your dues and cash book are updated.')} />}
      {task === 'receive' && !accounts.loading && !accounts.error && available.length > 0 && <PurchaseForm key={accountId} supplier={selected} suppliers={available} onSupplierChange={choose} onClose={close} onSave={() => saved('Delivery recorded. Stock, supplier bill and money paid are updated. Do not enter this delivery again.')} />}
      {task === 'addSupplier' && <SupplierForm mode="add" onClose={() => setTask((current) => current === 'addSupplier' ? null : current)} onSave={(result) => { const account = result.supplier || result; setNewAccount(account); setAccountId(account.id); suppliers.refetch(); setTask('receive'); }} />}
    </Suspense>
  </section>;
}
