const { test, expect } = require('@playwright/test');
const ur = require('../src/i18n/ur.json');
const fs = require('node:fs');

async function language(page, value) {
  await page.locator('.language-trigger').first().click();
  await page.getByRole('menuitem').filter({ hasText: value === 'ur' ? 'اردو' : 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', value);
  await expect(page.locator('html')).toHaveAttribute('dir', value === 'ur' ? 'rtl' : 'ltr');
  await page.evaluate(() => document.fonts.ready);
}
async function signIn(page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('browser-admin@example.test');
  await page.getByLabel(/^Password/).fill('Browser-password-42');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 8000 });
}
async function capture(page, name, project) {
  await page.evaluate(async () => { document.activeElement?.blur(); scrollTo(0, 0); await document.fonts.ready; });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `../verification/language/review/${name}-${project}.png`, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('English is clean by default; Urdu persists and switching preserves unsaved form values', async ({ page, isMobile }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack));
  await signIn(page);
  expect(await page.locator('body').innerText()).not.toMatch(/[\u0600-\u06ff]/);
  await capture(page, 'home-en', info.project.name);
  await language(page, 'ur');
  await expect(page.locator('.inventory-action-stock')).toContainText(ur['View stock']);
  await capture(page, 'home-ur', info.project.name);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.inventory-action-stock')).toContainText(ur['View stock']);
  await page.goto('/barcodes?tab=labels');
  await page.getByLabel(ur['Find rice by name or SKU']).fill('Premium');
  await page.getByRole('button', { name: new RegExp(ur['Rice product']) }).click();
  await page.getByRole('option', { name: /Premium Basmati/ }).click();
  await page.getByLabel(ur['Quantity per bag{0}'].replace('{0}', ' (kg)')).fill('25');
  await page.getByLabel(ur['Number of bags / labels']).fill('3');
  await capture(page, 'labels-ur', info.project.name);
  await language(page, 'en');
  await expect(page.getByLabel('Number of bags / labels')).toHaveValue('3');
  await expect(page.getByLabel('Quantity per bag (kg)')).toHaveValue('25');
  await expect(page.getByRole('button', { name: /Rice product/ })).toContainText('Premium Basmati');
  expect(await page.locator('body').innerText()).not.toMatch(/[\u0600-\u06ff]/);
  await capture(page, 'labels-en', info.project.name);
  if (isMobile) {
    const font = await page.getByLabel('Number of bags / labels').evaluate(node => ({ size: parseFloat(getComputedStyle(node).fontSize), family: getComputedStyle(node).fontFamily }));
    expect(font.size).toBeGreaterThanOrEqual(16);
    expect(font.family).not.toMatch(/Times/);
  }
  await page.goto('/barcodes');
  await capture(page, 'scan-en', info.project.name);
  await language(page, 'ur');
  await capture(page, 'scan-ur', info.project.name);
  if (isMobile) {
    const start = await page.getByRole('button', { name: ur['Start stock out'], exact: true }).boundingBox();
    const dock = await page.locator('.mobile-tabbar').boundingBox();
    expect(start.y + start.height).toBeLessThanOrEqual(dock.y);
  }
  await page.getByRole('button', { name: ur['Start stock out'], exact: true }).click();
  const field = page.getByLabel(ur['Scan a bag or enter its barcode']);
  expect(await field.evaluate(node => getComputedStyle(node).direction)).toBe('ltr');
  await capture(page, 'scan-armed-ur', info.project.name);
  const text = {};
  for (const route of ['/products', '/transactions', '/cash-book', '/reports', '/settings']) {
    await page.goto(route);
    await page.waitForTimeout(400);
    text[route] = await page.locator('main').innerText();
    await capture(page, route.slice(1) + '-ur', info.project.name);
  }
  fs.mkdirSync('../verification/language/review', { recursive: true });
  fs.writeFileSync(`../verification/language/review/text-${info.project.name}.json`, JSON.stringify(text, null, 2));
  expect(errors).toEqual([]);
});

test('Urdu scanning records one sale and rejects a duplicate without changing stored identifiers', async ({ page }) => {
  await signIn(page);
  const token = await page.evaluate(() => localStorage.getItem('rim.token'));
  const headers = { Authorization: `Bearer ${token}` };
  const productResponse = await page.request.post('/api/products', { headers, data: { name: `Language rice ${Date.now()}`, category: 'Basmati', unit: 'kg', currentStock: 0, minStockLevel: 1, costPrice: 10, sellingPrice: 15 } });
  expect(productResponse.status()).toBe(201);
  const product = await productResponse.json();
  const batchResponse = await page.request.post('/api/barcodes/batches', { headers, data: { requestId: require('node:crypto').randomUUID(), product: product.id, quantity: 5, count: 1, mode: 'receive' } });
  expect(batchResponse.status()).toBe(201);
  const { labels } = await batchResponse.json();
  await page.goto('/barcodes');
  await language(page, 'ur');
  await page.getByRole('button', { name: ur['Start stock out'], exact: true }).click();
  const field = page.getByLabel(ur['Scan a bag or enter its barcode']);
  await field.fill(labels[0].code); await field.press('Enter');
  await expect(page.getByText(ur['Bag sold · stock updated'], { exact: true })).toBeVisible();
  await expect(page.locator('.barcode-result')).toContainText(product.name);
  await field.fill(labels[0].code); await field.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: ur['This pack was already stocked out. No stock was deducted.'] })).toBeVisible();
  const saved = await (await page.request.get(`/api/products/${product.id}`, { headers })).json();
  expect(saved.name).toBe(product.name);
  expect(saved.currentStock).toBe(0);
  const read = await (await page.request.get(`/api/barcodes/labels/${labels[0].code}`, { headers })).json();
  expect(read.label.code).toBe(labels[0].code);
  expect(read.history.filter(row => row.type === 'stock_out')).toHaveLength(1);
});
