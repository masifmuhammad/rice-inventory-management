// Match ledger rounding without floating-point half-paisa errors.
export const roundDecimal = (value, places = 2) => {
  const shift = (number, count) => { const [base, exponent = '0'] = String(number).split('e'); return Number(`${base}e${Number(exponent) + count}`); };
  const sign = value < 0 ? -1 : 1;
  return sign * shift(Math.round(shift(Math.abs(value), places)), -places);
};
