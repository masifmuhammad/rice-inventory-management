import { format as formatDate } from 'date-fns';

/**
 * Date helpers that stay in the user's own timezone.
 *
 * `toISOString()` is UTC. Pakistan is UTC+5, so between midnight and 05:00 local
 * time it reports *yesterday* — which is how a sale recorded at 01:30 ended up
 * dated to the previous day, landing in the wrong month's totals, and how a
 * date picker capped at `max={today()}` refused to let anyone select today.
 */

/** Local calendar date as `YYYY-MM-DD`, suitable for an `<input type="date">`. */
export const toDateInput = (date = new Date()) => {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';

  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate()
  ).padStart(2, '0')}`;
};

/** Today, in the user's timezone. */
export const todayInput = () => toDateInput(new Date());

/** `YYYY-MM-DD` for `n` days ago, in the user's timezone. */
export const daysAgoInput = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateInput(date);
};

/**
 * Formats a date, returning `fallback` instead of throwing when the value is
 * missing or unparseable.
 *
 * `date-fns` `format()` raises a RangeError on an Invalid Date rather than
 * rendering "Invalid Date", so a single malformed row used to replace the entire
 * page with the error boundary instead of one bad cell.
 */
export const formatSafe = (value, pattern, fallback = 'Unknown date') => {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : formatDate(date, pattern);
};

/** True when a value parses to a real date. */
export const isValidDate = (value) => {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime());
};
