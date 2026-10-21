const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.REPORT_TIMEZONE = 'Asia/Karachi';
const { dateRange, dayStart } = require('./dates');

test('calendar dates use the business timezone on a UTC server', () => {
  assert.equal(dayStart('2026-10-21').toISOString(), '2026-10-20T19:00:00.000Z');
  const range = dateRange({ startDate: '2026-10-21', endDate: '2026-10-21' });
  assert.equal(range.$gte.toISOString(), '2026-10-20T19:00:00.000Z');
  assert.equal(range.$lte.toISOString(), '2026-10-21T18:59:59.999Z');
});
test('invalid and reversed dates produce a user error', () => {
  for (const startDate of ['bad', '2026-02-30', '2026-10-21T12:00:00', ['2026-10-21']]) {
    assert.throws(() => dateRange({ startDate }), { status: 400 });
  }
  assert.throws(() => dateRange({ startDate: '2026-10-22', endDate: '2026-10-21' }), { status: 400 });
});
test('explicit timestamps preserve their instant', () => {
  assert.equal(dateRange({ startDate: '2026-10-21T02:00:00+05:00' }).$gte.toISOString(), '2026-10-20T21:00:00.000Z');
});
