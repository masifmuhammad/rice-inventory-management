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
    await t.test('products work without labels and archived identities can be restored', async () => {
      const body = { ...productBody, name: 'Kainat Steam recovery', sku: 'RECOVERY-STEAM', currentStock: 10, minStockLevel: 0 };
      const created = await request('/api/products', { method: 'POST', body });
      assert.equal(created.status, 201, JSON.stringify(created.data));
      const rice = created.data;
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM barcode_labels WHERE product_id=$1', [rice.id])).rows[0].n, 0);
      const sale = await request('/api/transactions', { method: 'POST', body: { product: rice.id, type: 'stock_out', quantity: 2 } });
      assert.equal(sale.status, 201);
      assert.equal((await request(`/api/products/${rice.id}`, { method: 'DELETE' })).status, 200);
      const clash = await request('/api/products', { method: 'POST', body });
      assert.equal(clash.status, 409);
      assert.equal(clash.data.code, 'PRODUCT_ARCHIVED');
      assert.equal(clash.data.archivedProductId, rice.id);
      assert.equal((await request('/api/products/archived?search=RECOVERY-STEAM')).data[0].id, rice.id);
      const restored = await request(`/api/products/${rice.id}/restore`, { method: 'POST', body: { currentStock: 999, businessId: other.id } });
      assert.equal(restored.status, 200);
      assert.equal(restored.data.id, rice.id);
      assert.equal(restored.data.currentStock, 8);
      assert.equal(restored.data.isActive, true);
      const repeat = await request(`/api/products/${rice.id}/restore`, { method: 'POST' });
      assert.equal(repeat.data.currentStock, 8);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM transactions WHERE id=$1', [sale.data.id])).rows[0].n, 1);
      assert.equal((await request('/api/products', { method: 'POST', body })).data.code, 'SKU_IN_USE');
      const changed = await request(`/api/products/${rice.id}`, { method: 'PUT', body: { ...body, currentStock: 8, sku: 'RECOVERY-RENAMED' } });
      assert.equal(changed.status, 200, JSON.stringify(changed.data));
      const conflict = await request(`/api/products/${rice.id}`, { method: 'PUT', body: { ...body, currentStock: 8, sku: product.sku } });
      assert.equal(conflict.status, 409);
      const fresh = await request('/api/products', { method: 'POST', body: { ...body, sku: '' } });
      assert.equal(fresh.status, 201);
      assert.notEqual(fresh.data.id, rice.id);
      const hidden = await Product.create({ ...body, sku: 'FOREIGN-ARCHIVED', businessId: other.id, createdBy: admin.id, isActive: false });
      assert.equal((await request(`/api/products/${hidden.id}/restore`, { method: 'POST' })).status, 404);
      assert.equal((await request('/api/products/archived?search=FOREIGN-ARCHIVED')).data.length, 0);
      // Numeric suffixes must advance after 9999, including archived products.
      await Product.create({ ...body, sku: 'GEN-9999', category: 'Other', businessId: business.id, createdBy: admin.id });
      await Product.create({ ...body, sku: 'GEN-10000', category: 'Other', businessId: business.id, createdBy: admin.id, isActive: false });
      const next = await request('/api/products', { method: 'POST', body: { ...body, sku: '', category: 'Other' } });
      assert.equal(next.status, 201, JSON.stringify(next.data));
      assert.equal(next.data.sku, 'GEN-10001');
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
    await t.test('releasing accidental labels frees manual stock without changing history', async () => {
      for (const mode of ['receive', 'existing', 'prepare']) {
        const rice = await Product.create({ ...productBody, currentStock: mode === 'existing' ? 10 : 0, businessId: business.id, createdBy: admin.id });
        const batch = await request('/api/barcodes/batches', { method: 'POST', body: { requestId: randomUUID(), product: rice.id, quantity: 5, count: 2, mode } });
        assert.equal(batch.status, 201);
        const path = `/api/barcodes/batches/${batch.data.id}/release`;
        const released = await request(path, { method: 'POST' });
        assert.equal(released.status, 200, JSON.stringify(released.data));
        assert.equal(released.data.releasedCount, 2);
        assert.ok(released.data.labels.every((l) => l.status === 'cancelled'));
        assert.equal((await request(path, { method: 'POST' })).data.releasedCount, 0);
        assert.equal((await Product.findById(rice.id)).currentStock, mode === 'prepare' ? 0 : 10);
        for (const scanMode of ['stock_in', 'stock_out']) {
          const scan = await request('/api/barcodes/scan', { method: 'POST', body: { requestId: randomUUID(), code: batch.data.labels[0].code, mode: scanMode } });
          assert.equal(scan.status, 409);
        }
        if (mode !== 'prepare') {
          const sale = await request('/api/transactions', { method: 'POST', body: { product: rice.id, type: 'stock_out', quantity: 10 } });
          assert.equal(sale.status, 201, JSON.stringify(sale.data));
          assert.equal(sale.data.stockAfter, 0);
        }
      }
      const rice = await Product.create({ ...productBody, currentStock: 0, businessId: business.id, createdBy: admin.id });
      const batch = await request('/api/barcodes/batches', { method: 'POST', body: { requestId: randomUUID(), product: rice.id, quantity: 5, count: 2, mode: 'receive' } });
      const sold = await request('/api/barcodes/scan', { method: 'POST', body: { requestId: randomUUID(), code: batch.data.labels[0].code, mode: 'stock_out' } });
      const released = await request(`/api/barcodes/batches/${batch.data.id}/release`, { method: 'POST' });
      assert.equal(released.data.releasedCount, 1);
      assert.equal(released.data.labels.find((l) => l.id === batch.data.labels[0].id).status, 'stock_out');
      assert.equal((await Product.findById(rice.id)).currentStock, 5);
      assert.equal((await request(`/api/transactions/${sold.data.transaction.id}`, { method: 'DELETE' })).status, 200);
      const hidden = await Product.create({ ...productBody, businessId: other.id, createdBy: admin.id });
      const foreign = await require('../services/barcodes').createBatch({ requestId: randomUUID(), product: hidden.id, quantity: 1, count: 1, mode: 'existing' }, other.id, admin);
      assert.equal((await request(`/api/barcodes/batches/${foreign.id}/release`, { method: 'POST' })).status, 404);
    });
    await t.test('barcode labels receive, sell, retry and reverse without double-moving stock', async () => {
      const rice = await Product.create({ ...productBody, businessId: business.id, createdBy: admin.id, currentStock: 0 });
      const make = (overrides = {}) => ({ requestId: randomUUID(), product: rice.id, mode: 'receive', count: 2, quantity: 25, batchNumber: 'RICE-01', ...overrides });
      const postBatch = (body) => request('/api/barcodes/batches', { method: 'POST', body });
      const scan = (code, mode = 'stock_out', overrides = {}) => request('/api/barcodes/scan', { method: 'POST', body: { requestId: randomUUID(), code, mode, station: 'Second shop', ...overrides } });
      const payload = make();
      const created = await postBatch(payload);
      assert.equal(created.status, 201, JSON.stringify(created.data));
      assert.equal(created.data.labels.length, 2);
      const [first, second] = created.data.labels;
      assert.match(first.code, /^99\d{16}$/);
      assert.notEqual(first.code, second.code);
      assert.equal(first.status, 'in_stock');
      assert.equal((await Product.findById(rice.id)).currentStock, 50);
      const retry = await postBatch(payload);
      assert.equal(retry.status, 200);
      assert.equal(retry.data.replayed, true);
      assert.equal(retry.data.id, created.data.id);
      assert.equal((await Product.findById(rice.id)).currentStock, 50);
      assert.equal((await postBatch({ ...payload, count: 3 })).status, 409);
      assert.equal((await postBatch(make({ quantity: 0 }))).status, 400);
      assert.equal((await postBatch(make({ count: 201 }))).status, 400);
      assert.equal((await postBatch(make({ mode: 'existing', count: 1, quantity: 1 }))).status, 409);
      assert.equal((await scan(first.code, 'stock_in')).status, 409);
      assert.equal((await request('/api/transactions', { method: 'POST', body: { type: 'stock_out', product: rice.id, quantity: 1, barcodeLabelId: first.id } })).status, 409);
      const concurrently = await Promise.all([scan(first.code), scan(first.code)]);
      assert.deepEqual(concurrently.map((r) => r.status).sort(), [201, 409]);
      const sale = concurrently.find((r) => r.status === 201).data;
      assert.equal(sale.transaction.stockAfter, 25);
      assert.equal(sale.transaction.quantity, 25);
      assert.equal(sale.transaction.totalValue, 375);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM cash_entries WHERE transaction_id=$1', [sale.transaction.id])).rows[0].n, 1);
      const read = await request('/api/barcodes/labels/' + first.code);
      assert.equal(read.status, 200);
      assert.equal(read.data.label.status, 'stock_out');
      assert.equal(read.data.history.length, 2);
      assert.match(read.data.history[0].notes, /Second shop/);
      const receiptId = read.data.history.find((entry) => entry.type === 'stock_in').id;
      assert.equal((await request('/api/transactions/' + receiptId, { method: 'DELETE' })).status, 409);
      assert.equal((await request('/api/transactions/' + sale.transaction.id, { method: 'PUT', body: { type: 'stock_out', quantity: 1 } })).status, 409);
      assert.equal((await request('/api/transactions/' + sale.transaction.id, { method: 'DELETE' })).status, 200);
      assert.equal((await Product.findById(rice.id)).currentStock, 50);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM cash_entries WHERE transaction_id=$1', [sale.transaction.id])).rows[0].n, 0);
      assert.equal((await request('/api/barcodes/labels/' + first.code)).data.label.status, 'in_stock');
      const scanId = randomUUID();
      const sold = await scan(first.code, 'stock_out', { requestId: scanId });
      const replay = await scan(first.code, 'stock_out', { requestId: scanId });
      assert.equal(sold.status, 201);
      assert.equal(replay.status, 200);
      assert.equal(replay.data.transaction.id, sold.data.transaction.id);
      assert.equal((await Product.findById(rice.id)).currentStock, 25);
      assert.equal((await scan(second.code, 'stock_out', { requestId: scanId })).status, 409);
      const prepared = await postBatch(make({ mode: 'prepare', count: 2, quantity: 5, expiryDate: '2099-12-31' }));
      assert.equal(prepared.status, 201);
      const waiting = prepared.data.labels[0];
      assert.equal(waiting.expiryDate, '2099-12-31');
      assert.equal((await scan(waiting.code)).status, 409);
      const receiveRace = await Promise.all([scan(waiting.code, 'stock_in'), scan(waiting.code, 'stock_in')]);
      assert.deepEqual(receiveRace.map((r) => r.status).sort(), [201, 409]);
      assert.equal((await Product.findById(rice.id)).currentStock, 30);
      const hidden = await Product.create({ ...productBody, businessId: other.id, createdBy: admin.id });
      assert.equal((await postBatch(make({ product: hidden.id }))).status, 404);
      // Existing-stock labels claim only the currently unlabelled quantity.
      const loose = await Product.create({ ...productBody, businessId: business.id, createdBy: admin.id, currentStock: 10 });
      const allocations = await Promise.all([postBatch(make({ product: loose.id, mode: 'existing', count: 1, quantity: 10 })), postBatch(make({ product: loose.id, mode: 'existing', count: 1, quantity: 10 }))]);
      assert.deepEqual(allocations.map((r) => r.status).sort(), [201, 409]);
      assert.equal((await Product.findById(loose.id)).currentStock, 10);
      assert.equal((await request('/api/transactions', { method: 'POST', body: { type: 'adjustment', product: rice.id, quantity: 0 } })).status, 409);
      const stale = await Product.findById(rice.id);
      stale.currentStock = 0;
      await assert.rejects(stale.save(), { status: 409 });
      const unitChange = await Product.findById(rice.id);
      unitChange.unit = 'bag';
      await assert.rejects(unitChange.save(), { status: 409 });
      assert.equal((await request('/api/products/' + rice.id, { method: 'DELETE' })).status, 409);
      await pool.query("UPDATE barcode_labels SET expiry_date='2000-01-01' WHERE id=$1", [second.id]);
      assert.equal((await scan(second.code)).status, 409);
      assert.equal((await Product.findById(rice.id)).currentStock, 30);
      assert.equal((await request('/api/barcodes/labels/not-a-code')).status, 400);
      const batches = await request('/api/barcodes/batches?search=' + first.code);
      assert.equal(batches.status, 200, JSON.stringify(batches.data));
      assert.equal(batches.data.total, 1);
      assert.equal(batches.data.data[0].count, 2);
      // Switching businesses never makes another business's physical label visible.
      await Business.addAdminMembership(admin.id, other.id);
      const switched = await request('/api/auth/switch-business', { method: 'POST', body: { businessId: other.id } });
      assert.equal(switched.status, 200);
      assert.equal((await request('/api/barcodes/labels/' + first.code, { auth: switched.data.token })).status, 404);
      assert.equal((await request('/api/barcodes/batches/' + created.data.id, { auth: switched.data.token })).status, 404);
      // A failed receipt rolls every new label and stock movement back together.
      const expensive = await Product.create({ ...productBody, businessId: business.id, createdBy: admin.id, currentStock: 0, costPrice: 9999999999 });
      const failedPayload = make({ product: expensive.id, quantity: 2, count: 2 });
      assert.equal((await postBatch(failedPayload)).status, 400);
      assert.equal((await Product.findById(expensive.id)).currentStock, 0);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM barcode_batches WHERE business_id=$1 AND request_id=$2', [business.id, failedPayload.requestId])).rows[0].n, 0);
    });
    await t.test('workers cannot manage products, cash, reports or other users', async () => {
      const worker = await User.create({ businessId: business.id, name: 'Worker', email: `worker-${suffix}@example.test`, password: 'Worker-password-42', role: 'worker', status: 'active' });
      const login = await request('/api/auth/login', { method: 'POST', body: { email: worker.email, password: 'Worker-password-42' } });
      assert.equal(login.status, 200);
      const auth = login.data.token;
      for (const path of ['/api/cash-book', '/api/reports/profit-analysis', '/api/admin/users']) assert.equal((await request(path, { auth })).status, 403);
      assert.equal((await request('/api/products', { method: 'POST', auth, body: productBody })).status, 403);
      assert.equal((await request('/api/products/archived', { auth })).status, 403);
      assert.equal((await request(`/api/products/${product.id}/restore`, { method: 'POST', auth })).status, 403);
      const accountant = await User.create({ businessId: business.id, name: 'Accountant', email: `accountant-${suffix}@example.test`, password: 'Accountant-password-42', role: 'accountant', status: 'active' });
      const accountantLogin = await request('/api/auth/login', { method: 'POST', body: { email: accountant.email, password: 'Accountant-password-42' } });
      assert.equal((await request(`/api/products/${product.id}/restore`, { method: 'POST', auth: accountantLogin.data.token })).status, 403);
    });
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    // All fixture data is scoped to this run's two businesses.
    await pool.query('DELETE FROM cash_entries WHERE business_id = ANY($1::uuid[])', [[business.id, other.id]]);
    await pool.query('DELETE FROM transactions WHERE business_id = ANY($1::uuid[])', [[business.id, other.id]]);
    await pool.query('DELETE FROM barcode_batches WHERE business_id = ANY($1::uuid[])', [[business.id, other.id]]);
    await pool.query('DELETE FROM products WHERE business_id = ANY($1::uuid[])', [[business.id, other.id]]);
    await pool.query('DELETE FROM audit_logs WHERE business_id = ANY($1::uuid[])', [[business.id, other.id]]);
    await pool.query('DELETE FROM users WHERE business_id = ANY($1::uuid[])', [[business.id, other.id]]);
    await pool.query('DELETE FROM businesses WHERE id = ANY($1::uuid[])', [[business.id, other.id]]);
    await closeDB();
  }
});
