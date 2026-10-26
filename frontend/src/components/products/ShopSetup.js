import React, { useState } from 'react';
import { FiCheck } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../services/api';
import useApi from '../../hooks/useApi';
import { useShopMode } from '../../context/ShopModeContext';
import { translate, useAppLanguage } from '../../context/LanguageContext';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Input, Select } from '../ui/Field';

export default function ShopSetup({ products, onClose, onSaved }) {
  useAppLanguage();
  const navigate = useNavigate();
  const { setEnabled } = useShopMode();
  const initial = products.find((p) => !p.packQuantity) || products[0];
  const [productId, setProductId] = useState(initial?.id || '');
  const [pack, setPack] = useState(initial?.packQuantity || (['bag','sack'].includes(initial?.unit) ? '1' : ''));
  const [supplierId, setSupplierId] = useState(initial?.supplierId || '');
  const [label, setLabel] = useState(initial?.buttonLabel || '');
  const [paymentDays, setPaymentDays] = useState(initial?.paymentDays || 0);
  const [colour, setColour] = useState(initial?.colour || 'green');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const suppliers = useApi((signal) => api.get('/suppliers', { signal }).then((r) => r.data.suppliers), []);
  const product = products.find((p) => p.id === productId);
  const choose = (event) => {
    const next = products.find((p) => p.id === event.target.value);
    setProductId(next?.id || ''); setPack(next?.packQuantity || (['bag','sack'].includes(next?.unit) ? '1' : ''));
    setSupplierId(next?.supplierId || ''); setLabel(next?.buttonLabel || ''); setColour(next?.colour || 'green'); setPaymentDays(next?.paymentDays || 0); setError('');
  };
  const submit = async (event) => {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError('');
    try {
      await api.put(`/shop/products/${productId}`, { packQuantity: Number(pack), supplierId: supplierId || null, buttonLabel: label, colour, paymentDays: Number(paymentDays) });
      onSaved(); onClose();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };
  return <Modal open onClose={onClose} disableClose={saving} busy={saving} title={translate('Set up Shop mode')}
    description={translate('Admin sets this once. Workers tap packets; the app calculates the weight and price.')}
    submit={{ form: 'shop-setup', label: 'Save packet button', loading: saving }}>
    <form id="shop-setup" onSubmit={submit} className="space-y-4">
      <Select label={translate('Product')} required value={productId} onChange={choose}><option value="">{translate('Choose a product')}</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
      <Input label={translate('Packet size ({0})', [product?.unit || 'units'])} required type="number" min="0.0001" max="9999999999" step="0.0001" inputMode="decimal" value={pack} onChange={(event) => setPack(event.target.value)}
        hint={translate('For a 25 kg packet, enter 25. This does not add stock.')} />
      <Select label={translate('Supplier for deliveries')} value={supplierId} onChange={(event) => setSupplierId(event.target.value)} disabled={suppliers.loading}>
        <option value="">{translate('Selling only — choose a supplier to receive stock')}</option>{(suppliers.data || []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
      </Select>
      {suppliers.error && <p role="alert" className="text-sm">{translate(suppliers.error)} <Button variant="ghost" onClick={() => suppliers.refetch()}>{translate('Try again')}</Button></p>}
      {supplierId && <Input label={translate('Supplier payment due after (days)')} type="number" min="0" max="365" step="1" required value={paymentDays} onChange={(event) => setPaymentDays(event.target.value)} hint={translate('0 means due today. Use the payment terms agreed with this supplier.')} />}
      <Input label={translate('Short button name (optional)')} maxLength={40} value={label} onChange={(event) => setLabel(event.target.value)} placeholder={product?.name} />
      <fieldset><legend className="text-sm font-medium mb-2">{translate('Button colour')}</legend><div className="flex flex-wrap gap-3">{['green','blue','orange','purple','rose'].map((value) => <button key={value} type="button" className="shop-colour-choice" data-colour={value} aria-label={translate(value)} aria-pressed={colour === value} onClick={() => setColour(value)}>{colour === value && <FiCheck aria-hidden="true" />}</button>)}</div></fieldset>
      <p className="text-sm text-content-muted">{translate('Selling and cost prices come from Stock. Deliveries save an unpaid supplier bill; an admin records payment later.')}</p>
      <Button variant="ghost" onClick={() => { setEnabled(false); navigate('/products', { state: { search: product?.name || '' } }); }}>{translate('Edit products and prices')}</Button>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{translate(error)}</p>}
    </form>
  </Modal>;
}
