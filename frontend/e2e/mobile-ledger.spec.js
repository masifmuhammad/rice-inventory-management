const { test, expect } = require('@playwright/test');

async function signIn(page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('browser-admin@example.test');
  await page.getByLabel(/^Password/).fill('Browser-password-42');
  const ready = page.waitForResponse((r) => r.url().endsWith('/api/settings') && r.status() === 200);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await (await ready).finished();
}
async function auth(page) { return { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('rim.token'))}` }; }
async function fixture(page) {
  const headers = await auth(page), suffix = Date.now();
  const create = async (url, data) => { const response = await page.request.post('/api/' + url, { headers, data }); expect(response.status()).toBe(201); return response.json(); };
  const product = await create('products', { name: `Daily rice ${suffix}`, category: 'Basmati', unit: 'kg', currentStock: 20, minStockLevel: 0, costPrice: 10, sellingPrice: 15 });
  const customer = await create('credit/customers', { name: `Daily customer ${suffix}`, openingBalance: 50, dueDate: '2026-10-01' });
  const result = await create('suppliers', { name: `Daily supplier ${suffix}`, openingBalance: 100, openingDate: '2026-10-01', dueDate: '2026-10-01' });
  return { headers, product, customer: customer.customer || customer, supplier: result.supplier || result };
}
async function choose(page, label, name) {
  await page.getByRole('dialog').getByRole('button', { name: new RegExp('^' + label) }).click();
  await page.getByRole('option', { name: new RegExp(name) }).click();
}

test('daily sales, collections, supplier payments and deliveries finish on Home', async ({ page }, info) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page); const data = await fixture(page); await page.reload();
  await page.getByRole('button', { name: 'Record sale', exact: false }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Record sale' })).toBeVisible();
  await choose(page, 'Product', data.product.name);
  await dialog.getByLabel('Quantity', { exact: false }).fill('2');
  await dialog.getByRole('button', { name: 'Record transaction', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('status').filter({ hasText: 'Sale recorded.' })).toBeVisible();
  await page.getByRole('button', { name: /^Collect customer payment/ }).click();
  await choose(page, 'Customer', data.customer.name);
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount received', { exact: false }).fill('20');
  await dialog.getByRole('button', { name: 'Record repayment', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: /^Pay supplier/ }).click();
  await choose(page, 'Supplier', data.supplier.name);
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount paid', { exact: false }).fill('30');
  await dialog.getByRole('button', { name: 'Record supplier payment', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: /^Add delivery/ }).click();
  await choose(page, 'Supplier', data.supplier.name);
  await choose(page, 'Product', data.product.name);
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Quantity', { exact: false }).fill('5');
  await dialog.getByLabel('Paid now').fill('25');
  await dialog.getByRole('button', { name: 'Receive stock and record bill', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page).toHaveURL(/\/$/);
  const product = await (await page.request.get(`/api/products/${data.product.id}`, { headers: data.headers })).json();
  expect(product.currentStock).toBe(23);
  const customer = await (await page.request.get(`/api/credit/customers/${data.customer.id}`, { headers: data.headers })).json();
  expect(customer.balance).toBe(30);
  const supplier = await (await page.request.get(`/api/suppliers/${data.supplier.id}`, { headers: data.headers })).json();
  expect(supplier.balance).toBe(95);
  await page.screenshot({ path: `test-results/daily-work-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('a lost sale acknowledgement recovers after reload without repeating stock or cash', async ({ page }) => {
  await signIn(page); const data = await fixture(page); await page.reload();
  await page.getByRole('button', { name: /^Record sale/ }).click();
  await choose(page, 'Product', data.product.name);
  await page.getByRole('dialog').getByLabel('Quantity', { exact: false }).fill('2');
  let interrupted = false;
  await page.route('**/api/transactions', async (route) => {
    if (route.request().method() === 'POST' && !interrupted) { interrupted = true; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Record transaction', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Confirm previous save', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^Record sale/ }).click();
  await expect(page.getByRole('dialog').getByLabel('Quantity', { exact: false })).toHaveValue('2');
  await expect(page.getByRole('dialog').getByLabel('Quantity', { exact: false })).toBeDisabled();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm previous save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const product = await (await page.request.get(`/api/products/${data.product.id}`, { headers: data.headers })).json();
  expect(product.currentStock).toBe(18);
  const transactions = await (await page.request.get(`/api/transactions?productId=${data.product.id}`, { headers: data.headers })).json();
  expect(transactions.pagination.total).toBe(1);
});

test('phone dialogs, date fields and pickers fit both keyboard viewport models', async ({ page, isMobile }, info) => {
  test.skip(!isMobile, 'Phone keyboard behavior');
  const original = page.viewportSize();
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    document.addEventListener('DOMContentLoaded', () => {
      Object.assign(viewport, { width: innerWidth, height: innerHeight });
      viewport.dispatchEvent(new Event('resize'));
    });
    window.__visible = (height, offsetTop = 0) => { Object.assign(viewport, { height, offsetTop }); viewport.dispatchEvent(new Event('resize')); };
  });
  await signIn(page);
  await page.getByRole('button', { name: 'Money out', exact: true }).click();
  const dialog = page.getByRole('dialog');
  for (const shrinkLayout of [true, false]) {
    await page.setViewportSize(original);
    await page.evaluate((height) => window.__visible(height), original.height);
    await dialog.getByLabel('Amount', { exact: false }).fill('125');
    if (shrinkLayout) await page.setViewportSize({ width: original.width, height: 360 });
    const top = shrinkLayout ? 0 : 20;
    await page.evaluate((offset) => window.__visible(360, offset), top);
    await expect(dialog).toHaveAttribute('data-keyboard-open', 'true');
    await expect(dialog.getByRole('button', { name: 'Next field', exact: true })).toBeVisible();
    await dialog.getByLabel('Date', { exact: true }).fill('2026-10-01');
    await dialog.getByLabel('Purpose', { exact: false }).fill('Mobile date and picker check');
    await expect.poll(() => dialog.locator('[data-modal-body]').evaluate((body) => {
      const field = document.activeElement?.closest('.field-shell');
      if (!field) return false;
      const pane = body.getBoundingClientRect(), box = field.getBoundingClientRect();
      return pane.height >= 140 && box.top >= pane.top && box.bottom <= pane.bottom;
    })).toBe(true);
    await dialog.getByRole('button', { name: /^Category/ }).click();
    const picker = page.getByRole('listbox');
    await expect(picker).toBeVisible();
    await expect.poll(async () => { const box = await picker.boundingBox(); return Boolean(box && box.y >= top && box.y + box.height <= top + 361); }).toBe(true);
    await page.getByRole('option').filter({ visible: true }).last().click();
    await expect(picker).toHaveCount(0);
    await expect(dialog.getByLabel('Date', { exact: true })).toHaveValue('2026-10-01');
    await page.screenshot({ path: `test-results/dialog-keyboard-${shrinkLayout ? 'layout' : 'visual'}-${info.project.name}.png` });
  }
  await page.setViewportSize(original);
  await page.evaluate((height) => window.__visible(height), original.height);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-keyboard-open', 'false');
});

test('fully paid customer and supplier accounts can confirm a lost payment response after reload', async ({ page }) => {
  await signIn(page); const data = await fixture(page); await page.reload();
  for (const operation of [
    { action: 'Collect customer payment', field: 'Customer', name: data.customer.name, amount: '50', input: 'Amount received', save: 'Record repayment', url: `/api/credit/customers/${data.customer.id}/payments`, detail: `/api/credit/customers/${data.customer.id}` },
    { action: 'Pay supplier', field: 'Supplier', name: data.supplier.name, amount: '100', input: 'Amount paid', save: 'Record supplier payment', url: `/api/suppliers/${data.supplier.id}/payments`, detail: `/api/suppliers/${data.supplier.id}` },
  ]) {
    await page.getByRole('button', { name: operation.action, exact: true }).click();
    await choose(page, operation.field, operation.name);
    await page.getByRole('dialog').getByLabel(operation.input).fill(operation.amount);
    let lost = false;
    await page.route('**' + operation.url, async (route) => {
      if (!lost) { lost = true; await route.fetch(); await route.abort('failed'); } else await route.continue();
    });
    await page.getByRole('dialog').getByRole('button', { name: operation.save, exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Confirm previous save', exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: operation.action, exact: true }).click();
    await expect(page.getByRole('dialog').getByLabel(operation.input)).toHaveValue(operation.amount);
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm previous save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const detail = await (await page.request.get(operation.detail, { headers: data.headers })).json();
    expect(detail.balance).toBe(0);
    await page.unroute('**' + operation.url);
  }
});

test('a new credit customer is added inside the sale without losing its quantity or price', async ({ page }) => {
  await signIn(page); const data = await fixture(page); await page.reload();
  await page.getByRole('button', { name: 'Record sale', exact: true }).click();
  await choose(page, 'Product', data.product.name);
  let sale = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Record sale', exact: true }) });
  await sale.getByLabel('Quantity', { exact: false }).fill('2');
  await sale.getByLabel('Pay later', { exact: false }).check();
  await sale.getByRole('button', { name: 'Add customer', exact: true }).click();
  const name = `Inline customer ${Date.now()}`;
  const customer = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Add customer', exact: true }) });
  await customer.getByLabel('Customer name').fill(name);
  await customer.getByRole('button', { name: 'Add customer', exact: true }).click();
  await expect(customer).toHaveCount(0);
  sale = page.getByRole('dialog');
  await expect(sale.getByLabel('Quantity', { exact: false })).toHaveValue('2');
  await expect(sale.getByRole('button', { name: /^Credit customer/ })).toContainText(name);
  await sale.getByLabel('Payment due date').fill('2030-01-01');
  await sale.getByRole('button', { name: 'Record transaction', exact: true }).click();
  await expect(sale).toHaveCount(0); await expect(page).toHaveURL(/\/$/);
});

test('operating pages remain within the viewport in light and dark themes', async ({ page }, info) => {
  await signIn(page);
  const fs = require('node:fs'); const findings = [];
  const routes = ['/', '/products', '/transactions', '/cash-book', '/credit', '/suppliers', '/reports', '/settings', '/admin/users', '/admin/businesses', '/admin/activity'];
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => localStorage.setItem('rim.theme', value), theme);
    for (const path of routes) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      findings.push({ path, theme, overflow });
      expect(overflow, `${path} overflows in ${theme}`).toBe(false);
      await page.screenshot({ path: `test-results/audit-${path.replaceAll('/', '-') || 'home'}-${theme}-${info.project.name}.png` });
    }
  }
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(`test-results/route-audit-${info.project.name}.json`, JSON.stringify(findings, null, 2));
});
