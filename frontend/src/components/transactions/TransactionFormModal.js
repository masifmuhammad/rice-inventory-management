import React, { useEffect, useMemo, useState } from 'react';
import { FiAlertTriangle, FiArrowRight } from 'react-icons/fi';
import { useSettings } from '../../context/SettingsContext';
import { formatMoney, formatQuantity } from '../../utils/currency';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Field';

const TYPES = [
  { value: 'stock_in', label: 'Stock in — purchase or delivery received' },
  { value: 'stock_out', label: 'Stock out — sale or issue' },
  { value: 'adjustment', label: 'Adjustment — correct the recorded level' },
];

const EMPTY = {
  type: 'stock_in',
  product: '',
  quantity: '',
  price: '',
  reference: '',
  supplier: '',
  customer: '',
  notes: '',
};

export default function TransactionFormModal({ open, onClose, onSubmit, products = [], productsLoading = false }) {
  const { currencySymbol } = useSettings();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [priceTouched, setPriceTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(EMPTY);
      setErrors({});
      setPriceTouched(false);
      setSaving(false);
    }
  }, [open]);

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

    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSaving(true);
    try {
      await onSubmit({
        ...values,
        quantity,
        price: values.price === '' ? undefined : price,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      disableClose={saving}
      busy={saving}
      title="New transaction"
      description="Stock moves and the ledger updates together."
      size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="transaction-form" loading={saving}>
            Record transaction
          </Button>
        </div>
      }
    >
      <form id="transaction-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Select label="Type" required value={values.type} onChange={set('type')}>
          {TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          label="Product"
          required
          value={values.product}
          onChange={set('product')}
          error={errors.product}
          disabled={productsLoading}
          hint={productsLoading ? 'Loading products…' : undefined}
        >
          <option value="">{productsLoading ? 'Loading products…' : 'Select a product…'}</option>
          {!productsLoading &&
            products.map((option) => (
              <option key={option._id} value={option._id}>
                {option.name} — {option.currentStock} {option.unit} in stock
              </option>
            ))}
        </Select>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={values.type === 'adjustment' ? 'Corrected stock level' : 'Quantity'}
            required
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={values.quantity}
            onChange={set('quantity')}
            error={errors.quantity}
            placeholder="0"
            hint={product ? `In ${product.unit}` : undefined}
          />
          <Input
            label="Price per unit"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            prefix={currencySymbol}
            value={values.price}
            onChange={set('price')}
            placeholder="0.00"
            hint="Prefilled from the product"
          />
        </div>

        {/* Shows the consequence before it happens, so a typo is caught here
            rather than discovered in next month's stock count. */}
        {preview && values.quantity !== '' && (
          <div
            className={`rounded-lg border px-4 py-3 ${
              preview.insufficient
                ? 'border-red-500/20 bg-red-500/10'
                : 'border-hairline/[0.07] bg-surface-sunken'
            }`}
          >
            {preview.insufficient ? (
              <p className="flex items-center gap-2 text-sm text-red-500">
                <FiAlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                Not enough stock — only {formatQuantity(preview.before, preview.unit)} available.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="flex items-center gap-2 text-content-muted tabular-nums">
                  {formatQuantity(preview.before, preview.unit)}
                  <FiArrowRight className="w-4 h-4 text-content-subtle" aria-hidden="true" />
                  <span className="font-semibold text-content">
                    {formatQuantity(preview.after, preview.unit)}
                  </span>
                </span>
                {preview.total > 0 && (
                  <span className="font-semibold text-content tabular-nums whitespace-nowrap">
                    {formatMoney(preview.total, currencySymbol)}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {values.type === 'stock_in' && (
          <Input label="Supplier" value={values.supplier} onChange={set('supplier')} placeholder="Who you bought from" />
        )}

        {values.type === 'stock_out' && (
          <Input label="Customer" value={values.customer} onChange={set('customer')} placeholder="Who you sold to" />
        )}

        <Input
          label="Reference"
          value={values.reference}
          onChange={set('reference')}
          placeholder="Invoice or delivery note number"
        />

        <Textarea label="Notes" value={values.notes} onChange={set('notes')} placeholder="Anything worth remembering…" />

        {values.type === 'stock_out' && (
          <p className="text-xs text-content-subtle">
            Sales with a price are posted to the cash book automatically.
          </p>
        )}
      </form>
    </Modal>
  );
}
