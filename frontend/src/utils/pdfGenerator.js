import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatMoney, formatQuantity } from './currency';
import { isoDate, saveFile, slugify } from './download';

/**
 * Receipt and report generation.
 *
 * Design brief: printed documents that read as stationery, not as a dashboard
 * screenshot. That means restraint — an almost monochrome page, one hairline
 * accent, and hierarchy carried by type size, weight and letterspacing rather
 * than by coloured blocks. Depth comes from whitespace and a single very light
 * panel behind the total, which is the one number anyone looks for twice.
 *
 * Layout rule that every helper here obeys: nothing is drawn without a width
 * budget. jsPDF will happily paint text straight through a neighbouring column
 * and off the edge of the paper, so every string is either wrapped, shrunk, or
 * ellipsized to fit the box it belongs to, and every block checks that it fits
 * above the footer before it commits to a page.
 */

/* ------------------------------------------------------------------- theme */

const A4 = { short: 595.28, long: 841.89 }; // points
const MARGIN = 48;
const FOOTER_RESERVE = 46; // strip at the bottom that body content may not enter

const INK = [17, 24, 39]; // near-black; pure black prints harshly
const BODY = [55, 65, 81];
const MUTED = [107, 114, 128];
const FAINT = [107, 114, 128];
const HAIRLINE = [229, 231, 235];
const RULE_STRONG = [209, 213, 219];
const PANEL = [249, 250, 251];
const ZEBRA = [252, 252, 253];

const hexToRgb = (hex, fallback = [2, 132, 199]) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!match) return fallback;
  const int = parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
};

/**
 * Preserve names and notes in their original language. The embedded Ledger Sans
 * fonts cover Latin and Arabic/Urdu, including Arabic presentation forms used by
 * jsPDF's shaping support. Only control characters are removed.
 */
const safeText = (input) => {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[₨₹]/g, 'Rs.')
    .replace(/[–—]/g, '-')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→/g, '->')
    .replace(/\r\n?/g, '\n')
    .split('').filter(char => char === '\n' || (char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)).join('');
};

const money = (amount, symbol) => safeText(formatMoney(amount, symbol));

/* ------------------------------------------------------------------ canvas */

/**
 * Page geometry. Keeping this in one object means the landscape report reuses
 * exactly the same containment logic as the portrait receipt, instead of the
 * two swapping width and height by hand at each call site.
 */
let fontData;
const loadFonts = () => {
  if (!fontData) fontData = Promise.all(['Regular', 'Bold'].map(async (weight) => {
    const response = await fetch(`${process.env.PUBLIC_URL || ''}/fonts/LedgerSans-${weight}.ttf`);
    if (!response.ok) throw new Error('Document fonts could not load. Refresh the app and try again.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(binary);
  })).catch((error) => { fontData = null; throw error; });
  return fontData;
};

const createCanvas = async (orientation = 'portrait') => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation });
  const fonts = await loadFonts();
  fonts.forEach((data, index) => {
    const file = `LedgerSans-${index ? 'Bold' : 'Regular'}.ttf`;
    doc.addFileToVFS(file, data);
    doc.addFont(file, 'LedgerSans', index ? 'bold' : 'normal');
  });
  doc.setFont('LedgerSans', 'normal');
  const landscape = orientation === 'landscape';
  const width = landscape ? A4.long : A4.short;
  const height = landscape ? A4.short : A4.long;

  return {
    doc,
    geom: {
      width,
      height,
      left: MARGIN,
      right: width - MARGIN,
      top: MARGIN,
      contentWidth: width - MARGIN * 2,
      // The lowest y body content may occupy before it would collide with the footer.
      bottom: height - MARGIN - FOOTER_RESERVE,
    },
  };
};

/* -------------------------------------------------------------- primitives */

/**
 * Wraps text to `maxWidth`, capped at `maxLines`. The final line is ellipsized
 * rather than allowed to spill, so an unusually long customer name shortens
 * instead of running into the column beside it.
 *
 * Caller must set the font and size first — measurement depends on both.
 */
const fitLines = (doc, text, maxWidth, maxLines = 1) => {
  const clean = safeText(text);
  if (!clean) return [''];

  const lines = doc.splitTextToSize(clean, maxWidth);
  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];

  while (last.length > 1 && doc.getTextWidth(`${last}...`) > maxWidth) {
    last = last.slice(0, -1);
  }

  kept[maxLines - 1] = `${last.trimEnd()}...`;
  return kept;
};

/**
 * Largest font size at or below `startSize` at which the text fits on one line.
 * Used for figures that must stay on a single line to read as one number —
 * a total should shrink, never wrap or overflow its panel.
 */
const fitFontSize = (doc, text, maxWidth, startSize, minSize = 7.5) => {
  let size = startSize;
  doc.setFontSize(size);

  while (size > minSize && doc.getTextWidth(safeText(text)) > maxWidth) {
    size -= 0.25;
    doc.setFontSize(size);
  }

  return size;
};

/** Small uppercase label with tracking — the workhorse of the layout. */
const label = (doc, text, x, y, { align = 'left', color = MUTED, size = 7.5, maxWidth } = {}) => {
  doc.setFont('LedgerSans', 'bold');
  doc.setFontSize(size);
  doc.setTextColor(...color);
  doc.setCharSpace(0.8);

  const content = safeText(text).toUpperCase();
  doc.text(maxWidth ? fitLines(doc, content, maxWidth, 1) : content, x, y, { align });

  doc.setCharSpace(0);
};

const value = (doc, text, x, y, { align = 'left', size = 10, bold = false, color = INK, maxWidth } = {}) => {
  doc.setFont('LedgerSans', bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(...color);
  doc.text(maxWidth ? fitLines(doc, text, maxWidth, 1) : safeText(text), x, y, { align });
};

const rule = (doc, geom, y, { from = geom.left, to = geom.right, color = HAIRLINE, width = 0.5 } = {}) => {
  doc.setDrawColor(...color);
  doc.setLineWidth(width);
  doc.line(from, y, to, y);
};

/** Starts a new page when `needed` points would not fit above the footer. */
const ensureSpace = (doc, geom, y, needed) => {
  if (y + needed <= geom.bottom) return y;
  doc.addPage();
  return geom.top;
};

/** Guards against `new Date(undefined)`, which renders as "Invalid Date" on the page. */
const asDate = (input) => {
  const date = input instanceof Date ? input : new Date(input ?? NaN);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (date) => {
  const parsed = asDate(date);
  return parsed
    ? parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '-';
};

const formatTime = (date) => {
  const parsed = asDate(date);
  return parsed ? parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-';
};

/** "14 Aug 2026 at 18:40" — the stamp a printed document is judged by. */
const formatDateTime = (date) => {
  const parsed = asDate(date);
  return parsed ? `${formatDate(parsed)} at ${formatTime(parsed)}` : '-';
};

/**
 * Hands the finished document to the browser.
 *
 * jsPDF's own `doc.save()` is an `<a download>` underneath, which iOS ignores —
 * the report opens as a page instead of being saved. Routing through `saveFile`
 * gets an actual file into Files on iPhone and into Downloads everywhere else.
 */
const deliver = (doc, filename, { title, text }) =>
  saveFile(doc.output('blob'), filename, { title, text });

/* ------------------------------------------------------------------ assets */

/** Loads an image into a data URL. Never throws — a receipt without a logo is fine. */
const loadImage = async (source) => {
  try {
    if (!source) return null;

    if (source.startsWith('data:')) {
      const mime = source.slice(5, source.indexOf(';'));
      if (mime === 'image/svg+xml') return null; // jsPDF cannot embed SVG
      return { dataUrl: source, format: mime.includes('png') ? 'PNG' : 'JPEG' };
    }

    const response = await fetch(source);
    if (!response.ok) return null;

    const blob = await response.blob();
    if (blob.type === 'image/svg+xml') return null;

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return { dataUrl, format: blob.type.includes('png') ? 'PNG' : 'JPEG' };
  } catch {
    return null;
  }
};

/**
 * Draws a logo scaled to fit inside a box while keeping its aspect ratio, and
 * returns the size actually used so the caller can lay text out beside it.
 *
 * A wide logo squeezed into a square box is the single most obvious sign of a
 * generated document, so the box is a bound, not a target.
 */
const drawLogo = (doc, image, x, y, boxWidth, boxHeight) => {
  if (!image) return null;

  let width = boxWidth;
  let height = boxHeight;

  try {
    const props = doc.getImageProperties(image.dataUrl);
    if (props?.width && props?.height) {
      const scale = Math.min(boxWidth / props.width, boxHeight / props.height);
      width = props.width * scale;
      height = props.height * scale;
    }
  } catch {
    /* Unreadable header — fall back to filling the box. */
  }

  try {
    // 'SLOW' keeps the logo crisp; 'FAST' visibly softens small marks.
    doc.addImage(image.dataUrl, image.format, x, y + (boxHeight - height) / 2, width, height, undefined, 'SLOW');
    return { width, height };
  } catch {
    return null; // a malformed logo must not take the document down with it
  }
};

/* ------------------------------------------------------------ shared parts */

const businessFrom = (settings = {}) => {
  const address = typeof settings.address === 'object' && settings.address ? settings.address : {};
  const lines = [
    [address.street, address.city].filter(Boolean).join(', '),
    [address.state, address.postalCode].filter(Boolean).join(' '),
    address.country,
  ].filter(Boolean);

  return {
    name: settings.businessName || settings.name || 'Inventory',
    tagline: settings.tagline || '',
    addressLines: lines,
    contact: [settings.phone, settings.email, settings.website].filter(Boolean),
    // One line that says who this document belongs to, for the meta grid and for
    // the share sheet's preview text. Falls back to the address when no tagline
    // has been set, so the cell is never empty.
    description: settings.tagline || lines[0] || settings.phone || '',
    accent: hexToRgb(settings.primaryColor),
    symbol: settings.currency?.symbol || 'Rs.',
    footerText: settings.receiptSettings?.footerText || 'Thank you for your business.',
    prefix: settings.receiptSettings?.receiptPrefix || 'INV',
    terms: settings.receiptSettings?.includeTerms ? settings.receiptSettings?.termsText : '',
  };
};

/**
 * Letterhead. The logo and name sit left, the document type and number right,
 * separated from the body by a hairline with one short accent segment — the only
 * colour on the page above the total.
 *
 * The two sides get explicit, non-overlapping width budgets, so a long business
 * name wraps within its own half instead of colliding with the document number.
 */
const drawLetterhead = (doc, geom, business, logo, { documentType, documentNumber }) => {
  const top = geom.top;
  const logoBox = 44;
  const drawn = drawLogo(doc, logo, geom.left, top, logoBox, logoBox);

  const textX = drawn ? geom.left + drawn.width + 14 : geom.left;
  const railWidth = 170; // reserved for the document type and number
  const identityWidth = geom.right - railWidth - 20 - textX;

  doc.setFont('LedgerSans', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  const nameLines = fitLines(doc, business.name, identityWidth, 2);
  doc.text(nameLines, textX, top + 14);

  let subY = top + 14 + nameLines.length * 16;

  doc.setFont('LedgerSans', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);

  [business.tagline, ...business.addressLines, business.contact.join('  ·  ')]
    .filter(Boolean)
    .slice(0, 3)
    .forEach((line) => {
      doc.text(fitLines(doc, line, identityWidth, 1), textX, subY);
      subY += 11;
    });

  /* Right rail */
  label(doc, documentType, geom.right, top + 10, {
    align: 'right',
    color: FAINT,
    size: 8,
    maxWidth: railWidth,
  });

  doc.setFont('LedgerSans', 'bold');
  const numberSize = fitFontSize(doc, documentNumber, railWidth, 13, 9);
  doc.setFontSize(numberSize);
  doc.setTextColor(...INK);
  doc.text(safeText(documentNumber), geom.right, top + 28, { align: 'right' });

  const ruleY = Math.max(subY + 6, top + logoBox + 16, top + 44);
  rule(doc, geom, ruleY);

  // One short accent segment: enough to carry the brand, not enough to shout.
  doc.setDrawColor(...business.accent);
  doc.setLineWidth(1.6);
  doc.line(geom.left, ruleY, geom.left + 46, ruleY);

  return ruleY + 26;
};

/**
 * Metadata grid. Each cell wraps inside its own column and the row grows to the
 * tallest cell in it, so no value can ever reach into its neighbour or sit on
 * top of the row beneath.
 */
const drawMetaGrid = (doc, geom, entries, startY, { columns = 3 } = {}) => {
  const visible = entries.filter((entry) => entry && entry.label);
  if (!visible.length) return startY;

  const columnCount = Math.min(columns, visible.length);
  const columnWidth = geom.contentWidth / columnCount;
  const cellWidth = columnWidth - 16; // gutter, so adjacent values never touch

  let y = startY;
  let rowHeight = 0;

  visible.forEach((entry, index) => {
    const column = index % columnCount;

    if (column === 0 && index > 0) {
      y += rowHeight;
      rowHeight = 0;
    }

    const x = geom.left + column * columnWidth;

    label(doc, entry.label, x, y, { maxWidth: cellWidth });

    doc.setFont('LedgerSans', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const lines = fitLines(doc, entry.value || '-', cellWidth, 2);
    doc.text(lines, x, y + 13);

    rowHeight = Math.max(rowHeight, 13 + lines.length * 11 + 11);
  });

  return y + rowHeight;
};

/**
 * Footers, drawn in one pass after the body so the page count is known and
 * every page can say "Page 2 of 3" rather than just "Page 2".
 */
const drawFooters = (doc, geom, business, { leftText }) => {
  const pageCount = doc.internal.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const y = geom.height - MARGIN + 10;

    rule(doc, geom, y - 16);

    doc.setFont('LedgerSans', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...FAINT);
    doc.text(fitLines(doc, leftText || business.footerText, geom.contentWidth - 90, 1), geom.left, y);

    if (pageCount > 1) {
      doc.text(`Page ${page} of ${pageCount}`, geom.right, y, { align: 'right' });
    }
  }
};

/* ------------------------------------------------------------------ receipt */

export const generateTransactionPDF = async (transaction, product, settings = {}) => {
  const business = businessFrom(settings);
  const logo = settings.logo ? await loadImage(settings.logo) : null;

  const { doc, geom } = await createCanvas('portrait');

  const isSale = transaction.type === 'stock_out';
  const isCredit = isSale && transaction.paymentType === 'credit';
  const documentType = isCredit ? 'Credit Sale' : isSale
    ? 'Sales Receipt'
    : transaction.type === 'stock_in'
      ? 'Goods Received'
      : 'Stock Adjustment';
  const receiptNumber = `${business.prefix}-${String(transaction._id).slice(-8).toUpperCase()}`;

  const issuedAt = asDate(transaction.createdAt) || new Date();

  doc.setProperties({
    title: `${documentType} ${receiptNumber} - ${business.name}`,
    subject: `${documentType} for ${product?.name || 'an inventory item'}, issued by ${
      business.name
    } on ${formatDate(issuedAt)}.`,
    keywords: [documentType, receiptNumber, business.name, isoDate(issuedAt)].join(', '),
    creator: business.name,
    author: business.name,
  });

  let y = drawLetterhead(doc, geom, business, logo, { documentType, documentNumber: receiptNumber });

  /* Parties and dates */
  y = drawMetaGrid(
    doc,
    geom,
    [
      { label: 'Date', value: formatDateTime(issuedAt) },
      {
        label: isSale ? 'Customer' : 'Supplier',
        value: (isSale ? transaction.customer : transaction.supplier) || 'Not recorded',
      },
      { label: 'Reference', value: transaction.reference || '-' },
      { label: 'Recorded by', value: transaction.createdBy?.name || 'Unknown' },
      { label: 'Category', value: product?.category || '-' },
      { label: 'SKU', value: product?.sku || '-' },
    ],
    y
  );

  y += 4;

  /* Line items — one row, but laid out as a real table so the columns align
     with the totals block beneath it. Widths are derived from the content width
     so the numeric columns can never push past the right margin. */
  const numericColumn = 92;
  autoTable(doc, {
    startY: y,
    margin: { left: geom.left, right: MARGIN, bottom: MARGIN + FOOTER_RESERVE },
    head: [['Description', 'Qty', 'Unit price', 'Amount']],
    body: [
      [
        {
          content: `${safeText(product?.name || 'Item')}${
            product?.batchNumber ? `\nBatch ${safeText(product.batchNumber)}` : ''
          }`,
          styles: { fontStyle: 'normal' },
        },
        safeText(formatQuantity(transaction.quantity, transaction.unit)),
        money(transaction.price, business.symbol),
        money(transaction.totalValue, business.symbol),
      ],
    ],
    theme: 'plain',
    styles: {
      font: 'LedgerSans',
      fontSize: 9.5,
      textColor: BODY,
      cellPadding: { top: 10, bottom: 10, left: 0, right: 0 },
      lineColor: HAIRLINE,
      lineWidth: 0,
      // Wrap rather than clip: a long product name must stay legible.
      overflow: 'linebreak',
      valign: 'top',
    },
    headStyles: {
      fontSize: 7.5,
      fontStyle: 'bold',
      textColor: MUTED,
      lineWidth: { bottom: 0.5 },
      lineColor: HAIRLINE,
      cellPadding: { top: 0, bottom: 8, left: 0, right: 0 },
    },
    bodyStyles: { lineWidth: { bottom: 0.5 }, lineColor: HAIRLINE },
    columnStyles: {
      0: { cellWidth: geom.contentWidth - numericColumn * 3, textColor: INK, fontStyle: 'bold' },
      1: { cellWidth: numericColumn, halign: 'right' },
      2: { cellWidth: numericColumn, halign: 'right' },
      3: { cellWidth: numericColumn, halign: 'right', textColor: INK, fontStyle: 'bold' },
    },
  });

  y = doc.lastAutoTable.finalY + 20;

  /* Total: the one place the page raises its voice. A light panel and a rule
     above it give the number weight without adding colour. */
  const panelWidth = 244;
  const panelHeight = 48;
  y = ensureSpace(doc, geom, y, panelHeight + 12);

  const panelX = geom.right - panelWidth;
  const panelPad = 16;

  doc.setFillColor(...PANEL);
  doc.roundedRect(panelX, y, panelWidth, panelHeight, 4, 4, 'F');
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.5);
  doc.roundedRect(panelX, y, panelWidth, panelHeight, 4, 4, 'S');

  const totalLabel = isSale && !isCredit ? 'Total received' : 'Total value';
  label(doc, totalLabel, panelX + panelPad, y + 18, { maxWidth: panelWidth - panelPad * 2 });

  // Shrink to fit rather than overflow the panel it sits in.
  const totalText = money(transaction.totalValue, business.symbol);
  doc.setFont('LedgerSans', 'bold');
  const totalSize = fitFontSize(doc, totalText, panelWidth - panelPad * 2, 15, 9);
  value(doc, totalText, geom.right - panelPad, y + 36, {
    align: 'right',
    size: totalSize,
    bold: true,
  });

  /* Stock movement, to the left of the total panel and bounded by it. */
  const movementWidth = panelX - geom.left - 24;
  label(doc, 'Stock movement', geom.left, y + 18, { maxWidth: movementWidth });
  value(
    doc,
    `${formatQuantity(transaction.stockBefore, transaction.unit)}  ->  ${formatQuantity(
      transaction.stockAfter,
      transaction.unit
    )}`,
    geom.left,
    y + 36,
    { size: 10, color: BODY, maxWidth: movementWidth }
  );

  y += panelHeight + 26;
  if (isCredit) {
    y = drawMetaGrid(doc, geom, [
      { label:'Received at sale', value:money(transaction.amountReceived || 0,business.symbol) },
      { label:'Credit at sale', value:money(transaction.totalValue-(transaction.amountReceived || 0),business.symbol) },
      { label:'Payment due', value:formatDate(transaction.dueDate) },
    ], y);
    y += 16;
  }

  /* Free-text blocks. Each measures itself first and moves to a new page whole,
     rather than being clipped by the footer. */
  const drawTextBlock = (heading, text, { size, color }) => {
    if (!text) return;

    doc.setFont('LedgerSans', 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(safeText(text), geom.contentWidth);
    const lineHeight = size * 1.35;

    y = ensureSpace(doc, geom, y, 14 + lines.length * lineHeight + 12);

    label(doc, heading, geom.left, y);
    doc.setFont('LedgerSans', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(lines, geom.left, y + 14);

    y += 14 + lines.length * lineHeight + 12;
  };

  drawTextBlock('Notes', transaction.notes, { size: 9, color: BODY });
  drawTextBlock('Terms', business.terms, { size: 8, color: MUTED });

  /* Signature line, placed just above the footer — a printed receipt is often
     signed on the spot. Only drawn if the last page still has room for it. */
  const signatureY = geom.bottom - 8;
  if (y < signatureY - 24) {
    rule(doc, geom, signatureY, { from: geom.right - 170, to: geom.right });
    label(doc, 'Authorised signature', geom.right, signatureY + 12, {
      align: 'right',
      color: FAINT,
      maxWidth: 170,
    });
  }

  drawFooters(doc, geom, business, { leftText: business.footerText });

  const filename = `${slugify(business.name, 'receipt')}-${slugify(documentType)}-${receiptNumber}.pdf`;

  return deliver(doc, filename, {
    title: `${documentType} ${receiptNumber}`,
    text: `${documentType} ${receiptNumber} from ${business.name}, ${formatDate(issuedAt)}.`,
  });
};

/* ------------------------------------------------------------------ report */

const reportTable = (doc, geom, y, head, body, { widths, numeric = [], foot } = {}) => {
  const columns = {};
  if (widths) widths.forEach((weight, i) => { columns[i] = { cellWidth: weight * geom.contentWidth }; });
  numeric.forEach(i => { columns[i] = { ...columns[i], halign: 'right' }; });
  autoTable(doc, {
    startY: y, margin: { left: geom.left, right: MARGIN, top: geom.top + 10, bottom: MARGIN + FOOTER_RESERVE },
    head: [head], body, ...(foot ? { foot: [foot], showFoot: 'lastPage' } : {}),
    theme: 'plain', showHead: 'everyPage', rowPageBreak: 'avoid',
    styles: { font: 'LedgerSans', fontSize: 9, cellPadding: { top: 8, bottom: 8, left: 6, right: 6 }, textColor: BODY, overflow: 'linebreak', valign: 'top', lineColor: HAIRLINE, lineWidth: { bottom: 0.4 } },
    headStyles: { fontStyle: 'bold', fontSize: 8, textColor: INK, fillColor: PANEL, lineWidth: { bottom: 0.7 }, lineColor: RULE_STRONG },
    footStyles: { fontStyle: 'bold', textColor: INK, fillColor: PANEL },
    alternateRowStyles: { fillColor: ZEBRA }, columnStyles: columns,
  });
  return doc.lastAutoTable.finalY + 20;
};

const drawReportSummary = (doc, geom, y, figures) => {
  const columns = Math.min(figures.length, 4);
  const height = Math.ceil(figures.length / columns) * 46 + 10;
  y = ensureSpace(doc, geom, y, height);
  doc.setFillColor(...PANEL);
  doc.roundedRect(geom.left, y, geom.contentWidth, height, 4, 4, 'F');
  const width = (geom.contentWidth - 24) / columns;
  figures.forEach((figure, index) => {
    const x = geom.left + 12 + (index % columns) * width;
    const top = y + 16 + Math.floor(index / columns) * 46;
    label(doc, figure.label, x, top, { maxWidth: width - 12 });
    doc.setFont('LedgerSans', 'bold');
    const size = fitFontSize(doc, figure.value, width - 12, 14, 9);
    value(doc, figure.value, x, top + 21, { bold: true, size });
  });
  return y + height + 20;
};

const reportNote = (doc, geom, y, text) => {
  doc.setFont('LedgerSans', 'normal'); doc.setFontSize(8.5);
  const lines = doc.splitTextToSize(safeText(text), geom.contentWidth);
  y = ensureSpace(doc, geom, y, lines.length * 12 + 16);
  doc.setTextColor(...MUTED); doc.text(lines, geom.left, y);
  return y + lines.length * 12 + 16;
};

const statementForCustomer = (account, options) => {
  const day = date => String(date || '').slice(0, 10);
  const events = [
    ...account.charges.map(c => ({ id: c.id, date: c.occurredDate || day(c.occurredAt), kind: 0, dueDate: c.dueDate,
      description: c.description, reference: '', debit: c.voidedAt ? 0 : Number(c.amount), credit: 0, voidedAt: c.voidedAt, voidReason: c.voidReason })),
    ...account.payments.map(p => ({ id: p.id, date: day(p.paymentDate), kind: 1,
      description: `Repayment - ${p.method}`, reference: p.reference, debit: 0, credit: p.voidedAt ? 0 : Number(p.amount), voidedAt: p.voidedAt, voidReason: p.voidReason })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.kind - b.kind || String(a.id).localeCompare(String(b.id)));
  let openingBalance = 0, balance = 0, totalCharges = 0, totalPayments = 0;
  const rows = [];
  events.forEach(event => {
    if (options.endDate && event.date > options.endDate) return;
    balance = Math.round((balance + event.debit - event.credit) * 100) / 100;
    if (options.startDate && event.date < options.startDate) { openingBalance = balance; return; }
    totalCharges += event.debit; totalPayments += event.credit;
    rows.push({ ...event, balance });
  });
  return { openingBalance, closingBalance: balance, totalCharges, totalPayments, rows };
};

const generatePartyStatementPDF = async (account, settings, options, supplier) => {
  const business = businessFrom(settings), party = supplier ? account.supplier : account.customer;
  const statement = supplier ? account.statement : statementForCustomer(account, options);
  const title = supplier ? 'Supplier Statement' : 'Customer Statement';
  const { doc, geom } = await createCanvas('landscape');
  const logo = settings.logo ? await loadImage(settings.logo) : null;
  let y = drawLetterhead(doc, geom, business, logo, { documentType: title, documentNumber: isoDate() });
  y = drawMetaGrid(doc, geom, [
    { label: supplier ? 'Supplier' : 'Customer', value: party.name }, { label: 'Phone', value: party.phone || '-' },
    { label: 'Period', value: `${options.startDate ? formatDate(options.startDate) : 'Beginning'} to ${options.endDate ? formatDate(options.endDate) : formatDate(new Date())}` },
  ], y);
  y = drawReportSummary(doc, geom, y, [
    { label: 'Opening balance', value: money(statement.openingBalance, business.symbol) },
    { label: supplier ? 'Bills in period' : 'Credit in period', value: money(statement.totalCharges, business.symbol) },
    { label: 'Payments in period', value: money(statement.totalPayments, business.symbol) },
    { label: 'Closing balance', value: money(statement.closingBalance, business.symbol) },
  ]);
  y = reportTable(doc, geom, y, ['Date / due', 'Description / reference', supplier ? 'Bills' : 'Credit', 'Payments', 'Balance'], statement.rows.map(r => [
    `${formatDate(r.date)}${r.dueDate ? `\nDue ${formatDate(r.dueDate)}` : ''}`,
    safeText(`${r.voidedAt ? 'REVERSED: ' : ''}${r.description}${r.reference ? `\nRef ${r.reference}` : ''}${r.voidedAt ? `\n${r.voidReason || ''}` : ''}`),
    r.debit ? money(r.debit, business.symbol) : '-', r.credit ? money(r.credit, business.symbol) : '-', money(r.balance, business.symbol),
  ]), { widths: [.16, .36, .16, .16, .16], numeric: [2, 3, 4], foot: ['Closing balance', '', '', '', money(statement.closingBalance, business.symbol)] });
  reportNote(doc, geom, y, supplier ? 'Bills increase the amount payable. Payments reduce it. Reversed entries have no effect on the running balance.' : 'Credit amounts exclude deposits received at sale. Later repayments reduce the balance. Reversed entries have no effect on the running balance.');
  drawFooters(doc, geom, business, { leftText: `${business.name} - ${title} - ${party.name}` });
  doc.setProperties({ title: `${title} - ${party.name}`, author: business.name });
  return deliver(doc, `${slugify(party.name)}-${slugify(title)}-${isoDate()}.pdf`, { title, text: `Account statement from ${business.name}` });
};

export const generateCreditStatementPDF = (account, settings = {}, options = {}) => generatePartyStatementPDF(account, settings, options, false);
export const generateSupplierStatementPDF = (account, settings = {}, options = {}) => generatePartyStatementPDF(account, settings, options, true);

export const generateSalesReportPDF = async (report, settings = {}, options = {}) => {
  if (!report.complete) throw new Error('Load all matching sales before exporting this report.');
  const business = businessFrom(settings), title = 'Sales Register';
  const { doc, geom } = await createCanvas('landscape');
  const logo = settings.logo ? await loadImage(settings.logo) : null;
  let y = drawLetterhead(doc, geom, business, logo, { documentType: title, documentNumber: formatDate(report.generatedAt) });
  y = drawMetaGrid(doc, geom, [
    { label: 'Period', value: `${formatDate(report.filters.startDate)} to ${formatDate(report.filters.endDate)}` },
    { label: 'Prepared by', value: options.preparedBy || '-' },
    { label: 'Filters', value: [report.filters.customer, report.filters.productId ? report.products?.find(p => p.id === report.filters.productId)?.name : '', report.filters.paymentType, report.filters.status].filter(Boolean).join(' / ') || 'All sales' },
  ], y);
  y = drawReportSummary(doc, geom, y, [
    { label: `${report.summary.count} sales`, value: money(report.summary.totalSales, business.symbol) },
    { label: 'Received to date', value: money(report.summary.received, business.symbol) },
    { label: 'Outstanding to date', value: money(report.summary.outstanding, business.symbol) },
    { label: 'Gross profit', value: money(report.summary.grossProfit, business.symbol) },
  ]);
  y = reportNote(doc, geom, y, `${report.balanceBasis} Gross profit excludes operating expenses. All ${report.rows.length} matching sales are included. Reporting timezone: ${report.timezone}.`);
  reportTable(doc, geom, y, ['Date / receipt', 'Customer / rice', 'Quantity', 'Rate', 'Sale', 'Received', 'Due', 'Status'], report.rows.map(r => [
    `${formatDate(r.date)}\n${r.reference || String(r.id).slice(-8).toUpperCase()}`,
    safeText(`${r.customer || 'Walk-in customer'}\n${r.productName}`), safeText(formatQuantity(r.quantity, r.unit)),
    money(r.rate, business.symbol), money(r.total, business.symbol), money(r.received, business.symbol), money(r.outstanding, business.symbol),
    `${r.status}\n${r.paymentType}${r.dueDate ? `\n${formatDate(r.dueDate)}` : ''}`,
  ]), { widths: [.12, .22, .09, .09, .12, .12, .12, .12], numeric: [2, 3, 4, 5, 6] });
  drawFooters(doc, geom, business, { leftText: `${business.name} - ${title} - ${report.filters.startDate} to ${report.filters.endDate}` });
  doc.setProperties({ title: `${title} - ${business.name}`, author: business.name });
  return deliver(doc, `${slugify(business.name)}-sales-${report.filters.startDate}-${report.filters.endDate}.pdf`, { title, text: `Complete sales register from ${business.name}` });
};

export const generateDailyClosingPDF = async (report, settings = {}, options = {}) => {
  const business = businessFrom(settings), title = 'Daily Closing';
  const { doc, geom } = await createCanvas('portrait');
  const logo = settings.logo ? await loadImage(settings.logo) : null;
  let y = drawLetterhead(doc, geom, business, logo, { documentType: title, documentNumber: formatDate(report.date) });
  y = drawMetaGrid(doc, geom, [{ label: 'Business day', value: `${formatDate(report.date)} / ${report.timezone}` }, { label: 'Prepared by', value: options.preparedBy || '-' }, { label: 'Generated', value: formatDateTime(report.generatedAt) }], y);
  y = drawReportSummary(doc, geom, y, [
    { label: 'Opening funds', value: money(report.openingBalance, business.symbol) }, { label: 'Money in', value: money(report.moneyIn, business.symbol) },
    { label: 'Money out', value: money(report.moneyOut, business.symbol) }, { label: 'Closing funds', value: money(report.closingBalance, business.symbol) },
  ]);
  y = reportNote(doc, geom, y, `${report.balanceBasis} ${report.profitBasis}`);
  y = reportTable(doc, geom, y, ['Payment method', 'Opening', 'In', 'Out', 'Closing'], report.methods.map(r => [r.method === 'unclassified' ? 'Unclassified / legacy' : r.method, money(r.openingBalance, business.symbol), money(r.moneyIn, business.symbol), money(r.moneyOut, business.symbol), money(r.closingBalance, business.symbol)]), { widths: [.28, .18, .18, .18, .18], numeric: [1, 2, 3, 4] });
  y = drawReportSummary(doc, geom, y, [
    { label: 'Sales booked', value: money(report.sales.total, business.symbol) }, { label: 'Credit sales', value: money(report.sales.creditSales, business.symbol) },
    { label: 'Old debt collected', value: money(report.collectionsFromEarlierDebt, business.symbol) }, { label: 'Gross profit', value: money(report.sales.grossProfit, business.symbol) },
  ]);
  if (report.categories.length) reportTable(doc, geom, y, ['Direction', 'Category', 'Entries', 'Amount'], report.categories.map(r => [r.direction === 'in' ? 'Money in' : 'Money out', safeText(r.category), String(r.count), money(r.amount, business.symbol)]), { widths: [.18, .46, .12, .24], numeric: [2, 3] });
  else reportNote(doc, geom, y, 'No money moved on this date.');
  drawFooters(doc, geom, business, { leftText: `${business.name} - ${title} - ${report.date}` });
  doc.setProperties({ title: `${title} - ${report.date} - ${business.name}`, author: business.name });
  return deliver(doc, `${slugify(business.name)}-daily-closing-${report.date}.pdf`, { title, text: `Daily closing from ${business.name}` });
};

const REPORT_TITLE = 'Inventory Report';
const REPORT_ABOUT =
  'A valuation of every product currently in stock: the quantity on hand, what it cost to buy, ' +
  'what it is priced to sell for, and the profit still sitting on the shelf.';

/**
 * @param options.generatedAt  when the report was run (defaults to now)
 * @param options.preparedBy   name of the user who ran it, printed on the document
 * @param options.periodLabel  the range the figures cover, when one applies
 */
export const generateInventoryReportPDF = async (
  products = [],
  summary = {},
  settings = {},
  options = {}
) => {
  const business = businessFrom(settings);
  const logo = settings.logo ? await loadImage(settings.logo) : null;

  const generatedAt = asDate(options.generatedAt) || new Date();
  const stamp = isoDate(generatedAt);

  // Landscape: eight columns need the width to stay readable.
  const { doc, geom } = await createCanvas('landscape');

  doc.setProperties({
    title: `${REPORT_TITLE} - ${business.name} - ${formatDate(generatedAt)}`,
    subject: `${REPORT_ABOUT} Prepared for ${business.name}.`,
    keywords: ['inventory', 'stock valuation', business.name, stamp].join(', '),
    creator: business.name,
    author: business.name,
  });

  let y = drawLetterhead(doc, geom, business, logo, {
    documentType: REPORT_TITLE,
    documentNumber: formatDate(generatedAt),
  });

  /* What this document is, who it belongs to and when it was run. Without this
     block a printed report is undatable the moment it leaves the screen, and a
     shared PDF gives no clue which business it came from. */
  y = drawMetaGrid(
    doc,
    geom,
    [
      { label: 'Report', value: REPORT_TITLE },
      { label: 'Business', value: business.name },
      { label: 'About this business', value: business.description || '-' },
      { label: 'Generated', value: formatDateTime(generatedAt) },
      { label: options.periodLabel ? 'Period covered' : 'Position as at', value: options.periodLabel || formatDate(generatedAt) },
      { label: 'Prepared by', value: options.preparedBy || '-' },
    ],
    y,
    { columns: 3 }
  );

  doc.setFont('LedgerSans', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  const aboutLines = doc.splitTextToSize(safeText(REPORT_ABOUT), geom.contentWidth);
  doc.text(aboutLines, geom.left, y);
  y += aboutLines.length * 11 + 12;

  rule(doc, geom, y);
  y += 20;

  /* Summary strip: four figures, separated by whitespace instead of boxes. Each
     is bounded by its own column and shrinks rather than running into the next. */
  const figures = [
    { label: 'Products', value: String(summary.productCount ?? products.length) },
    { label: 'Stock at cost', value: money(summary.totalValue, business.symbol) },
    { label: 'Stock at retail', value: money(summary.totalPotentialValue, business.symbol) },
    { label: 'Potential profit', value: money(summary.totalPotentialProfit, business.symbol) },
  ];

  const figureWidth = geom.contentWidth / figures.length;
  const figureBudget = figureWidth - 18;

  figures.forEach((figure, index) => {
    const x = geom.left + index * figureWidth;
    label(doc, figure.label, x, y, { maxWidth: figureBudget });

    doc.setFont('LedgerSans', 'bold');
    const size = fitFontSize(doc, figure.value, figureBudget, 13, 8.5);
    value(doc, figure.value, x, y + 17, { size, bold: true });
  });

  y += 32;
  rule(doc, geom, y);
  y += 18;

  /* Table. Column widths are proportions of the content width so they always
     sum to the printable area exactly — no reliance on autoTable's auto sizing,
     which can push the last column past the margin on wide data. */
  const weights = [0.19, 0.1, 0.105, 0.115, 0.1, 0.13, 0.13, 0.13];
  const cellPadX = 6;
  const numericColumns = new Set([3, 4, 5, 6, 7]);

  const columnStyles = weights.reduce((styles, weight, index) => {
    styles[index] = { cellWidth: weight * geom.contentWidth };
    return styles;
  }, {});

  Object.assign(columnStyles[0], { textColor: INK, fontStyle: 'bold' });
  numericColumns.forEach((index) => Object.assign(columnStyles[index], { halign: 'right' }));
  Object.assign(columnStyles[5], { textColor: INK, fontStyle: 'bold' });

  // Measure against the widest face the table uses, so normal-weight cells that
  // reuse this calculation are never underestimated.
  doc.setFont('LedgerSans', 'bold');

  autoTable(doc, {
    startY: y,
    margin: { left: geom.left, right: MARGIN, top: geom.top, bottom: MARGIN + FOOTER_RESERVE },
    head: [['Product', 'SKU', 'Category', 'Stock', 'Cost', 'Value', 'Retail', 'Profit']],
    body: products.map((product) => [
      safeText(product.name),
      safeText(product.sku || '-'),
      safeText(product.category),
      safeText(formatQuantity(product.currentStock, product.unit)),
      money(product.costPrice, business.symbol),
      money(product.stockValue, business.symbol),
      money(product.potentialValue, business.symbol),
      money(product.potentialProfit, business.symbol),
    ]),
    foot: [
      [
        { content: 'Total', colSpan: 5, styles: { halign: 'left' } },
        money(summary.totalValue, business.symbol),
        money(summary.totalPotentialValue, business.symbol),
        money(summary.totalPotentialProfit, business.symbol),
      ],
    ],
    theme: 'plain',
    // Repeat the header on every page, and never split one product across two.
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'LedgerSans',
      fontSize: 8.5,
      textColor: BODY,
      cellPadding: { top: 7, bottom: 7, left: 6, right: 6 },
      lineColor: HAIRLINE,
      lineWidth: { bottom: 0.5 },
      // Wrap instead of ellipsizing: a report that hides part of its own data
      // is worse than one that runs a line taller.
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fontSize: 7.5,
      fontStyle: 'bold',
      textColor: MUTED,
      fillColor: false,
      lineWidth: { bottom: 0.8 },
      lineColor: RULE_STRONG,
    },
    footStyles: {
      fontSize: 9,
      fontStyle: 'bold',
      textColor: INK,
      fillColor: false,
      lineWidth: { top: 0.8 },
      lineColor: RULE_STRONG,
    },
    // A very light zebra keeps long rows trackable across eight columns without
    // painting the page.
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles,
    /**
     * A money figure that wraps reads as two broken fragments — "Rs." on one
     * line and the digits on the next. Numeric cells step their type down until
     * the value fits on a single line instead.
     */
    didParseCell: (data) => {
      if (data.section === 'head' || !numericColumns.has(data.column.index)) return;

      const text = Array.isArray(data.cell.text) ? data.cell.text.join(' ') : String(data.cell.text ?? '');
      if (!text) return;

      const available = weights[data.column.index] * geom.contentWidth - cellPadX * 2;
      const unitWidth = doc.getStringUnitWidth(text);
      let size = data.cell.styles.fontSize;

      while (size > 6 && unitWidth * size > available) size -= 0.25;

      data.cell.styles.fontSize = size;
    },
  });

  // Every page carries the business, the document type and the date, so a page
  // that gets separated from the rest can still be identified.
  drawFooters(doc, geom, business, {
    leftText: `${business.name} - ${REPORT_TITLE} - ${formatDate(generatedAt)}`,
  });

  const filename = `${slugify(business.name, 'inventory')}-inventory-report-${stamp}.pdf`;

  return deliver(doc, filename, {
    title: `${REPORT_TITLE} - ${business.name}`,
    text: `${REPORT_TITLE} for ${business.name}, generated ${formatDate(generatedAt)}.`,
  });
};
