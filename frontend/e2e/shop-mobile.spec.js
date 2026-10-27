const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');

async function login(page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('browser-admin@example.test');
  await page.getByLabel(/^Password/).fill('Browser-password-42');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Record sale', exact: true })).toBeVisible();
  await page.locator('[data-sonner-toast]').waitFor({ state: 'hidden' });
}
async function fixture(page) {
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('rim.token'))}` };
  const post = async (path, data) => {
    const response = await page.request.post(`/api/${path}`, { headers, data });
    expect(response.status()).toBe(201); return response.json();
  };
  const product = await post('products', { name: `Scanner rice ${Date.now()}`, category: 'Basmati', unit: 'kg', currentStock: 50, minStockLevel: 0, costPrice: 10, sellingPrice: 15 });
  const batch = await post('barcodes/batches', { product: product.id, mode: 'existing', count: 4, quantity: 2, requestId: randomUUID() });
  return { product, batch, headers, post };
}
async function startScanner(page) {
  await page.getByRole('button', { name: 'Shop mode', exact: true }).click();
  await page.getByRole('button', { name: 'Use scanner', exact: true }).click();
  await expect(page.getByText('Ready for the next bag', { exact: true })).toBeVisible();
}
async function scan(page, code, suffix = 'Enter') { await page.keyboard.type(code); await page.keyboard.press(suffix); }

test('header controls fit phones and dashboard balances stay aligned', async ({ page, isMobile }, info) => {
  await login(page);
  const sizes = isMobile ? [320, 375, 390, 430, 768] : [1280];
  for (const width of sizes) {
    await page.setViewportSize({ width, height: 844 });
    const geometry = await page.locator('header .app-header-row').evaluate((header) => {
      const rects = [...header.children].filter((node) => getComputedStyle(node).display !== 'none').map((node) => node.getBoundingClientRect());
      return { overflow: document.documentElement.scrollWidth > innerWidth,
        overlap: rects.some((rect, i) => i && rect.left < rects[i - 1].right - 1),
        controls: [...header.querySelectorAll('button')].filter((node) => node.getBoundingClientRect().width > 0).map((node) => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })) };
    });
    expect(geometry.overflow).toBe(false); expect(geometry.overlap).toBe(false);
    if (width < 640) for (const control of geometry.controls) { expect(control.width).toBeGreaterThanOrEqual(44); expect(control.height).toBeGreaterThanOrEqual(44); }
    if ([375, 390, 1280].includes(width)) await page.screenshot({ path: `test-results/polished-home-${info.project.name}-${width}.png` });
  }
  await page.setViewportSize({ width: isMobile ? 375 : 1280, height: 844 });
  await page.getByRole('button', { name: /^Active business:/ }).filter({ visible: true }).click();
  await expect(page.getByRole('listbox', { name: 'Select business' })).toBeVisible();
  const menu = await page.getByRole('listbox', { name: 'Select business' }).boundingBox();
  expect(menu.x).toBeGreaterThanOrEqual(0); expect(menu.x + menu.width).toBeLessThanOrEqual(isMobile ? 375 : 1280);
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: `test-results/polished-home-dark-${info.project.name}.png` });
});

test('Shop scanner sells consecutive labels, rejects duplicates, and recovers a lost reply', async ({ page }, info) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await login(page); const { product, batch, headers } = await fixture(page); await startScanner(page);
  // Keyboard scanner works without first focusing the barcode field.
  await scan(page, batch.labels[0].code);
  await scan(page, batch.labels[1].code, 'Tab');
  await expect(page.getByText('2 bags recorded this session')).toBeVisible();
  const stock = async () => (await (await page.request.get(`/api/products/${product.id}`, { headers })).json()).currentStock;
  expect(await stock()).toBe(46);
  await scan(page, batch.labels[0].code);
  await expect(page.getByRole('alert')).toContainText('already stocked out');
  expect(await stock()).toBe(46);
  let interrupted = false;
  await page.route('**/api/barcodes/scan', async (route) => {
    if (!interrupted) { interrupted = true; await route.fetch(); await route.abort('failed'); } else await route.continue();
  });
  await page.getByLabel('Scan a bag or enter its barcode').focus();
  await scan(page, batch.labels[2].code);
  await expect(page.getByRole('button', { name: 'Recover pending scans' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Shop mode', exact: true })).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: 'Recover pending scans' }).click();
  await expect(page.getByText(/Previous scan confirmed/)).toBeVisible();
  expect(await stock()).toBe(44);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/shop-scanner-${info.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('Shop scanner receives prepared labels once and pause prevents a scan', async ({ page }) => {
  await login(page); const { product, post, headers } = await fixture(page);
  const batch = await post('barcodes/batches', { product: product.id, mode: 'prepare', count: 1, quantity: 5, requestId: randomUUID() });
  await startScanner(page);
  await page.getByRole('button', { name: 'Receive', exact: true }).click();
  await expect(page.getByText('Scan to receive', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.locator('.shop-heading h1').click();
  await scan(page, batch.labels[0].code);
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume scanning' }).click();
  await scan(page, batch.labels[0].code);
  await expect(page.getByText(/Bag added to stock/)).toBeVisible();
  await scan(page, batch.labels[0].code);
  await expect(page.getByRole('alert')).toContainText('already in stock');
  const productAfter = await (await page.request.get(`/api/products/${product.id}`, { headers })).json();
  expect(productAfter.currentStock).toBe(55);
});

test('packet buttons still save sales and fifty-packet deliveries, including Urdu layout', async ({ page, isMobile }, info) => {
  await login(page); const { product, post, headers } = await fixture(page);
  const supplierResult = await post('suppliers', { name: `Shop supplier ${Date.now()}` });
  const supplier = supplierResult.supplier || supplierResult;
  const setup = await page.request.put(`/api/shop/products/${product.id}`, { headers, data: { packQuantity: 5, supplierId: supplier.id, buttonLabel: 'Basmati', colour: 'green' } });
  expect(setup.ok()).toBe(true);
  await page.getByRole('button', { name: 'Shop mode', exact: true }).click();
  await page.getByRole('button', { name: 'Add Basmati', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'Use scanner', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Record cash sale', exact: true }).click();
  await expect(page.getByText('Sale saved — cash and stock updated')).toBeVisible();
  await page.getByRole('button', { name: 'Receive', exact: true }).click();
  await page.getByRole('group', { name: 'Packets received' }).getByRole('button', { name: '50', exact: true }).click();
  await page.getByRole('button', { name: 'Add Basmati', exact: true }).last().click();
  await page.getByRole('button', { name: 'Receive packets', exact: true }).click();
  await expect(page.getByText('Received — stock and supplier bill saved')).toBeVisible();
  const productAfter = await (await page.request.get(`/api/products/${product.id}`, { headers })).json();
  expect(productAfter.currentStock).toBe(295);
  const supplierAfter = await (await page.request.get(`/api/suppliers/${supplier.id}`, { headers })).json();
  expect(supplierAfter.balance).toBe(2500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/shop-packets-${info.project.name}.png` });
  await page.evaluate(() => { localStorage.setItem('rim.language', 'ur'); localStorage.setItem('rim.theme', 'dark'); });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.shop-product').last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/shop-urdu-dark-${info.project.name}.png` });
  if (isMobile) {
    await page.locator('.mobile-header-brand button').click();
    const menu = await page.getByRole('listbox').boundingBox();
    expect(menu.x).toBeGreaterThanOrEqual(0); expect(menu.x + menu.width).toBeLessThanOrEqual(page.viewportSize().width);
  }
});
