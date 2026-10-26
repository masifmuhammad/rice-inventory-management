const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

test('report filters reject ambiguous dates and invalid pagination', () => {
  const { reportFilters } = require('../services/reporting');
  for (const query of [{ startDate: '2026-02-30' }, { startDate: '2026-10-30', endDate: '2026-10-01' }, { page: '-1' }, { limit: '1000' }, { paymentType: 'all' }, { status: 'overdue' }, { productId: 'invalid' }]) {
    assert.throws(() => reportFilters(query), error => error.status === 400);
  }
  assert.equal(reportFilters({ startDate: '2026-10-01', endDate: '2026-10-26', export: 'all' }).all, true);
});

test('sales register and daily closing reconcile complete business-scoped records', { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  assert.match(new URL(process.env.TEST_DATABASE_URL).pathname, /test|readiness/i);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'report-tests-secret-at-least-32-characters';
  process.env.OPENROUTER_API_KEY = '';
  const { connectDB, closeDB, getPool } = require('../config/db');
  const { dayStart, localDay, shiftDay } = require('../db/dates');
  const Business = require('../models/Business'); const User = require('../models/User'); const Product = require('../models/Product');
  const { createMovement } = require('../services/stockLedger');
  const { salesRegister, dailyClosing } = require('../services/reporting');
  const app = require('../server');
  await connectDB({ retries: 1 }); const pool = getPool();
  const suffix = randomUUID();
  const business = await Business.create({ name: `Reports ${suffix}` });
  const other = await Business.create({ name: `Other reports ${suffix}` });
  const admin = await User.create({ businessId: business.id, name: 'Report Admin', email: `${suffix}@reports.test`, password: 'Reports-password-42', role: 'admin', status: 'active' });
  const product = await Product.create({ businessId: business.id, createdBy: admin.id, name: 'Report rice', unit: 'kg', category: 'Basmati', currentStock: 10000, costPrice: 10, sellingPrice: 15 });
  const date = localDay(), previous = shiftDay(date, -1);
  const range = { startDate: date, endDate: date };
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let token;
  const request = async (path, method = 'GET', body, auth = token) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  try {
    token = (await request('/api/auth/login', 'POST', { email: admin.email, password: 'Reports-password-42' })).data.token;
    const customer = (await request('/api/credit/customers', 'POST', { name: 'Report customer', openingBalance: 100, dueDate: previous })).data;
    await pool.query('UPDATE credit_charges SET occurred_at=$1 WHERE customer_id=$2', [dayStart(previous), customer.id]);
    const cash = await createMovement({ product: product.id, type: 'stock_out', quantity: 10, customer: 'Cash buyer', reference: 'PAID-1' }, business.id, admin);
    const credit = await createMovement({ product: product.id, type: 'stock_out', quantity: 20, paymentType: 'credit', customerId: customer.id, dueDate: date, amountReceived: 50 }, business.id, admin);
    const repayment = await request(`/api/credit/customers/${customer.id}/payments`, 'POST', { requestId: randomUUID(), amount: 150, paymentDate: date, method: 'bank' });
    assert.equal(repayment.status, 201, JSON.stringify(repayment));
    await pool.query(`INSERT INTO cash_entries (business_id,direction,amount,category,purpose,occurred_at,created_by,payment_method)
      VALUES ($1,'in',500,'Owner funds','Opening funds',$2,$3,'cash'),($1,'out',30,'Transport','Delivery expense',$4,$3,'cash')`, [business.id, dayStart(previous), admin.id, dayStart(date)]);
    // Explicit old records without methods remain unclassified, never silently cash.
    await pool.query(`INSERT INTO cash_entries (business_id,direction,amount,category,purpose,occurred_at,created_by)
      VALUES ($1,'in',70,'Owner funds','Legacy funds',$2,$3)`, [business.id, dayStart(previous), admin.id]);
    await pool.query('UPDATE cash_entries SET payment_method=$1 WHERE transaction_id=ANY($2::uuid[])', ['cash', [cash.id, credit.id]]);
    await t.test('sales show deposits, later allocation and remaining debt without duplicate rows', async () => {
      const report = await salesRegister(business.id, range);
      assert.equal(report.summary.count, 2); assert.equal(report.summary.totalSales, 450);
      assert.equal(report.summary.receivedAtSale, 200); assert.equal(report.summary.repayments, 50);
      assert.equal(report.summary.received, 250); assert.equal(report.summary.outstanding, 200); assert.equal(report.summary.grossProfit, 150);
      assert.equal(report.rows.find(row => row.id === credit.id).status, 'partial');
      assert.equal((await salesRegister(business.id, { ...range, status: 'paid' })).summary.count, 1);
      assert.equal((await salesRegister(business.id, { ...range, customer: 'Report', paymentType: 'credit', productId: product.id })).summary.totalSales, 300);
      assert.equal((await salesRegister(other.id, range)).summary.totalSales, 0);
    });
    await t.test('closing separates old-debt collections and reconciles every method', async () => {
      const report = await dailyClosing(business.id, { date });
      assert.equal(report.openingBalance, 570); assert.equal(report.moneyIn, 350); assert.equal(report.moneyOut, 30); assert.equal(report.closingBalance, 890);
      assert.equal(report.sales.total, 450); assert.equal(report.sales.deposits, 50); assert.equal(report.collectionsFromEarlierDebt, 100);
      assert.equal(report.methods.find(row => row.method === 'bank').moneyIn, 150);
      assert.equal(report.methods.find(row => row.method === 'unclassified').openingBalance, 70);
      assert.equal(report.methods.reduce((sum, row) => sum + row.closingBalance, 0), report.closingBalance);
      assert.equal((await dailyClosing(other.id, { date })).closingBalance, 0);
    });
    await t.test('exports exceed the old 1000-sale cap; pages and filtered totals agree', async () => {
      await pool.query(`INSERT INTO transactions (business_id,type,product_id,quantity,unit,price,total_value,customer,created_by,stock_before,stock_after,cost_price_snapshot,created_at)
        SELECT $1,'stock_out',$2,1,'kg',15,15,'Bulk buyer',$3,10000-n,9999-n,10,$4 FROM generate_series(1,1005) n`, [business.id, product.id, admin.id, dayStart(date)]);
      const first = await salesRegister(business.id, { ...range, limit: '50' });
      const all = await salesRegister(business.id, { ...range, export: 'all' });
      assert.equal(first.rows.length, 50); assert.equal(first.complete, false);
      assert.equal(all.rows.length, 1007); assert.equal(all.complete, true);
      assert.equal(all.rows.reduce((sum, row) => sum + row.total, 0), all.summary.totalSales);
      assert.equal(first.summary.totalSales, all.summary.totalSales);
      const last = await salesRegister(business.id, { ...range, page: '999' });
      assert.equal(last.pagination.page, 21); assert.equal(last.rows.length, 7);
      assert.equal((await salesRegister(business.id, { ...range, customer: '%' })).summary.count, 0);
    });
    await t.test('routes reject invalid filters and deny workers access', async () => {
      assert.equal((await request('/api/reports/sales-register?startDate=2026-02-30')).status, 400);
      assert.equal((await request('/api/reports/daily-closing?date=invalid')).status, 400);
      assert.equal((await request(`/api/reports/sales-register?startDate=${date}&endDate=${date}`)).data.summary.count, 1007);
      const worker = await User.create({ businessId: business.id, name: 'Report Worker', email: `worker-${suffix}@reports.test`, password: 'Reports-password-42', role: 'worker', status: 'active' });
      const workerToken = (await request('/api/auth/login', 'POST', { email: worker.email, password: 'Reports-password-42' })).data.token;
      assert.equal((await request('/api/reports/sales-register', 'GET', null, workerToken)).status, 403);
      assert.equal((await request('/api/reports/daily-closing', 'GET', null, workerToken)).status, 403);
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    const ids = [business.id, other.id];
    await pool.query('DELETE FROM cash_entries WHERE business_id=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM credit_allocations WHERE payment_id IN (SELECT id FROM credit_payments WHERE business_id=ANY($1::uuid[]))', [ids]);
    for (const table of ['credit_payments', 'credit_charges', 'transactions', 'products', 'credit_customers', 'audit_logs', 'users']) await pool.query(`DELETE FROM ${table} WHERE business_id=ANY($1::uuid[])`, [ids]);
    await pool.query('DELETE FROM businesses WHERE id=ANY($1::uuid[])', [ids]); await closeDB();
  }
});
