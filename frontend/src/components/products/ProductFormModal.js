import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSettings } from '../../context/SettingsContext';
import { formatMoney, marginPercent } from '../../utils/currency';
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery';
import { springUI, reducedTransition } from '../../utils/motion';
import Modal from '../ui/Modal';
import { Input, Select, Textarea } from '../ui/Field';
import { translate, useAppLanguage } from '../../context/LanguageContext';

const EMPTY = {
  name: '',
  sku: '',
  category: 'Basmati',
  otherCategory: '',
  description: '',
  unit: 'kg',
  currentStock: '',
  minStockLevel: '',
  maxStockLevel: '',
  costPrice: '',
  sellingPrice: '',
  location: '',
  batchNumber: '',
  expiryDate: '',
  supplier: '',
};

const OTHER = 'Other';

const toFormValues = (product, categories) => {
  if (!product) return EMPTY;

  const known = categories.includes(product.category);
  return {
    ...EMPTY,
    ...product,
    sku: product.sku || '',
    description: product.description || '',
    maxStockLevel: product.maxStockLevel ?? '',
    location: product.location || '',
    batchNumber: product.batchNumber || '',
    supplier: product.supplier || '',
    expiryDate: product.expiryDate ? String(product.expiryDate).slice(0, 10) : '',
    category: known ? product.category : OTHER,
    otherCategory: known ? '' : product.category || '',
  };
};

/** Field-level validation, so problems appear next to the input that caused them. */
const validate = (values) => {
  const errors = {};

  if (!values.name.trim()) errors.name = 'Give the product a name';

  if (values.category === OTHER && !values.otherCategory.trim()) {
    errors.otherCategory = 'Tell us what type of rice this is';
  }

  const numeric = {
    currentStock: 'Current stock',
    minStockLevel: 'Minimum stock',
    costPrice: 'Cost price',
    sellingPrice: 'Selling price',
  };

  Object.entries(numeric).forEach(([field, label]) => {
    const value = values[field];
    if (value === '' || value === null) {
      errors[field] = `${label} is required`;
    } else if (Number.isNaN(Number(value)) || Number(value) < 0) {
      errors[field] = `${label} must be 0 or more`;
    }
  });

  if (values.maxStockLevel !== '' && Number(values.maxStockLevel) < Number(values.minStockLevel || 0)) {
    errors.maxStockLevel = 'Maximum cannot be below the minimum';
  }

  return errors;
};

export default function ProductFormModal({ open, onClose, onSubmit, product, meta, metaLoading = false }) {
  useAppLanguage();
  const { currencySymbol } = useSettings();
  const reducedMotion = usePrefersReducedMotion();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(product);
  const categories = meta?.categories || ['Basmati', OTHER];
  const units = meta?.units || ['kg', 'ton', 'bag', 'sack'];
  const showOtherCategory = values.category === OTHER;

  useEffect(() => {
    if (open) {
      setValues(toFormValues(product, categories));
      setErrors({});
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- categories list is stable from meta
  }, [open, product, meta]);

  const set = (field) => (event) => {
    const value = event.target.value;
    setValues((current) => {
      const next = { ...current, [field]: value };
      if (field === 'category' && value !== OTHER) next.otherCategory = '';
      return next;
    });
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const margin = useMemo(() => {
    const cost = Number(values.costPrice);
    const sell = Number(values.sellingPrice);
    if (!(cost >= 0) || !(sell > 0)) return null;
    return { perUnit: sell - cost, percent: marginPercent(cost, sell) };
  }, [values.costPrice, values.sellingPrice]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    const category = values.category === OTHER ? values.otherCategory.trim() : values.category;

    setSaving(true);
    try {
      await onSubmit({
        ...values,
        category,
        name: values.name.trim(),
        sku: values.sku.trim(),
        currentStock: Number(values.currentStock),
        minStockLevel: Number(values.minStockLevel),
        maxStockLevel: values.maxStockLevel === '' ? null : Number(values.maxStockLevel),
        costPrice: Number(values.costPrice),
        sellingPrice: Number(values.sellingPrice),
        expiryDate: values.expiryDate || null,
      });
    } finally {
      setSaving(false);
    }
  };

  const revealTransition = reducedMotion ? reducedTransition : springUI;

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      disableClose={saving}
      busy={saving}
      title={translate(isEditing ? 'Edit product' : 'Add product')}
      description={translate(isEditing ? product?.name : 'Everything except pricing can be changed later.')}
      size="lg"
      submit={{ form: 'product-form', label: isEditing ? 'Save changes' : 'Create product', loading: saving }}
    >
      <form id="product-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        <section className="space-y-2.5">
          <h3 className="text-xs font-semibold text-content-subtle tracking-normal">{translate("Basics")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Input
              label={translate("Product name")}
              required
              value={values.name}
              onChange={set('name')}
              error={errors.name}
              placeholder={translate("Premium Basmati Rice")}
              autoFocus
              className="sm:col-span-2"
            />
            <Input
              label={translate("SKU")}
              value={values.sku}
              onChange={set('sku')}
              placeholder={translate("Leave blank to generate")}
              hint={translate("A code is created automatically if you leave this empty.")}
            />
            <Select
              label={translate("Category")}
              required
              value={values.category}
              onChange={set('category')}
              disabled={metaLoading}
              hint={translate(metaLoading ? 'Loading categories…' : undefined)}
            >
              {metaLoading ? (
                <option value="">{translate("Loading…")}</option>
              ) : (
                categories.map((category) => (
                  <option key={category} value={category}>
                    {translate(category)}
                  </option>
                ))
              )}
            </Select>
            <Select label={translate("Unit")} required value={values.unit} onChange={set('unit')} disabled={metaLoading}>
              {metaLoading ? (
                <option value="">{translate("Loading…")}</option>
              ) : (
                units.map((unit) => (
                  <option key={unit} value={unit}>
                    {translate(unit)}
                  </option>
                ))
              )}
            </Select>

            <AnimatePresence initial={false}>
              {showOtherCategory && (
                <motion.div
                  key="other-category"
                  initial={{ opacity: 0, height: 0, y: -6 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -4 }}
                  transition={revealTransition}
                  className="sm:col-span-2 overflow-hidden"
                >
                  <div className="rounded-xl border border-primary-500/20 bg-primary-500/12 px-4 py-3">
                    <Input
                      label={translate("What type is it?")}
                      required
                      value={values.otherCategory}
                      onChange={set('otherCategory')}
                      error={errors.otherCategory}
                      placeholder={translate("e.g. Super Kernel, Sella, Parboiled…")}
                      hint={translate("This becomes the category shown on reports and filters.")}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <Input
              label={translate("Supplier")}
              value={values.supplier}
              onChange={set('supplier')}
              placeholder={translate("Who you buy this from")}
            />
          </div>
        </section>

        <section className="space-y-2.5 pt-4 border-t border-hairline/[0.07]">
          <h3 className="text-xs font-semibold text-content-subtle tracking-normal">{translate("Stock")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <Input
              label={translate("Current stock")}
              required
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              value={values.currentStock}
              onChange={set('currentStock')}
              error={errors.currentStock}
              placeholder="0"
            />
            <Input
              label={translate("Minimum level")}
              required
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              value={values.minStockLevel}
              onChange={set('minStockLevel')}
              error={errors.minStockLevel}
              hint={translate("Alerts below this")}
              placeholder="0"
            />
            <Input
              label={translate("Maximum level")}
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              value={values.maxStockLevel}
              onChange={set('maxStockLevel')}
              error={errors.maxStockLevel}
              placeholder={translate("Optional")}
            />
          </div>
        </section>

        <section className="space-y-2.5 pt-4 border-t border-hairline/[0.07]">
          <h3 className="text-xs font-semibold text-content-subtle tracking-normal">{translate("Pricing (per ")}{translate(values.unit)})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Input
              label={translate("Cost price")}
              required
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              prefix={currencySymbol}
              value={values.costPrice}
              onChange={set('costPrice')}
              error={errors.costPrice}
              placeholder="0.00"
            />
            <Input
              label={translate("Selling price")}
              required
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              prefix={currencySymbol}
              value={values.sellingPrice}
              onChange={set('sellingPrice')}
              error={errors.sellingPrice}
              placeholder="0.00"
            />
          </div>

          {margin && (
            <div
              className={`rounded-lg px-4 py-3 text-sm border ${
                margin.perUnit >= 0
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                  : 'bg-red-500/10 border-red-500/20 text-red-500'
              }`}
            >
              <span className="font-medium">
                {translate(margin.perUnit >= 0 ? 'Margin' : 'Loss')}:{' '}
                {translate(formatMoney(Math.abs(margin.perUnit), currencySymbol))}{translate(" per ")}{translate(values.unit)}
              </span>
              <span className="opacity-75"> ({translate(margin.percent.toFixed(1))}%)</span>
            </div>
          )}
        </section>

        <section className="space-y-2.5 pt-4 border-t border-hairline/[0.07]">
          <h3 className="text-xs font-semibold text-content-subtle tracking-normal">{translate("Details")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Input
              label={translate("Storage location")}
              value={values.location}
              onChange={set('location')}
              placeholder={translate("Warehouse A, Section 3")}
            />
            <Input
              label={translate("Batch number")}
              value={values.batchNumber}
              onChange={set('batchNumber')}
              placeholder={translate("BATCH-2024-001")}
            />
            <Input
              label={translate("Expiry date")}
              type="date"
              value={values.expiryDate}
              onChange={set('expiryDate')}
            />
          </div>
          <Textarea
            label={translate("Description")}
            value={values.description}
            onChange={set('description')}
            placeholder={translate("Quality notes, grade, origin…")}
          />
        </section>
      </form>
    </Modal>
  );
}
