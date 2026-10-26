const { test, expect } = require('@playwright/test');

async function signIn(page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('browser-admin@example.test');
  await page.getByLabel(/^Password/).fill('Browser-password-42');
  const settingsReady = page.waitForResponse((r) => r.url().endsWith('/api/settings') && r.status() === 200);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await (await settingsReady).finished();
}
async function headers(page) {
  return { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('rim.token'))}` };
}
async function fillProduct(page, name, sku = '') {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Product name').fill(name);
  if (sku) await dialog.getByLabel('SKU', { exact: true }).fill(sku);
  await dialog.getByLabel('Cost price').fill('240');
  await dialog.getByLabel('Selling price').fill('285');
  return dialog;
}
async function capture(page, name) {
  await page.evaluate(async () => { document.activeElement?.blur(); await document.fonts.ready; });
  await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('create a product without labels, keep it visible and transact without a scanner', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page);
  await page.goto('/products');
  await page.locator('main').getByLabel('Search products', { exact: true }).fill('no matching product here');
  await page.getByRole('button', { name: 'Low stock only', exact: true }).click();
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  const name = `No printer Kainat ${Date.now()}`;
  const dialog = await fillProduct(page, name);
  await expect(dialog.getByText('Labels are optional.', { exact: false })).toBeVisible();
  await expect(dialog.getByLabel('Current stock')).toHaveValue('0');
  await expect(dialog.getByLabel('Minimum level')).toHaveValue('0');
  await capture(page, `product-create-${info.project.name}`);
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/products') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Create product', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const product = await response.json();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(name, { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.locator('main').getByLabel('Search products', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Low stock only', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const auth = await headers(page);
  for (const type of ['stock_in', 'stock_out']) {
    const movement = await page.request.post('/api/transactions', { headers: auth, data: { product: product.id, type, quantity: 10 } });
    expect(movement.status()).toBe(201);
  }
  const batches = await (await page.request.get(`/api/barcodes/batches?search=${encodeURIComponent(name)}`, { headers: auth })).json();
  expect(batches.total).toBe(0);
  expect(errors).toEqual([]);
});

test('an archived SKU offers recovery and restores the original stock and sales history', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page);
  const auth = await headers(page);
  const stamp = Date.now();
  const name = `Archived Kainat ${stamp}`, sku = `KAINAT-${stamp}`;
  const created = await page.request.post('/api/products', { headers: auth, data: { name, sku, category: 'Basmati', unit: 'kg', currentStock: 10, minStockLevel: 0, costPrice: 240, sellingPrice: 285 } });
  expect(created.status()).toBe(201);
  const product = await created.json();
  const sold = await page.request.post('/api/transactions', { headers: auth, data: { product: product.id, type: 'stock_out', quantity: 2 } });
  expect(sold.status()).toBe(201);
  const transaction = await sold.json();
  await page.goto('/products');
  await page.locator('main').getByLabel('Search products', { exact: true }).fill(name);
  await page.getByRole('button', { name: `Archive ${name}`, exact: true }).filter({ visible: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('button', { name: `Archive ${name}`, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  const dialog = await fillProduct(page, name, sku);
  await dialog.getByRole('button', { name: 'Create product', exact: true }).click();
  await expect(dialog.locator('[data-save-error]')).toContainText('archived product');
  await expect(dialog.getByLabel('Product name')).toHaveValue(name);
  await capture(page, `product-archived-conflict-${info.project.name}`);
  await dialog.getByRole('button', { name: 'View archived products', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: `Restore ${name}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Restore ${name}`, exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Archived products', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Archive ${name}`, exact: true }).filter({ visible: true })).toBeVisible();
  const restored = await (await page.request.get(`/api/products/${product.id}`, { headers: auth })).json();
  expect(restored.currentStock).toBe(8);
  expect(restored.sku).toBe(sku);
  expect(restored.isActive).toBe(true);
  const history = await (await page.request.get(`/api/transactions/${transaction.id}`, { headers: auth })).json();
  expect(history.product.id || history.product._id).toBe(product.id);
  await capture(page, `product-restored-${info.project.name}`);
  expect(errors).toEqual([]);
});

test('failed product saves retain the form, show a persistent error and retry successfully', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page);
  await page.goto('/products');
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  const name = `Retry Kainat ${Date.now()}`;
  const dialog = await fillProduct(page, name);
  await page.route('**/api/products', async (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary test outage. Try again.' }) }) : route.continue());
  await dialog.getByRole('button', { name: 'Create product', exact: true }).click();
  await expect(dialog.locator('[data-save-error]')).toContainText('Temporary test outage');
  await expect(dialog.getByLabel('Product name')).toHaveValue(name);
  await expect(dialog.getByLabel('Cost price')).toHaveValue('240');
  await page.unroute('**/api/products');
  await dialog.getByRole('button', { name: 'Create product', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(name, { exact: true }).filter({ visible: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('product typing survives late metadata and fits the phone keyboard viewport', async ({ page, isMobile }, info) => {
  test.skip(!isMobile, 'Phone keyboard layout');
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    document.addEventListener('DOMContentLoaded', () => {
      Object.assign(viewport, { width: innerWidth, height: innerHeight });
      viewport.dispatchEvent(new Event('resize'));
    });
    window.__testKeyboard = (height) => { viewport.height = height; viewport.dispatchEvent(new Event('resize')); };
  });
  await signIn(page);
  let releaseMeta;
  const gate = new Promise((resolve) => { releaseMeta = resolve; });
  await page.route('**/api/products/meta', async (route) => { await gate; await route.continue(); });
  await page.goto('/products');
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Product name').fill('My typed Kainat Steam');
  const metaDone = page.waitForResponse('**/api/products/meta');
  releaseMeta(); await metaDone;
  await expect(dialog.getByLabel('Product name')).toHaveValue('My typed Kainat Steam');
  await page.evaluate(() => window.__testKeyboard(330));
  await dialog.getByLabel('Cost price').focus();
  await dialog.getByLabel('Cost price').fill('240');
  await expect.poll(() => dialog.locator('[data-modal-body]').evaluate((body) => {
    const field = document.activeElement?.closest('.field-shell');
    if (!field || !body.contains(field)) return false;
    const pane = body.getBoundingClientRect(), box = field.getBoundingClientRect();
    return box.top >= pane.top && box.bottom <= pane.bottom && pane.height >= 120;
  })).toBe(true);
  await page.screenshot({ path: `test-results/product-keyboard-${info.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
