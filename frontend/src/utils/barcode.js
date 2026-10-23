import JsBarcode from 'jsbarcode';
import { getLanguage, translate } from '../i18n/locale';

export const requestId = () => {
  if (window.crypto.randomUUID) return window.crypto.randomUUID();
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export const makeBarcode = (element, code) => JsBarcode(element, code, {
  format: 'CODE128C', width: 2, height: 62, margin: 20, marginTop: 4, marginBottom: 3,
  displayValue: false, background: '#ffffff', lineColor: '#000000',
});
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const LABEL_SIZES = { '50x30': [50, 30], '70x40': [70, 40], '100x50': [100, 50], a4: [70, 40] };

// Isolated document: app navigation, dark mode, and mobile chrome never print.
export function printLabels(labels, { size = '70x40', businessName, test = false }) {
  const target = window.open('', '_blank', 'width=850,height=700');
  if (!target) throw new Error('Allow pop-ups for this site, then choose Print again.');
  target.opener = null;
  const language = getLanguage();
  const text = (value, values) => escapeHtml(translate(value, values));
  const [width, height] = LABEL_SIZES[size] || LABEL_SIZES['70x40'];
  const content = labels.map((label) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    makeBarcode(svg, label.code);
    return `<article class="label"><header>${escapeHtml(businessName)}${test ? ' · TEST ONLY' : ''}</header>
      <h2>${escapeHtml(label.productName)}</h2><div class="details"><strong>${escapeHtml(label.quantity)} ${escapeHtml(label.unit)}</strong><span>${escapeHtml(label.sku)}</span></div>
      ${svg.outerHTML}<div class="code">${escapeHtml(label.code)}</div>
      <footer>${label.batchNumber ? `Batch ${escapeHtml(label.batchNumber)}` : 'Unique pack label'}${label.expiryDate ? ` · Exp ${escapeHtml(String(label.expiryDate).slice(0, 10))}` : ''}</footer></article>`;
  }).join('');
  target.document.write(`<!doctype html><html lang="${language}"><head><meta charset="utf-8"><title>${text(test ? 'Test label' : 'Pack labels')} — ${escapeHtml(businessName)}</title><style>
    @page { size: ${size === 'a4' ? 'A4' : `${width}mm ${height}mm`}; margin: ${size === 'a4' ? '10mm 0' : '0'}; }
    *{box-sizing:border-box} body{margin:0;background:#ececec;color:#000;font-family:Arial,sans-serif}
    .tools{max-width:780px;margin:20px auto;padding:16px;background:#fff;font-size:16px;line-height:1.6;direction:${language === 'ur' ? 'rtl' : 'ltr'}}
    button{padding:10px 20px;border:0;border-radius:8px;background:#111;color:#fff;cursor:pointer;font-size:14px}
    main{display:${size === 'a4' ? 'grid' : 'block'};${size === 'a4' ? 'grid-template-columns:repeat(3,70mm);width:210mm;' : `width:${width}mm;`}margin:0 auto}
    .label{background:#fff;width:${width}mm;height:${height}mm;padding:${width === 50 ? '1.5mm' : '2.5mm'};display:flex;flex-direction:column;justify-content:center;break-inside:avoid;${size !== 'a4' ? 'break-after:page;' : ''}overflow:hidden}
    header{font-size:${width === 50 ? 6 : 8}pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    h2{font-size:${width === 50 ? 8 : 11}pt;margin:1mm 0;line-height:1.15;max-height:2.3em;overflow:hidden;overflow-wrap:anywhere}
    .details{display:flex;justify-content:space-between;gap:1mm;font-size:${width === 50 ? 6 : 8}pt;white-space:nowrap}.details span{overflow:hidden;text-overflow:ellipsis}
    svg{display:block;width:100%;height:${width === 50 ? 10 : height === 50 ? 21 : 15}mm;flex-shrink:0}
    .code{font-size:${width === 50 ? 7 : 9}pt;letter-spacing:.7px;text-align:center}
    footer{font-size:${width === 50 ? 5 : 6.5}pt;margin-top:1mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    @media print{body{background:#fff}.tools{display:none}main{margin:0}.label:last-child{break-after:auto}}
    </style></head><body><div class="tools"><button id="print">${text(labels.length === 1 ? 'Print 1 label' : 'Print {0} labels', [labels.length])}</button>
    <p>${text('Paper')}: <bdi>${size === 'a4' ? text('A4 cut-out labels') : `${width} × ${height} mm`}</bdi>. ${text('Set scale to 100%, margins to None, and turn headers and footers off. Print one test label and scan it before printing a full batch.')}</p>
    <p>${text(test ? 'Test only. This barcode is not an inventory record.' : 'Reprints use the same codes. Attach only one unique label to each physical pack.')}</p></div><main>${content}</main></body></html>`);
  target.document.close();
  target.document.getElementById('print').onclick = () => target.print();
  target.focus();
  return target;
}

export function readStored(key, fallback) {
  try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function writeStored(key, value) {
  try { if (value == null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage can be unavailable in private mode. Server replay protection still applies. */ }
}
