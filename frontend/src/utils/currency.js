// Currency formatting utilities for Pakistani Rupees (PKR)

/**
 * Format number as Pakistani Rupees
 * @param {number} amount - Amount to format
 * @param {boolean} showSymbol - Whether to show currency symbol
 * @returns {string} Formatted currency string
 */
export const formatPKR = (amount, showSymbol = true) => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return showSymbol ? 'Rs. 0.00' : '0.00';
  }

  const formatted = Number(amount).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return showSymbol ? `Rs. ${formatted}` : formatted;
};

/**
 * Format number as compact PKR (e.g., 1.5M, 2.3K)
 * @param {number} amount - Amount to format
 * @returns {string} Compact formatted currency string
 */
export const formatCompactPKR = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'Rs. 0';
  }

  const absAmount = Math.abs(amount);
  let formatted;

  if (absAmount >= 10000000) {
    // 10 Million+
    formatted = (amount / 10000000).toFixed(2) + ' Cr';
  } else if (absAmount >= 100000) {
    // 100 Thousand+
    formatted = (amount / 100000).toFixed(2) + ' Lac';
  } else if (absAmount >= 1000) {
    // 1 Thousand+
    formatted = (amount / 1000).toFixed(1) + 'K';
  } else {
    formatted = amount.toFixed(2);
  }

  return `Rs. ${formatted}`;
};

/**
 * Parse PKR string to number
 * @param {string} pkrString - PKR formatted string
 * @returns {number} Parsed number
 */
export const parsePKR = (pkrString) => {
  if (!pkrString) return 0;

  // Remove currency symbol and commas
  const cleaned = pkrString.replace(/Rs\.?|,|\s/g, '');
  return parseFloat(cleaned) || 0;
};

/**
 * Format quantity with unit
 * @param {number} quantity - Quantity value
 * @param {string} unit - Unit of measurement
 * @returns {string} Formatted quantity string
 */
export const formatQuantity = (quantity, unit) => {
  if (quantity === null || quantity === undefined || isNaN(quantity)) {
    return `0 ${unit}`;
  }

  const formatted = Number(quantity).toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  return `${formatted} ${unit}`;
};

/**
 * Format percentage
 * @param {number} value - Percentage value
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage string
 */
export const formatPercentage = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%';
  }

  return `${Number(value).toFixed(decimals)}%`;
};
