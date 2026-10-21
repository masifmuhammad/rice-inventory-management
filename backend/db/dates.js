const { reportTimezone } = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: reportTimezone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const parts = (date) => Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
const localDay = (date = new Date()) => {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}`;
};

const dayStart = (day) => {
  const target = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 10) !== day) {
    throw new ApiError(400, 'Enter a valid calendar date.');
  }
  let utc = target;
  for (let i = 0; i < 4; i++) {
    const p = parts(new Date(utc));
    const wall = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    const delta = target - wall;
    utc += delta;
    if (!delta) break;
  }
  return new Date(utc);
};

const shiftDay = (day, count) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};

const boundary = (value, end = false) => {
  if (typeof value !== 'string') throw new ApiError(400, 'Enter a valid date.');
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const start = dayStart(value);
    return end ? new Date(dayStart(shiftDay(value, 1)).getTime() - 1) : start;
  }
  // Full timestamps must include an offset so the host timezone is irrelevant.
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new ApiError(400, 'Use a calendar date or a timestamp with a timezone.');
  }
  return new Date(value);
};

const dateRange = ({ startDate, endDate }, defaultDays) => {
  const range = {};
  if (startDate) range.$gte = boundary(startDate);
  if (endDate) range.$lte = boundary(endDate, true);
  if (!startDate && !endDate && defaultDays !== undefined) range.$gte = dayStart(shiftDay(localDay(), -defaultDays));
  if (range.$gte && range.$lte && range.$gte > range.$lte) throw new ApiError(400, 'Start date must be before the end date.');
  return range;
};

module.exports = { dateRange, boundary, dayStart, shiftDay, localDay };
