// Dedicated fixtures for browser checks; never connect to a production database.
const assert = require('node:assert/strict');
assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a dedicated test database');
assert.match(new URL(process.env.TEST_DATABASE_URL).pathname, /test|readiness/i);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
// A developer's local .env must never enable paid provider calls in fixtures.
process.env.OPENROUTER_API_KEY = '';
process.env.JWT_SECRET = 'browser-test-secret-at-least-32-characters';
process.env.PORT = process.env.E2E_PORT || '5055';
const { connectDB } = require('../config/db');
const Business = require('../models/Business');
const User = require('../models/User');
const Product = require('../models/Product');
const BusinessSettings = require('../models/BusinessSettings');

(async () => {
  await connectDB({ retries: 1 });
  const ensureBusiness = async (slug, name, productName) => {
    const business = await Business.findOne({ slug }) || await Business.create({ slug, name });
    if (!await BusinessSettings.findOne({ businessId: business.id })) await BusinessSettings.createDefaultSettings(business.id, name);
    if (!await Product.findOne({ businessId: business.id, sku: 'E2E-001' })) {
      await Product.create({ businessId: business.id, name: productName, sku: 'E2E-001', category: 'Basmati', currentStock: 100, minStockLevel: 10, costPrice: 10, sellingPrice: 15 });
    }
    return business;
  };
  const primary = await ensureBusiness('browser-test-mill', 'Test Rice Mill', 'Premium Basmati');
  const secondary = await ensureBusiness('browser-test-second', 'Second Test Mill', 'Second Mill Rice');
  const email = 'browser-admin@example.test';
  const admin = await User.findOne({ email }) || await User.create({ businessId: primary.id, name: 'Browser Admin', email, password: 'Browser-password-42', role: 'admin', status: 'active' });
  await Business.addAdminMembership(admin.id, secondary.id);
  const workerEmail = 'browser-worker@example.test';
  if (!await User.findOne({ email: workerEmail })) await User.create({ businessId: primary.id, name: 'Browser Worker', email: workerEmail, password: 'Browser-password-42', role: 'worker', status: 'active' });
  // Representative review data lives only in this explicitly isolated test DB.
  const previewProducts = [
    { sku: 'E2E-SK', name: 'Super Kernel Basmati', category: 'Basmati', currentStock: 2500, minStockLevel: 250, costPrice: 280, sellingPrice: 320 },
    { sku: 'E2E-1121', name: '1121 Steam Rice', category: 'Sella', currentStock: 1200, minStockLevel: 200, costPrice: 240, sellingPrice: 285 },
    { sku: 'E2E-IRRI', name: 'IRRI-6 Broken Rice', category: 'Broken', currentStock: 50, minStockLevel: 100, costPrice: 120, sellingPrice: 145 },
  ];
  for (const entry of previewProducts) {
    if (!await Product.findOne({ businessId: primary.id, sku: entry.sku })) await Product.create({ ...entry, unit: 'kg', businessId: primary.id, createdBy: admin.id });
  }
  const { getPool } = require('../config/db');
  const previewExists = await getPool().query("SELECT id FROM transactions WHERE business_id=$1 AND reference='BROWSER-PREVIEW-SALE' LIMIT 1", [primary.id]);
  if (!previewExists.rows.length) {
    const { createMovement } = require('../services/stockLedger');
    const steam = await Product.findOne({ businessId: primary.id, sku: 'E2E-1121' });
    await createMovement({ product: steam.id, type: 'stock_in', quantity: 150, price: 240, supplier: 'Review supplier', reference: 'BROWSER-PREVIEW-DELIVERY' }, primary.id, admin);
    await createMovement({ product: steam.id, type: 'stock_out', quantity: 75, price: 285, customer: 'Review customer', reference: 'BROWSER-PREVIEW-SALE' }, primary.id, admin);
  }
  // The DB was initialized above; start listening without running migrations twice.
  const app = require('../server');
  app.listen(Number(process.env.PORT), '127.0.0.1', () => console.log(`Browser fixture server on ${process.env.PORT}`));
})().catch((error) => { console.error(error); process.exit(1); });
