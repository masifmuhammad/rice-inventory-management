import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiAlertTriangle, FiArrowRight } from 'react-icons/fi';
import { useSettings } from '../../context/SettingsContext';
import { formatMoney, formatQuantity } from '../../utils/currency';
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery';
import { springUI, reducedTransition } from '../../utils/motion';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Field';
import api from '../../services/api';
import useApi from '../../hooks/useApi';
import useLedgerSubmission from '../../hooks/useLedgerSubmission';
import { useAuth } from '../../context/AuthContext';
import { translate, useAppLanguage } from '../../context/LanguageContext';

const TYPES = [
  { value: 'stock_in', label: 'Delivery · stock in' },
  { value: 'stock_out', label: 'Sale · stock out' },
  { value: 'adjustment', label: 'Stock adjustment' },
];
const InlineCustomer = lazy(() => import('../../pages/Credit').then((m) => ({ default: m.CreditForm })));

const EMPTY = {
  type: 'stock_in',
  product: '',
  quantity: '',
  price: '',
  reference: '',
  supplier: '',
  customer: '',
  notes: '',
  paymentType: 'cash',
  customerId: '',
  amountReceived: '',
  dueDate: '',
};

export default function TransactionFormModal({
  open,
  onClose,
  onSubmit,
  products = [],
  productsLoading = false,
  initialValues = null,
  editing = false,
  serverError = '',
  intent,
}) {
  useAppLanguage();
  const { currencySymbol } = useSettings();
  const { can } = useAuth();
  const customers = useApi((signal) => api.get('/credit', { signal }).then(r => r.data.customers), [], { immediate: open && can('credit.view') });
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [addingCustomer, setAddingCustomer] = useState(false);
  const formRef = useRef(null);
  const submission = useLedgerSubmission('transaction', onSubmit);
  const { saving } = submission;
  const recovery = !editing && submission.pending;
  const [priceTouched, setPriceTouched] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const revealTransition = reducedMotion ? reducedTransition : springUI;

  useEffect(() => {
    if (open) {
      setValues(
        recovery?.draft ? recovery.draft : initialValues
          ? {
              ...EMPTY,
              type: initialValues.type || 'stock_in',
              product: initialValues.product || '',
              quantity: initialValues.quantity != null ? String(initialValues.quantity) : '',
              price: initialValues.price != null ? String(initialValues.price) : '',
              reference: initialValues.reference || '',
              supplier: initialValues.supplier || '',
              customer: initialValues.customer || '',
              notes: initialValues.notes || '',
              paymentType: initialValues.paymentType || 'cash',
              customerId: initialValues.customerId || '',
              amountReceived: initialValues.amountReceived ?? '',
              dueDate: initialValues.dueDate ? String(initialValues.dueDate).slice(0,10) : '',
            }
          : EMPTY
      );
      setErrors({});
      setAddingCustomer(false);
      submission.clearError();
      setPriceTouched(Boolean(recovery) || Boolean(initialValues?.price));
    }
  // Restore only when opening; a failed save must keep the user's current draft.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialValues]);

  const product = useMemo(
    () => products.find((p) => p._id === values.product) || null,
    [products, values.product]
  );

  // Stock in is bought at cost, stock out is sold at the selling price. Prefill
  // the right one, but stop overwriting once the user has typed their own.
  useEffect(() => {
    if (!product || priceTouched) return;
    const suggested = values.type === 'stock_out' ? product.sellingPrice : product.costPrice;
    setValues((current) => ({ ...current, price: suggested ?? '' }));
  }, [product, values.type, priceTouched]);

  const set = (field) => (event) => {
    const value = event.target.value;
    if (field === 'price') setPriceTouched(true);
    if (field === 'product') setPriceTouched(false);
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const quantity = Number(values.quantity);
  const price = Number(values.price);

  const preview = useMemo(() => {
    if (!product || !Number.isFinite(quantity)) return null;

    const before = product.currentStock;
    const after =
      values.type === 'stock_in'
        ? before + quantity
        : values.type === 'stock_out'
        ? before - quantity
        : quantity;

    return {
      before,
      after,
      unit: product.unit,
      insufficient: values.type === 'stock_out' && quantity > before,
      total: Number.isFinite(price) && quantity > 0 ? price * quantity : 0,
    };
  }, [product, quantity, price, values.type]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (recovery) { await submission.save(null, null); return; }

    const nextErrors = {};
    if (!values.product) nextErrors.product = 'Choose a product';

    if (values.quantity === '' || Number.isNaN(quantity) || quantity < 0) {
      nextErrors.quantity = 'Enter a quantity';
    } else if (values.type !== 'adjustment' && quantity <= 0) {
      nextErrors.quantity = 'Quantity must be more than 0';
    }

    // Caught here as well as on the server so the user finds out before submitting.
    if (preview?.insufficient) {
      nextErrors.quantity = `Only ${formatQuantity(preview.before, preview.unit)} in stock`;
    }
    if (values.price !== '' && (!Number.isFinite(price) || price < 0)) nextErrors.price = 'Enter a price of 0 or more';
    if (values.type === 'stock_out' && values.paymentType === 'credit') {
      if (!values.customerId) nextErrors.customerId = 'Choose a credit customer';
      if (!values.dueDate) nextErrors.dueDate = 'Choose a payment due date';
      if (!(preview?.total > 0) || Number(values.amountReceived || 0) >= preview.total || Number(values.amountReceived || 0) < 0) nextErrors.amountReceived = 'Enter less than the sale total; use cash for full payment';
    }

    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }

    await submission.save({
        ...values,
        quantity,
        price: values.price === '' ? undefined : price,
        paymentType: values.type === 'stock_out' ? values.paymentType : 'cash',
        amountReceived: values.paymentType === 'credit' ? Number(values.amountReceived || 0) : undefined,
      }, values, !editing);
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      disableClose={saving}
      busy={saving}
      title={translate(recovery ? 'Confirm previous save' : editing ? 'Correct transaction' : intent === 'sale' ? 'Record sale' : intent === 'delivery' ? 'Add delivery' : 'New transaction')}
      description={
        translate(editing
          ? 'Stock and the cash book are corrected to match.'
          : 'Stock moves and the ledger updates together.')
      }
      size="md"
      submit={{ form: 'transaction-form', label: recovery && !saving ? 'Confirm previous save' : editing ? 'Save correction' : 'Record transaction', loading: saving }}
    >
      <form ref={formRef} id="transaction-form" onSubmit={handleSubmit} className="space-y-2.5" noValidate>
        {recovery && !saving && <p role="status" className="rounded-xl border border-hairline/15 p-3 text-sm">{translate('The previous save may already be recorded. Confirm it before making another entry. Stock and money will not be recorded twice.')}</p>}
        <fieldset disabled={Boolean(recovery)} className="space-y-2.5 min-w-0">
        {(!intent || recovery) && <>
        <Select label={translate("Type")} required value={values.type} onChange={set('type')}>
          {TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {translate(option.label)}
            </option>
          ))}
        </Select>
        </>}

        <Select
          label={translate("Product")}
          required
          value={values.product}
          onChange={set('product')}
          error={errors.product}
          // Pointing an existing movement at a different product is not a
          // correction — it would leave the original product's stock wrong.
          disabled={productsLoading || editing}
          hint={
            translate(editing
              ? 'To change the product, reverse this and record a new one'
              : productsLoading
                ? 'Loading products…'
                : undefined)
          }
        >
          <option value="">{translate(productsLoading ? 'Loading products…' : 'Select a product…')}</option>
          {!productsLoading &&
            products.map((option) => (
              <option key={option._id} value={option._id}>
                {translate(option.name)} — {translate(option.currentStock)} {translate(option.unit)}{translate(" in stock")}</option>
            ))}
        </Select>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Input
            label={translate(values.type === 'adjustment' ? 'Corrected stock level' : 'Quantity')}
            required
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            value={values.quantity}
            onChange={set('quantity')}
            error={errors.quantity}
            placeholder="0"
            hint={translate(product ? `In ${product.unit}` : undefined)}
          />
          <Input
            label={translate("Price per unit")}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            prefix={currencySymbol}
            value={values.price}
            onChange={set('price')}
            error={errors.price}
            placeholder="0.00"
            hint={translate("Prefilled from the product")}
          />
        </div>

        {/* Shows the consequence before it happens, so a typo is caught here
            rather than discovered in next month's stock count. Only the container
            animates — the figures inside must keep updating instantly as you type. */}
        <AnimatePresence initial={false}>
          {preview && values.quantity !== '' && (
            <motion.div
              key="stock-preview"
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -4 }}
              transition={revealTransition}
              className="overflow-hidden"
            >
              <div
                className={`rounded-lg border px-4 py-3 ${
                  preview.insufficient
                    ? 'border-red-500/20 bg-red-500/10'
                    : 'border-hairline/[0.07] bg-surface-sunken'
                }`}
              >
                {preview.insufficient ? (
                  <p className="flex items-center gap-2 text-sm text-red-500">
                    <FiAlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />{translate("Not enough stock — only ")}{translate(formatQuantity(preview.before, preview.unit))}{translate(" available.")}</p>
                ) : (
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="flex items-center gap-2 text-content-muted tabular-nums">
                      {translate(formatQuantity(preview.before, preview.unit))}
                      <FiArrowRight className="w-4 h-4 text-content-subtle" aria-hidden="true" />
                      <span className="font-semibold text-content">
                        {translate(formatQuantity(preview.after, preview.unit))}
                      </span>
                    </span>
                    {preview.total > 0 && (
                      <span className="font-money font-bold text-content tabular-nums whitespace-nowrap">
                        {translate(formatMoney(preview.total, currencySymbol))}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {values.type === 'stock_in' && (
          <Input label={translate("Supplier")} value={values.supplier} onChange={set('supplier')} placeholder={translate("Who you bought from")} />
        )}

        {values.type === 'stock_out' && can('credit.manage') && !editing && <>
          <fieldset className="flex gap-2 py-2"><legend className="text-sm text-content-muted mb-2">{translate('Payment')}</legend>
            {[['cash','Paid in full'],['credit','Pay later · credit']].map(([value,label]) => <label key={value} className={`flex-1 flex items-center gap-2 rounded-xl px-3 py-3 text-sm cursor-pointer border ${values.paymentType===value ? 'border-content bg-surface-sunken' : 'border-hairline/10'}`}>
              <input type="radio" name="sale-payment" value={value} checked={values.paymentType===value} onChange={set('paymentType')} />{translate(label)}
            </label>)}
          </fieldset>
          {values.paymentType === 'credit' && <div className="space-y-3">
            <Select label={translate('Credit customer')} required value={values.customerId} onChange={set('customerId')} error={errors.customerId} disabled={customers.loading}>
              <option value="">{translate(customers.loading ? 'Loading customers…' : 'Choose a customer')}</option>
              {(customers.data || []).filter(c => !c.archivedAt).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            {customers.error && <p role="alert" className="text-sm text-red-600">{translate(customers.error)} <button type="button" className="underline" onClick={()=>customers.refetch()}>{translate('Try again')}</button></p>}
            <Button variant="ghost" onClick={() => setAddingCustomer(true)}>{translate('Add customer')}</Button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Input label={translate('Received now')} type="number" min="0" step="0.01" inputMode="decimal" prefix={currencySymbol} value={values.amountReceived} onChange={set('amountReceived')} error={errors.amountReceived}/>
              <Input label={translate('Payment due date')} required type="date" value={values.dueDate} onChange={set('dueDate')} error={errors.dueDate}/></div>
            {preview?.total>0 && <p className="text-sm text-content-muted">{translate('Left to collect: {0}',[formatMoney(Math.max(0,preview.total-Number(values.amountReceived || 0)),currencySymbol)])}</p>}
          </div>}
        </>}
        {values.type === 'stock_out' && values.paymentType !== 'credit' && (
          <Input label={translate("Customer")} value={values.customer} onChange={set('customer')} placeholder={translate("Who you sold to")} />
        )}

        <details className="group rounded-xl border border-hairline/[0.08] px-3.5">
          <summary className="min-h-[44px] flex items-center text-sm font-medium text-content-muted cursor-pointer">{translate("Reference & notes ")}<span className="ml-auto text-lg group-open:rotate-45 transition-transform" aria-hidden="true">+</span></summary>
          <div className="space-y-2.5 pb-3.5">
        <Input
          label={translate("Reference")}
          value={values.reference}
          onChange={set('reference')}
          placeholder={translate("Invoice or delivery note number")}
        />

        <Textarea label={translate("Notes")} value={values.notes} onChange={set('notes')} placeholder={translate("Anything worth remembering…")} />
          </div>
        </details>

        </fieldset>
        {(submission.error || serverError) && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{translate(submission.error || serverError)}</p>}
        {values.type === 'stock_out' && (
          <p className="text-xs text-content-subtle">{translate(values.paymentType === 'credit' ? 'Only the amount received now enters the cash book. The rest stays on this customer’s account.' : 'Sales with a price are posted to the cash book automatically.')}</p>
        )}
      </form>
      {addingCustomer && <Suspense fallback={<p role="status">{translate('Opening form...')}</p>}><InlineCustomer mode="customer" onClose={() => setAddingCustomer(false)} onSave={(result) => {
        const customer = result.customer || result;
        customers.setData((current) => [...(current || []), customer]);
        setValues((current) => ({ ...current, customerId: customer.id }));
        setAddingCustomer(false);
        customers.refetch();
      }} /></Suspense>}
    </Modal>
  );
}
