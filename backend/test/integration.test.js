const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

// Never fall back to DATABASE_URL: this suite writes only to an explicit test DB.
test('production API workflows with PostgreSQL', { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const testUrl = new URL(process.env.TEST_DATABASE_URL);
  assert.match(testUrl.pathname, /(?:test|readiness)/i, 'Use a dedicated test database');
  process.env.NODE_ENV = 'test';
  process.env.OPENROUTER_API_KEY = '';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.JWT_SECRET = 'integration-test-secret-at-least-32-characters';
  const { connectDB, closeDB, getPool, isDbReady } = require('../config/db');
  const Business = require('../models/Business');
  const User = require('../models/User');
  const Product = require('../models/Product');
  const app = require('../server');
  await connectDB({ retries: 1 });
  const pool = getPool();
  const suffix = randomUUID();
  const business = await Business.create({ name: `Test ${suffix}` });
  const other = await Business.create({ name: `Other ${suffix}` });
  const admin = await User.create({ businessId: business.id, name: 'Test Admin', email: `${suffix}@example.test`, password: 'Test-password-42', role: 'admin', status: 'active' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let token;
  const request = async (path, { method = 'GET', body, auth = token, ...options } = {}) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), ...options });
    const data = await response.json();
    return { status: response.status, data, headers: response.headers };
  };
  const productBody = { name: 'Basmati 50% (premium)', category: 'Basmati', unit: 'kg', currentStock: 100, minStockLevel: 5, costPrice: 10, sellingPrice: 15 };
  let product;
  try {
    await t.test('login tokens work immediately and after password changes', async () => {
      let login = await request('/api/auth/login', { method: 'POST', body: { email: admin.email, password: 'Test-password-42' } });
      assert.equal(login.status, 200, JSON.stringify(login.data));
      token = login.data.token;
      assert.equal((await request('/api/auth/me')).status, 200);
      const previous = token;
      const changed = await request('/api/auth/me/password', { method: 'PUT', body: { currentPassword: 'Test-password-42', newPassword: 'New-password-43' } });
      assert.equal(changed.status, 200, JSON.stringify(changed.data));
      token = changed.data.token;
      assert.equal((await request('/api/auth/me')).status, 200);
      assert.equal((await request('/api/auth/me', { auth: previous })).status, 401);
      // Saving this same model twice must not bcrypt-hash a hash.
      const user = await User.findById(admin.id, { select: '+password' });
      user.password = 'New-password-44';
      await user.save();
      user.name = 'Updated Admin';
      await user.save();
      login = await request('/api/auth/login', { method: 'POST', body: { email: admin.email, password: 'New-password-44' } });
      assert.equal(login.status, 200, JSON.stringify(login.data));
      token = login.data.token;
    });
    await t.test('health, private API caching and tenant isolation', async () => {
      assert.equal(await isDbReady(), true);
      assert.equal((await request('/api/health')).status, 200);
      assert.equal((await request('/api/products', { auth: null })).status, 401);
      const response = await request('/api/products', { method: 'POST', body: productBody });
      assert.equal(response.status, 201, JSON.stringify(response.data));
      product = response.data;
      assert.match(response.headers.get('cache-control'), /no-store/);
      const hidden = await Product.create({ ...productBody, businessId: other.id, createdBy: admin.id });
      assert.equal((await request(`/api/products/${hidden.id}`)).status, 404);
      assert.equal((await request('/api/transactions', { method: 'POST', body: { product: hidden.id, type: 'stock_out', quantity: 1 } })).status, 404);
      assert.equal((await request('/api/auth/switch-business', { method: 'POST', body: { businessId: other.id } })).status, 403);
    });
    await t.test('search treats punctuation and SQL wildcards literally', async () => {
      for (const search of ['50%', '(premium)']) {
        const response = await request(`/api/products?search=${encodeURIComponent(search)}`);
        assert.equal(response.status, 200);
        assert.equal(response.data.length, 1);
      }
    });
    await t.test('concurrent sales cannot oversell and cash posts exactly once', async () => {
      const results = await Promise.all([1, 2].map(() => request('/api/transactions', { method: 'POST', body: { product: product.id, type: 'stock_out', quantity: 60, reference: 'R'.repeat(120), customer: 'C'.repeat(120) } })));
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
      const sale = results.find((r) => r.status === 201).data;
      assert.equal(sale.stockBefore, 100);
      assert.equal(sale.stockAfter, 40);
      const cash = await pool.query('SELECT * FROM cash_entries WHERE transaction_id=$1', [sale.id]);
      assert.equal(cash.rows.length, 1);
      assert.equal(Number(cash.rows[0].amount), 900);
      // Both requests load the same initial row; only one may reverse its delta.
      const reversals = await Promise.all([1, 2].map(() => request(`/api/transactions/${sale.id}`, { method: 'DELETE' })));
      assert.deepEqual(reversals.map((r) => r.status).sort(), [200, 404]);
      assert.equal((await Product.findById(product.id)).currentStock, 100);
    });
    await t.test('a failed ledger write rolls stock and cash back together', async () => {
      const response = await request('/api/transactions', { method: 'POST', body: { product: product.id, type: 'stock_out', quantity: 1, price: 9999999999 } });
      assert.equal(response.status, 201); // A representable maximum still works.
      await request(`/api/transactions/${response.data.id}`, { method: 'DELETE' });
      const failed = await request('/api/transactions', { method: 'POST', body: { product: product.id, type: 'stock_out', quantity: 2, price: 9999999999 } });
      assert.equal(failed.status, 400);
      assert.equal((await Product.findById(product.id)).currentStock, 100);
    });
    await t.test('corrections are serialized and cash agrees with stock', async () => {
      const sale = await request('/api/transactions', { method: 'POST', body: { product: product.id, type: 'stock_out', quantity: 10 } });
      const results = await Promise.all([20, 30].map((quantity) => request(`/api/transactions/${sale.data.id}`, { method: 'PUT', body: { type: 'stock_out', quantity, price: 15 } })));
      assert.ok(results.every((r) => r.status === 200));
      const final = await request(`/api/transactions/${sale.data.id}`);
      assert.equal((await Product.findById(product.id)).currentStock, 100 - final.data.quantity);
      const cash = await pool.query('SELECT amount FROM cash_entries WHERE transaction_id=$1', [sale.data.id]);
      assert.equal(Number(cash.rows[0].amount), final.data.totalValue);
      await request(`/api/transactions/${sale.data.id}`, { method: 'DELETE' });
    });
    await t.test('reversing an adjustment preserves later sales', async () => {
      const adjustment = await request('/api/transactions', { method: 'POST', body: { product: product.id, type: 'adjustment', quantity: 150 } });
      await request('/api/transactions', { method: 'POST', body: { product: product.id, type: 'stock_out', quantity: 20 } });
      const updated = await request(`/api/transactions/${adjustment.data.id}`, { method: 'PUT', body: { type: 'adjustment', quantity: 150, notes: 'Corrected wording' } });
      assert.equal(updated.data.stockBefore, 100);
      assert.equal(updated.data.stockAfter, 150);
      assert.equal((await request(`/api/transactions/${adjustment.data.id}`, { method: 'DELETE' })).status, 200);
      assert.equal((await Product.findById(product.id)).currentStock, 80);
    });
    await t.test('historical sale costs stay fixed and dashboard cash uses the whole ledger', async () => {
      const sale = await request('/api/transactions', { method: 'POST', body: { product: product.id, type: 'stock_out', quantity: 2, price: 15 } });
      assert.equal(sale.status, 201);
      await pool.query('UPDATE products SET cost_price=12 WHERE id=$1', [product.id]);
      const report = await request('/api/reports/profit-analysis');
      const row = report.data.transactions.find((entry) => entry.transactionId === sale.data.id);
      assert.equal(row.costPrice, 10);
      assert.equal(row.profit, 10);
      const dashboard = await request('/api/reports/dashboard');
      const balance = await pool.query("SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0) AS balance FROM cash_entries WHERE business_id=$1", [business.id]);
      assert.equal(dashboard.data.cashBalance, Number(balance.rows[0].balance));
      await pool.query('UPDATE products SET cost_price=10 WHERE id=$1', [product.id]);
      await request('/api/transactions/' + sale.data.id, { method: 'DELETE' });
    });
    await t.test('older stock changes cannot invalidate a newer absolute adjustment', async () => {
      const delivery = await request('/api/transactions', { method: 'POST', body: { product: product.id, type: 'stock_in', quantity: 10 } });
      const adjustment = await request('/api/transactions', { method: 'POST', body: { product: product.id, type: 'adjustment', quantity: 100 } });
      const stock = (await Product.findById(product.id)).currentStock;
      assert.equal((await request('/api/transactions/' + delivery.data.id, { method: 'DELETE' })).status, 409);
      assert.equal((await Product.findById(product.id)).currentStock, stock);
      await request('/api/transactions/' + adjustment.data.id, { method: 'DELETE' });
      await request('/api/transactions/' + delivery.data.id, { method: 'DELETE' });
    });
    await t.test('metadata edits and archives preserve simultaneous stock movements', async () => {
      const stale = await Product.findById(product.id);
      await request('/api/transactions', { method: 'POST', body: { product: product.id, type: 'stock_out', quantity: 1 } });
      stale.name = 'Changed name';
      await stale.save();
      assert.equal(stale.currentStock, 79);
      const changingStock = await Product.findById(product.id);
      await request('/api/transactions', { method: 'POST', body: { product: product.id, type: 'stock_out', quantity: 1 } });
      changingStock.currentStock = 200;
      await assert.rejects(changingStock.save(), { status: 409 });
      assert.equal((await Product.findById(product.id)).currentStock, 78);
    });
    await t.test('reports, settings and cash book load and invalid dates are rejected', async () => {
      for (const path of ['/api/reports/dashboard', '/api/reports/stock-value', '/api/reports/movement', '/api/reports/bi-analytics', '/api/reports/profit-analysis', '/api/cash-book', '/api/settings', '/api/admin/users', '/api/admin/audit']) {
        const response = await request(path);
        assert.equal(response.status, 200, `${path}: ${JSON.stringify(response.data)}`);
      }
      assert.equal((await request('/api/transactions?startDate=bad')).status, 400);
      assert.equal((await request('/api/reports/movement?startDate=2026-10-22&endDate=2026-10-21')).status, 400);
      assert.equal((await request('/api/unknown')).status, 404);
    });
    await t.test('workers cannot manage products, cash, reports or other users', async () => {
      const worker = await User.create({ businessId: business.id, name: 'Worker', email: `worker-${suffix}@example.test`, password: 'Worker-password-42', role: 'worker', status: 'active' });
      const login = await request('/api/auth/login', { method: 'POST', body: { email: worker.email, password: 'Worker-password-42' } });
      assert.equal(login.status, 200);
      const auth = login.data.token;
      for (const path of ['/api/cash-book', '/api/reports/profit-analysis', '/api/admin/users']) assert.equal((await request(path, { auth })).status, 403);
      assert.equal((await request('/api/products', { method: 'POST', auth, body: productBody })).status, 403);
    });
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    // All fixture data is scoped to this run's two businesses.
    await pool.query('DELETE FROM cash_entries WHERE business_id = ANY($1::uuid[])', [[business.id, other.id]]);
    await pool.query('DELETE FROM transactions WHERE business_id = ANY($1::uuid[])', [[business.id, other.id]]);
    await pool.query('DELETE FROM products WHERE business_id = ANY($1::uuid[])', [[business.id, other.id]]);
    await pool.query('DELETE FROM audit_logs WHERE business_id = ANY($1::uuid[])', [[business.id, other.id]]);
    await pool.query('DELETE FROM users WHERE business_id = ANY($1::uuid[])', [[business.id, other.id]]);
    await pool.query('DELETE FROM businesses WHERE id = ANY($1::uuid[])', [[business.id, other.id]]);
    await closeDB();
  }
});
