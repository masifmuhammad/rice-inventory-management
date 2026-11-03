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
export const makeBarcode = (element, code, options = {}) => JsBarcode(element, code, {
  format: 'CODE128C', width: 2, height: 62, margin: 20, marginTop: 4, marginBottom: 3,
  displayValue: false, background: '#ffffff', lineColor: '#000000', ...options,
});
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const DEFAULT_LABEL_SIZE = '50x25';
export const LABEL_SIZES = { '50x25': [50, 25], '40x20': [40, 20], '50x30': [50, 30], '70x40': [70, 40], '100x50': [100, 50], a4: [70, 40] };

// Isolated document: app navigation, dark mode, and mobile chrome never print.
export function printLabels(labels, { size = DEFAULT_LABEL_SIZE, businessName, test = false }) {
  const target = window.open('', '_blank', 'width=850,height=700');
  if (!target) throw new Error('Allow pop-ups for this site, then choose Print again.');
  target.opener = null;
  const language = getLanguage();
  const text = (value, values) => escapeHtml(translate(value, values));
  const [width, height] = LABEL_SIZES[size] || LABEL_SIZES[DEFAULT_LABEL_SIZE];
  const simple = width === 50 && height === 25;
  const small = height === 20;
  const compact = width <= 50;
  const content = labels.map((label) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    makeBarcode(svg, label.code, simple ? { height: 102, margin: 0, marginLeft: 20, marginRight: 20, marginTop: 0, marginBottom: 0 } : {});
    if (simple) {
      // At 8 dots/mm (203 dpi), two-dot modules keep an 18-digit code at 38.5 mm.
      svg.style.width = `${parseFloat(svg.getAttribute('width')) / 8}mm`;
      svg.style.height = '12.75mm';
      return `<article class="label simple">${svg.outerHTML}<div class="simple-details">${test ? '<strong class="test-marker">TEST</strong>' : ''}<span class="product">${escapeHtml(label.productName)}</span><span class="pack-size">${escapeHtml(label.quantity)} ${escapeHtml(label.unit)}</span><span class="code">${escapeHtml(label.code)}</span></div></article>`;
    }
    // Shorten the bars without narrowing them or their quiet zones.
    if (small) svg.setAttribute('preserveAspectRatio', 'none');
    return `<article class="label"><header>${escapeHtml(businessName)}${test ? ' · TEST ONLY' : ''}</header>
      <h2>${escapeHtml(label.productName)}</h2><div class="details"><strong>${escapeHtml(label.quantity)} ${escapeHtml(label.unit)}</strong><span>${escapeHtml(label.sku)}</span></div>
      ${svg.outerHTML}<div class="code">${escapeHtml(label.code)}</div>
      <footer>${label.batchNumber ? `Batch ${escapeHtml(label.batchNumber)}` : 'Unique pack label'}${label.expiryDate ? ` · Exp ${escapeHtml(String(label.expiryDate).slice(0, 10))}` : ''}</footer></article>`;
  }).join('');
  // Thermal labels use `size: auto` on purpose: a wide CSS page (50x25) makes Chrome
  // force Landscape onto the Zebra/Seagull driver, which then rotates or shrinks the
  // print. With auto, the driver's own stock (50x25 mm, Portrait, like BarTender) wins.
  target.document.write(`<!doctype html><html lang="${language}"><head><meta charset="utf-8"><title>${text(test ? 'Test label' : 'Pack labels')} — ${escapeHtml(businessName)}</title><style>
    @page { size: ${size === 'a4' ? 'A4' : 'auto'}; margin: ${size === 'a4' ? '10mm 0' : '0'}; }
    *{box-sizing:border-box} body{margin:0;background:#ececec;color:#000;font-family:Arial,sans-serif}
    .tools{max-width:780px;margin:20px auto;padding:16px;background:#fff;font-size:16px;line-height:1.6;direction:${language === 'ur' ? 'rtl' : 'ltr'}}
    button{padding:10px 20px;border:0;border-radius:8px;background:#111;color:#fff;cursor:pointer;font-size:14px}
    main{display:${size === 'a4' ? 'grid' : 'block'};${size === 'a4' ? 'grid-template-columns:repeat(3,70mm);width:210mm;' : `width:${width}mm;`}margin:0 auto}
    .label{background:#fff;width:${width}mm;height:${height}mm;padding:${small ? 1 : compact ? 1.5 : 2.5}mm;display:flex;flex-direction:column;justify-content:center;${small ? 'line-height:1.1;' : ''}break-inside:avoid;page-break-inside:avoid;${size !== 'a4' ? 'break-after:page;page-break-after:always;' : ''}overflow:hidden}
    header{font-size:${small ? 5 : compact ? 6 : 8}pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    h2{font-size:${small ? 7 : compact ? 8 : 11}pt;margin:${small ? '.3mm' : '1mm'} 0;line-height:${small ? 1.1 : 1.15};max-height:${small ? '1.1em' : '2.3em'};overflow:hidden;${small ? 'white-space:nowrap;text-overflow:ellipsis;' : 'overflow-wrap:anywhere;'}}
    .details{display:flex;justify-content:space-between;gap:1mm;font-size:${small ? 5 : compact ? 6 : 8}pt;white-space:nowrap}.details span{overflow:hidden;text-overflow:ellipsis}
    svg{display:block;width:100%;height:${small ? 6 : compact ? 10 : height === 50 ? 21 : 15}mm;flex-shrink:0}
    .code{font-size:${small ? 6 : compact ? 7 : 9}pt;letter-spacing:${small ? '.4px' : '.7px'};text-align:center}
    footer{font-size:${small ? 4.5 : compact ? 5 : 6.5}pt;margin-top:${small ? '.2mm' : '1mm'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .label.simple{padding:1.5mm 3.5mm;align-items:center;gap:1mm}
    .simple svg{max-width:100%;flex:none}
    .simple-details{display:flex;align-items:baseline;gap:1mm;width:100%;font-size:6.5pt;line-height:1.2;white-space:nowrap}
    .simple-details .product{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
    .simple-details .pack-size,.simple-details .test-marker,.simple-details .code{flex:none}
    .simple-details .code{font-size:inherit;letter-spacing:0}
    @media print{body{background:#fff}.tools{display:none}main{margin:0}.label:last-child{break-after:auto;page-break-after:auto}}
    </style></head><body><div class="tools"><button id="print">${text(labels.length === 1 ? 'Print 1 label' : 'Print {0} labels', [labels.length])}</button>
    <p>${text('Paper')}: <bdi>${size === 'a4' ? text('A4 cut-out labels') : `${width} × ${height} mm`}</bdi>. ${text('Choose the same paper size in the printer settings.')} ${text('Set scale to 100%, margins to None, and turn headers and footers off. Print one test label and scan it before printing a full batch.')}</p>
    ${simple ? `<p>${text('Zebra TLP 2844: in Windows Printing Preferences set Width 50 mm, Height 25 mm, Portrait, unprintable area 0. In the print window choose Layout Portrait, Margins None, Scale 100%.')}</p>` : ''}
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
