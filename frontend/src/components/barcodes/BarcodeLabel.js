import React, { useEffect, useRef } from 'react';
import { makeBarcode } from '../../utils/barcode';
import { formatQuantity } from '../../utils/currency';
import { translate, useAppLanguage } from '../../context/LanguageContext';

export const LABEL_STATUS = { prepared: 'Awaiting stock in', in_stock: 'In stock', stock_out: 'Stocked out', cancelled: 'Released for manual use' };
export default function BarcodeLabel({ label, businessName, size }) {
  useAppLanguage();
  const svg = useRef(null);
  const simple = size === '50x25';
  useEffect(() => { if (svg.current && label?.code) makeBarcode(svg.current, label.code, simple ? { height: 102, margin: 0, marginLeft: 20, marginRight: 20, marginTop: 0, marginBottom: 0 } : {}); }, [label?.code, simple]);
  if (!label) return null;
  if (simple) return <div className="pack-label pack-label-simple" aria-label={translate("Label for {0}", [label.productName])}>
    <svg ref={svg} role="img" aria-label={translate("Code 128 barcode {0}", [label.code])} />
    <div className="pack-label-simple-details"><span className="pack-label-product">{label.productName}</span><span>{translate(formatQuantity(label.quantity))} {translate(label.unit)}</span><span className="pack-label-code">{label.code}</span></div>
  </div>;
  return <div className="pack-label" aria-label={translate("Label for {0}", [label.productName])}>
    <p className="pack-label-business">{businessName}</p>
    <h3>{label.productName}</h3>
    <div className="pack-label-details"><strong>{translate(formatQuantity(label.quantity))} {translate(label.unit)}</strong><span>{label.sku}</span></div>
    <svg ref={svg} role="img" aria-label={translate("Code 128 barcode {0}", [label.code])} />
    <p className="pack-label-code">{label.code}</p>
    <p className="pack-label-meta">{translate(label.batchNumber ? `Batch ${label.batchNumber}` : 'Unique pack label')}{translate(label.expiryDate ? ` · Exp ${String(label.expiryDate).slice(0, 10)}` : '')}</p>
  </div>;
}
