// Money and quantity formatting. Pakistani Rupees by default; the symbol is
// configurable so a business can change it in Settings without a code change.

const DEFAULT_SYMBOL = 'Rs.';

const toNumber = (value) => {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(n) ? n : null;
};

/**
 * Formats an amount as currency.
 * Invalid input formats as zero rather than rendering "NaN" in the UI.
 */
export const formatMoney = (amount, symbol = DEFAULT_SYMBOL, showSymbol = true) => {
  const value = toNumber(amount) ?? 0;

  const formatted = value.toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return showSymbol ? `${symbol} ${formatted}` : formatted;
};

export const formatPKR = (amount, showSymbol = true) =>
  formatMoney(amount, DEFAULT_SYMBOL, showSymbol);

/**
 * Short form for stat cards, using the South Asian scale that Pakistani
 * businesses actually read in: thousands, Lac (100k) and Crore (10m).
 */
export const formatCompactMoney = (amount, symbol = DEFAULT_SYMBOL) => {
  const value = toNumber(amount) ?? 0;
  const magnitude = Math.abs(value);

  let formatted;
  if (magnitude >= 10000000) formatted = `${(value / 10000000).toFixed(2)} Cr`;
  else if (magnitude >= 100000) formatted = `${(value / 100000).toFixed(2)} Lac`;
  else if (magnitude >= 1000) formatted = `${(value / 1000).toFixed(1)}K`;
  else formatted = value.toFixed(2);

  return `${symbol} ${formatted}`;
};

export const formatCompactPKR = (amount) => formatCompactMoney(amount, DEFAULT_SYMBOL);

/** Parses a formatted string back to a number. */
export const parseMoney = (value) => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return parseFloat(String(value).replace(/[^0-9.-]/g, '')) || 0;
};

export const parsePKR = parseMoney;

/** Quantity with its unit, trimming trailing zeros (`12 kg`, not `12.00 kg`). */
export const formatQuantity = (quantity, unit = '') => {
  const value = toNumber(quantity) ?? 0;

  const formatted = value.toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return unit ? `${formatted} ${unit}` : formatted;
};

export const formatNumber = (value, maximumFractionDigits = 0) =>
  (toNumber(value) ?? 0).toLocaleString('en-PK', { maximumFractionDigits });

export const formatPercentage = (value, decimals = 1) => {
  const n = toNumber(value);
  return n === null ? '0%' : `${n.toFixed(decimals)}%`;
};

/** Profit margin as a percentage of the selling price. */
export const marginPercent = (costPrice, sellingPrice) => {
  const cost = toNumber(costPrice) ?? 0;
  const sell = toNumber(sellingPrice) ?? 0;
  if (sell <= 0) return 0;
  return ((sell - cost) / sell) * 100;
};
