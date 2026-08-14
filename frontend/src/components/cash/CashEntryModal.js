import React, { useEffect, useMemo, useState } from 'react';
import { FiArrowDownLeft, FiArrowUpRight } from 'react-icons/fi';
import { useSettings } from '../../context/SettingsContext';
import { isValidDate, todayInput } from '../../utils/date';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Field';

// Local, not `toISOString()`. In PKT (UTC+5) the UTC day is still yesterday
// until 05:00, so a sale entered at 01:30 pre-filled — and was capped at — the
// wrong date, and the picker refused to let anyone select today.
const today = todayInput;

const EMPTY = {
  direction: 'in',
  amount: '',
  category: '',
  purpose: '',
  party: '',
  reference: '',
  notes: '',
  occurredAt: today(),
};

/** Money in and money out are different enough that the form re-labels itself. */
const COPY = {
  in: {
    title: 'Record money in',
    partyLabel: 'Received from',
    partyPlaceholder: 'Customer, owner, lender…',
    purposePlaceholder: 'What is this payment for?',
    button: 'Record money in',
  },
  out: {
    title: 'Record money out',
    partyLabel: 'Taken by',
    partyPlaceholder: 'Who took the money',
    purposePlaceholder: 'What was it spent on?',
    button: 'Record money out',
  },
};

export default function CashEntryModal({ open, onClose, onSubmit, meta, metaLoading = false, entry, defaultDirection = 'in' }) {
  const { currencySymbol } = useSettings();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(entry);

  useEffect(() => {
    if (!open) return;

    if (entry) {
      setValues({
        ...EMPTY,
        ...entry,
        party: entry.party || '',
        category: entry.category || '',
        reference: entry.reference || '',
        notes: entry.notes || '',
        occurredAt: String(entry.occurredAt || '').slice(0, 10) || today(),
      });
    } else {
      setValues({ ...EMPTY, direction: defaultDirection, occurredAt: today() });
    }

    setErrors({});
    setSaving(false);
  }, [open, entry, defaultDirection]);

  const copy = COPY[values.direction] || COPY.in;

  const categories = useMemo(
    () => (values.direction === 'in' ? meta?.inCategories : meta?.outCategories) || [],
    [values.direction, meta]
  );

  // Keep the category valid when the direction flips — an expense category on a
  // money-in row would quietly corrupt the breakdown.
  useEffect(() => {
    if (categories.length && !categories.includes(values.category)) {
      setValues((current) => ({ ...current, category: categories[categories.length - 1] }));
    }
  }, [categories, values.category]);

  const set = (field) => (event) => {
    const value = event.target.value;
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const amount = Number(values.amount);
    const nextErrors = {};

    if (values.amount === '' || Number.isNaN(amount) || amount <= 0) {
      nextErrors.amount = 'Enter an amount greater than 0';
    }
    if (!values.purpose.trim()) nextErrors.purpose = 'Say what this is for';

    // A cleared date used to reach `new Date('').toISOString()`, which throws a
    // RangeError from inside a try/finally with no catch — so the save silently
    // did nothing at all: no request, no error, no explanation.
    if (!isValidDate(values.occurredAt)) nextErrors.occurredAt = 'Choose a date';

    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSaving(true);
    try {
      await onSubmit({
        ...values,
        amount,
        purpose: values.purpose.trim(),
        party: values.party.trim(),
        occurredAt: new Date(values.occurredAt).toISOString(),
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
      title={isEditing ? 'Edit cash entry' : copy.title}
      size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="cash-form"
            loading={saving}
            variant={values.direction === 'in' ? 'success' : 'danger'}
          >
            {isEditing ? 'Save changes' : copy.button}
          </Button>
        </div>
      }
    >
      <form id="cash-form" onSubmit={handleSubmit} className="space-y-2.5" noValidate>
        {/* A two-way switch rather than a dropdown: direction is the single most
            consequential choice on this form, so it should be impossible to miss. */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-surface-sunken rounded-xl">
          {[
            { value: 'in', label: 'Money in', icon: FiArrowDownLeft, active: 'segmented-thumb text-emerald-600 dark:text-emerald-400' },
            { value: 'out', label: 'Money out', icon: FiArrowUpRight, active: 'segmented-thumb text-red-600 dark:text-red-400' },
          ].map((option) => {
            const Icon = option.icon;
            const selected = values.direction === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setValues((current) => ({ ...current, direction: option.value }))}
                aria-pressed={selected}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-lg
                  text-sm font-medium transition-colors ${
                    selected ? option.active : 'text-content-muted hover:text-content'
                  }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Input
            label="Amount"
            required
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            prefix={currencySymbol}
            value={values.amount}
            onChange={set('amount')}
            error={errors.amount}
            placeholder="0.00"
            autoFocus
          />
          <Input
            label="Date"
            type="date"
            value={values.occurredAt}
            onChange={set('occurredAt')}
            error={errors.occurredAt}
            max={today()}
            hint="Back-date if it happened earlier"
          />
        </div>

        <Select
          label="Category"
          value={values.category}
          onChange={set('category')}
          disabled={metaLoading}
          hint={metaLoading ? 'Loading categories…' : undefined}
        >
          {metaLoading ? (
            <option value="">Loading…</option>
          ) : (
            categories.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))
          )}
        </Select>

        <Input
          label="Purpose"
          required
          value={values.purpose}
          onChange={set('purpose')}
          error={errors.purpose}
          placeholder={copy.purposePlaceholder}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Input
            label={copy.partyLabel}
            value={values.party}
            onChange={set('party')}
            placeholder={copy.partyPlaceholder}
          />
          <Input
            label="Reference"
            value={values.reference}
            onChange={set('reference')}
            placeholder="Voucher or receipt no."
          />
        </div>

        <Textarea label="Notes" value={values.notes} onChange={set('notes')} placeholder="Optional details…" />
      </form>
    </Modal>
  );
}
