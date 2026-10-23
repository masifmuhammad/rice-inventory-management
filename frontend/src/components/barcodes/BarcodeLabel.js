import React, { useEffect, useRef } from 'react';
import { makeBarcode } from '../../utils/barcode';
import { formatQuantity } from '../../utils/currency';
import { translate, useAppLanguage } from '../../context/LanguageContext';

export const LABEL_STATUS = { prepared: 'Awaiting stock in', in_stock: 'In stock', stock_out: 'Stocked out' };
export default function BarcodeLabel({ label, businessName }) {
  useAppLanguage();
  const svg = useRef(null);
  useEffect(() => { if (svg.current && label?.code) makeBarcode(svg.current, label.code); }, [label?.code]);
  if (!label) return null;
  return <div className="pack-label" aria-label={translate("Label for {0}", [label.productName])}>
    <p className="pack-label-business">{businessName}</p>
    <h3>{label.productName}</h3>
    <div className="pack-label-details"><strong>{translate(formatQuantity(label.quantity))} {translate(label.unit)}</strong><span>{label.sku}</span></div>
    <svg ref={svg} role="img" aria-label={translate("Code 128 barcode {0}", [label.code])} />
    <p className="pack-label-code">{label.code}</p>
    <p className="pack-label-meta">{translate(label.batchNumber ? `Batch ${label.batchNumber}` : 'Unique pack label')}{translate(label.expiryDate ? ` · Exp ${String(label.expiryDate).slice(0, 10)}` : '')}</p>
  </div>;
}
