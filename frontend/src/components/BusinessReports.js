import React, { useMemo, useState } from 'react';
import { FiDownload, FiFileText, FiRefreshCw } from 'react-icons/fi';
import api, { getErrorMessage } from '../services/api';
import useApi from '../hooks/useApi';
import useDebounce from '../hooks/useDebounce';
import usePageState from '../hooks/usePageState';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { translate as t, useAppLanguage } from '../context/LanguageContext';
import { formatMoney, formatQuantity } from '../utils/currency';
import { todayInput, daysAgoInput, formatSafe } from '../utils/date';
import { saveFile } from '../utils/download';
import { toast } from '../utils/toast';
import PageHeader from './PageHeader';
import Card from './ui/Card';
import Button from './ui/Button';
import { Input, Select } from './ui/Field';
import Pagination from './ui/Pagination';
import { EmptyState, InlineError } from './ui/States';
import { SkeletonTable } from './ui/Skeleton';

const money = (value, symbol) => formatMoney(value, symbol);
const cell = 'px-4 py-3 text-start align-top';
const numeric = 'px-4 py-3 text-end align-top tabular-nums whitespace-nowrap';
const csvCell = (value) => {
  let text = String(value ?? '');
  // Spreadsheet exports must not execute customer/product names as formulas.
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
const csvBlob = (rows) => new Blob(['\uFEFF', rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
const deliveryToast = (outcome) => {
  if (outcome === 'cancelled') return;
  if (outcome === 'insecure') return toast.error(t('Open the app over https to save files on iPhone'));
  toast.success(t(outcome === 'shared' ? 'Report ready — choose "Save to Files" to keep it' : outcome === 'opened' ? 'Report opened — use your browser’s share menu to save it' : 'Report downloaded'));
};

function Figures({ entries, symbol }) {
  return <dl className="grid grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-5 py-5 border-y border-hairline/[0.12]">
    {entries.map(([label, value, count]) => <div key={label} className="min-w-0"><dt className="text-sm text-content-muted">{t(label)}</dt><dd className="mt-1 text-xl font-semibold font-money text-content tabular-nums break-words">{count ? value : money(value, symbol)}</dd></div>)}
  </dl>;
}

export function SalesRegister() {
  useAppLanguage();
  const { settings, currencySymbol } = useSettings();
  const { user } = useAuth();
  const [range, setRange] = usePageState('reports.sales.range', { startDate: daysAgoInput(29), endDate: todayInput() });
  const [filters, setFilters] = useState({ customer: '', productId: '', paymentType: '', status: '' });
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState('');
  const customer = useDebounce(filters.customer, 300);
  const invalid = !range.startDate || !range.endDate || range.startDate > range.endDate;
  const params = useMemo(() => ({ ...range, ...filters, customer, page, limit: 50 }), [range, filters, customer, page]);
  const report = useApi(signal => api.get('/reports/sales-register', { params, signal }).then(r => r.data), [params], { immediate: !invalid, keepPreviousData: true });
  const change = (name, value) => { setFilters(current => ({ ...current, [name]: value })); setPage(1); };
  const changeRange = (value) => { setRange(value); setPage(1); };
  const exportReport = async (format) => {
    setExporting(format);
    try {
      const { data } = await api.get('/reports/sales-register', { params: { ...params, export: 'all' } });
      if (!data.complete || data.rows.length !== data.summary.count) throw new Error('The report is incomplete. Please retry the export.');
      let outcome;
      if (format === 'csv') {
        const rows = [['Sales register', `${data.filters.startDate} to ${data.filters.endDate}`], ['Payment balances', data.balanceBasis],
          ['Date', 'Reference', 'Customer', 'Product', 'SKU', 'Quantity', 'Unit', 'Rate', 'Sale total', 'Payment type', 'Received at sale', 'Later repayments', 'Received to date', 'Outstanding now', 'Gross profit', 'Status', 'Due date', 'Recorded by'],
          ...data.rows.map(r => [formatSafe(r.date, 'yyyy-MM-dd HH:mm'), r.reference, r.customer, r.productName, r.sku, r.quantity, r.unit, r.rate, r.total, r.paymentType, r.receivedAtSale, r.repayments, r.received, r.outstanding, r.grossProfit, r.status, r.dueDate, r.recordedBy]),
          ['Totals', '', '', '', '', '', '', '', data.summary.totalSales, '', data.summary.receivedAtSale, data.summary.repayments, data.summary.received, data.summary.outstanding, data.summary.grossProfit]];
        outcome = await saveFile(csvBlob(rows), `sales-${range.startDate}-to-${range.endDate}.csv`, { title: t('Sales register') });
      } else {
        const { generateSalesReportPDF } = await import('../utils/pdfGenerator');
        outcome = await generateSalesReportPDF(data, settings, { preparedBy: user?.name });
      }
      deliveryToast(outcome);
    } catch (error) { toast.error(getErrorMessage(error, 'Could not export the sales report.')); }
    finally { setExporting(''); }
  };
  const summary = report.data?.summary;
  return <div className="space-y-5">
    <PageHeader title={t('Sales register')} description={t('Every sale, with receipts, repayments and the amount still due.')} actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" icon={FiDownload} disabled={invalid || report.loading || Boolean(report.error) || !summary || Boolean(exporting)} onClick={() => exportReport('csv')}>{t('Export CSV')}</Button><Button icon={FiFileText} loading={exporting === 'pdf'} disabled={invalid || report.loading || Boolean(report.error) || !summary || Boolean(exporting)} onClick={() => exportReport('pdf')}>{t('Export sales PDF')}</Button></div>} />
    <Card className="p-4 sm:p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3"><Input label={t('From')} type="date" value={range.startDate} max={range.endDate} onChange={e => changeRange({ ...range, startDate: e.target.value })}/><Input label={t('To')} type="date" value={range.endDate} min={range.startDate} onChange={e => changeRange({ ...range, endDate: e.target.value })}/></div>
      <div className="flex flex-wrap gap-2">{[['Today', todayInput(), todayInput()], ['Yesterday', daysAgoInput(1), daysAgoInput(1)], ['This month', `${todayInput().slice(0,7)}-01`, todayInput()], ['30 days', daysAgoInput(29), todayInput()]].map(([label,startDate,endDate]) => <Button key={label} size="sm" variant="secondary" aria-pressed={range.startDate === startDate && range.endDate === endDate} onClick={() => changeRange({ startDate, endDate })}>{t(label)}</Button>)}</div>
      <details><summary className="min-h-[44px] flex items-center text-sm font-medium text-content-muted cursor-pointer">{t('Customer, product and payment filters')}{Object.values(filters).some(Boolean) ? ` (${t('Active')})` : ''}</summary><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-3">
        <Input label={t('Customer search')} value={filters.customer} maxLength={120} onChange={e => change('customer', e.target.value)}/>
        <Select label={t('Product')} value={filters.productId} onChange={e => change('productId', e.target.value)}><option value="">{t('All products')}</option>{report.data?.products?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select label={t('Sale type')} value={filters.paymentType} onChange={e => change('paymentType', e.target.value)}><option value="">{t('All sales')}</option><option value="cash">{t('Paid at sale')}</option><option value="credit">{t('Credit sales')}</option></Select>
        <Select label={t('Payment status')} value={filters.status} onChange={e => change('status', e.target.value)}><option value="">{t('All statuses')}</option><option value="paid">{t('Paid')}</option><option value="partial">{t('Partly paid')}</option><option value="unpaid">{t('Unpaid')}</option></Select>
      </div></details>
      {invalid && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t('Choose a valid start and end date.')}</p>}
    </Card>
    {report.error ? <InlineError message={report.error} onRetry={report.refetch}/> : report.loading ? <SkeletonTable rows={6} columns={6}/> : !invalid && summary && <>
      <Figures symbol={currencySymbol} entries={ [['Sales total', summary.totalSales], ['Received to date', summary.received], ['Outstanding now', summary.outstanding], ['Gross profit', summary.grossProfit]] }/>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-content-muted">{t('{0} sales. Exports include every matching sale.', [summary.count])}<br/>{t('Payment balances include later repayments. Gross profit excludes operating expenses.')}</p><Button variant="ghost" icon={FiRefreshCw} onClick={report.refetch}>{t('Refresh')}</Button></div>
      {!report.data.rows.length ? <EmptyState icon={FiFileText} title={t('No sales match these filters')} description={t('Choose another period or clear the filters.')}/> : <Card className="overflow-hidden"><div className="scroll-x"><table className="min-w-full text-sm"><caption className="sr-only">{t('Sales register')}</caption><thead className="bg-surface-sunken"><tr>{['Date / reference','Customer / product','Quantity / rate','Sale total','Received to date','Outstanding now','Status'].map((label,i) => <th key={label} scope="col" className={i > 1 && i < 6 ? numeric : cell}>{t(label)}</th>)}</tr></thead><tbody className="divide-y divide-hairline">{report.data.rows.map(row => <tr key={row.id}><td className={cell}><span className="whitespace-nowrap">{formatSafe(row.date,'dd MMM yyyy')}</span><div className="text-xs text-content-muted">{row.reference || row.id.slice(-8).toUpperCase()}</div></td><td className={cell}><div className="font-medium">{row.customer || t('Walk-in customer')}</div><div className="text-content-muted">{row.productName}</div></td><td className={numeric}>{formatQuantity(row.quantity,row.unit)}<div className="text-xs text-content-muted">{money(row.rate,currencySymbol)}</div></td><td className={numeric}>{money(row.total,currencySymbol)}</td><td className={numeric}>{money(row.received,currencySymbol)}</td><td className={numeric}>{money(row.outstanding,currencySymbol)}</td><td className={cell}>{t(row.status === 'paid' ? 'Paid' : row.status === 'partial' ? 'Partly paid' : 'Unpaid')}{row.dueDate && <div className="text-xs text-content-muted whitespace-nowrap">{t('Due')} {row.dueDate}</div>}</td></tr>)}</tbody></table></div><Pagination {...report.data.pagination} onChange={setPage}/></Card>}
    </>}
  </div>;
}

export function DailyClosing() {
  useAppLanguage();
  const { settings, currencySymbol } = useSettings(); const { user } = useAuth();
  const [date,setDate] = usePageState('reports.closing.date', todayInput());
  const [exporting,setExporting] = useState(false);
  const report = useApi(signal => api.get('/reports/daily-closing',{params:{date},signal}).then(r=>r.data),[date],{immediate:Boolean(date)});
  const data = report.data;
  const exportReport = async () => {
    setExporting(true);
    try { const fresh = (await api.get('/reports/daily-closing',{params:{date}})).data; const {generateDailyClosingPDF}=await import('../utils/pdfGenerator'); deliveryToast(await generateDailyClosingPDF(fresh,settings,{preparedBy:user?.name})); }
    catch(error){toast.error(getErrorMessage(error,'Could not export the daily closing.'));} finally{setExporting(false);}
  };
  return <div className="space-y-5"><PageHeader title={t('Daily closing')} description={t('Reconcile the day’s sales and money movements.')} actions={<Button icon={FiFileText} loading={exporting} disabled={!date || report.loading || Boolean(report.error) || !data} onClick={exportReport}>{t('Export closing PDF')}</Button>}/>
    <div className="flex flex-wrap items-end gap-3"><div className="w-full sm:w-64"><Input label={t('Closing date')} type="date" value={date} max={todayInput()} onChange={e=>setDate(e.target.value)}/></div><Button variant="secondary" onClick={()=>setDate(todayInput())}>{t('Today')}</Button><Button variant="secondary" onClick={()=>setDate(daysAgoInput(1))}>{t('Yesterday')}</Button><Button variant="ghost" icon={FiRefreshCw} disabled={!date} onClick={report.refetch}>{t('Refresh')}</Button></div>
    {report.error ? <InlineError message={report.error} onRetry={report.refetch}/> : report.loading ? <SkeletonTable rows={6} columns={4}/> : data && <>
      <Figures symbol={currencySymbol} entries={ [['Opening money balance',data.openingBalance],['Money in',data.moneyIn],['Money out',data.moneyOut],['Closing money balance',data.closingBalance]] }/>
      <p className="text-sm text-content-muted">{t('Opening balance + money in − money out = closing balance. Combined funds are not counted physical cash.')}</p>
      <section aria-labelledby="closing-sales"><h2 id="closing-sales" className="text-lg font-semibold">{t('Sales and collections')}</h2><dl className="mt-3 divide-y divide-hairline">{[['Sales total',data.sales.total],['Paid-at-sale sales',data.sales.cashSales],['Credit sales',data.sales.creditSales],['Deposits on credit sales',data.sales.deposits],['Collections against earlier debt',data.collectionsFromEarlierDebt],['Gross profit',data.sales.grossProfit]].map(([label,value])=><div key={label} className="flex justify-between gap-4 py-3"><dt className="text-content-muted">{t(label)}</dt><dd className="tabular-nums font-medium">{money(value,currencySymbol)}</dd></div>)}</dl><p className="mt-3 text-sm text-content-muted">{t('Collections settle existing debt; they are not new sales. Gross profit excludes operating expenses.')}</p></section>
      <section aria-labelledby="closing-methods"><h2 id="closing-methods" className="text-lg font-semibold mb-3">{t('Balances by payment method')}</h2><Card className="overflow-hidden"><div className="scroll-x"><table className="min-w-full text-sm"><thead className="bg-surface-sunken"><tr>{['Payment method','Opening','Money in','Money out','Closing'].map((label,i)=><th scope="col" key={label} className={i?numeric:cell}>{t(label)}</th>)}</tr></thead><tbody className="divide-y divide-hairline">{data.methods.map(row=><tr key={row.method}><th scope="row" className={`${cell} font-medium`}>{t(row.method === 'unclassified' ? 'Unclassified / legacy' : row.method)}</th>{['openingBalance','moneyIn','moneyOut','closingBalance'].map(key=><td className={numeric} key={key}>{money(row[key],currencySymbol)}</td>)}</tr>)}</tbody></table>{!data.methods.length && <p className="p-4 text-content-muted">{t('No money recorded yet.')}</p>}</div></Card><p className="mt-3 text-sm text-content-muted">{t('Unclassified entries have no recorded payment method. Check these separately before counting cash.')}</p></section>
      <section aria-labelledby="closing-movements"><h2 id="closing-movements" className="text-lg font-semibold mb-3">{t('Money movements by category')}</h2><dl className="divide-y divide-hairline">{data.categories.map(row=><div key={`${row.direction}-${row.source}-${row.category}`} className="flex justify-between gap-4 py-3"><dt><span className="font-medium">{t(row.category)}</span><span className="text-content-muted text-sm"> · {t(row.direction==='in'?'Money in':'Money out')} · {row.count}</span></dt><dd className="font-medium tabular-nums">{money(row.amount,currencySymbol)}</dd></div>)}</dl>{!data.categories.length && <p className="text-content-muted">{t('No money moved on this date.')}</p>}<p className="mt-3 text-sm text-content-muted">{t('Money out includes purchases, supplier payments and withdrawals, not only expenses.')}</p></section>
    </>}</div>;
}
