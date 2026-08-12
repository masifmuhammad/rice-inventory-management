import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatMoney, formatQuantity } from './currency';

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
const FAINT = [156, 163, 175];
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
 * jsPDF's built-in fonts are WinAnsi-encoded. Anything outside that range draws
 * as a wrong glyph, so unsupported characters are folded to safe equivalents
 * rather than silently corrupting the page. Newlines survive, because callers
 * rely on them to break notes into paragraphs.
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
    .replace(/[^\x20-\xFF\n]/g, '');
};

const money = (amount, symbol) => safeText(formatMoney(amount, symbol));

/* ------------------------------------------------------------------ canvas */

/**
 * Page geometry. Keeping this in one object means the landscape report reuses
 * exactly the same containment logic as the portrait receipt, instead of the
 * two swapping width and height by hand at each call site.
 */
const createCanvas = (orientation = 'portrait') => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation });
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
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(size);
  doc.setTextColor(...color);
  doc.setCharSpace(0.8);

  const content = safeText(text).toUpperCase();
  doc.text(maxWidth ? fitLines(doc, content, maxWidth, 1) : content, x, y, { align });

  doc.setCharSpace(0);
};

const value = (doc, text, x, y, { align = 'left', size = 10, bold = false, color = INK, maxWidth } = {}) => {
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
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

const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const formatTime = (date) =>
  new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

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

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  const nameLines = fitLines(doc, business.name, identityWidth, 2);
  doc.text(nameLines, textX, top + 14);

  let subY = top + 14 + nameLines.length * 16;

  doc.setFont('helvetica', 'normal');
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

  doc.setFont('helvetica', 'bold');
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

    doc.setFont('helvetica', 'normal');
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

    doc.setFont('helvetica', 'normal');
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

  const { doc, geom } = createCanvas('portrait');

  const isSale = transaction.type === 'stock_out';
  const documentType = isSale
    ? 'Sales Receipt'
    : transaction.type === 'stock_in'
      ? 'Goods Received'
      : 'Stock Adjustment';
  const receiptNumber = `${business.prefix}-${String(transaction._id).slice(-8).toUpperCase()}`;

  doc.setProperties({
    title: `${documentType} ${receiptNumber}`,
    subject: product?.name || 'Inventory transaction',
    creator: business.name,
    author: business.name,
  });

  let y = drawLetterhead(doc, geom, business, logo, { documentType, documentNumber: receiptNumber });

  /* Parties and dates */
  y = drawMetaGrid(
    doc,
    geom,
    [
      { label: 'Date', value: `${formatDate(transaction.createdAt)}, ${formatTime(transaction.createdAt)}` },
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
      font: 'helvetica',
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

  const totalLabel = isSale ? 'Total received' : 'Total value';
  label(doc, totalLabel, panelX + panelPad, y + 18, { maxWidth: panelWidth - panelPad * 2 });

  // Shrink to fit rather than overflow the panel it sits in.
  const totalText = money(transaction.totalValue, business.symbol);
  doc.setFont('helvetica', 'bold');
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

  /* Free-text blocks. Each measures itself first and moves to a new page whole,
     rather than being clipped by the footer. */
  const drawTextBlock = (heading, text, { size, color }) => {
    if (!text) return;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(safeText(text), geom.contentWidth);
    const lineHeight = size * 1.35;

    y = ensureSpace(doc, geom, y, 14 + lines.length * lineHeight + 12);

    label(doc, heading, geom.left, y);
    doc.setFont('helvetica', 'normal');
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

  doc.save(`${receiptNumber}.pdf`);
  return true;
};

/* ------------------------------------------------------------------ report */

export const generateInventoryReportPDF = async (products = [], summary = {}, settings = {}) => {
  const business = businessFrom(settings);
  const logo = settings.logo ? await loadImage(settings.logo) : null;

  // Landscape: eight columns need the width to stay readable.
  const { doc, geom } = createCanvas('landscape');

  doc.setProperties({
    title: `Inventory report ${formatDate(new Date())}`,
    subject: `Stock position for ${business.name}`,
    creator: business.name,
    author: business.name,
  });

  let y = drawLetterhead(doc, geom, business, logo, {
    documentType: 'Inventory Report',
    documentNumber: formatDate(new Date()),
  });

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

    doc.setFont('helvetica', 'bold');
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
  doc.setFont('helvetica', 'bold');

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
      font: 'helvetica',
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

  drawFooters(doc, geom, business, { leftText: `${business.name} - inventory report` });

  doc.save(`inventory-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  return true;
};
