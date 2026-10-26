const { test, expect } = require('@playwright/test');

async function capture(page, path) {
  await page.evaluate(async () => { document.activeElement?.blur(); await document.fonts.ready; window.scrollTo(0, 0); });
  await page.waitForTimeout(300);
  const fullPage = await page.evaluate(() => document.documentElement.scrollHeight * devicePixelRatio < 32000);
  await page.screenshot({ path, fullPage, animations: 'disabled' });
}

async function signIn(page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('browser-admin@example.test');
  await page.getByLabel(/^Password/).fill('Browser-password-42');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}
async function makeFixture(page, mode = 'prepare') {
  const token = await page.evaluate(() => localStorage.getItem('rim.token'));
  const headers = { Authorization: `Bearer ${token}` };
  const productResponse = await page.request.post('/api/products', { headers, data: { name: `Barcode test ${Date.now()}`, category: 'Basmati', unit: 'kg', currentStock: 0, minStockLevel: 1, costPrice: 10, sellingPrice: 15 } });
  expect(productResponse.status()).toBe(201);
  const product = await productResponse.json();
  const response = await page.request.post('/api/barcodes/batches', { headers, data: { requestId: require('node:crypto').randomUUID(), product: product.id, quantity: 5, count: 2, mode } });
  expect(response.status()).toBe(201);
  return { ...(await response.json()), product, headers };
}
async function scan(page, code) {
  const field = page.getByLabel('Scan a bag or enter its barcode');
  await field.fill(code); await field.press('Enter');
}

test('home actions lead to stock and a complete label → receive → sell workflow', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack));
  await signIn(page);
  await expect(page.locator('a.inventory-action-stock')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await capture(page, `test-results/inventory-home-${info.project.name}.png`);
  await page.locator('a.inventory-action-stock').click();
  await expect(page.getByRole('heading', { name: 'Stock', exact: true }).filter({ visible: true })).toBeVisible();
  await capture(page, `test-results/rice-stock-${info.project.name}.png`);
  await page.getByRole('button', { name: 'Make labels', exact: true }).click();
  await page.getByRole('button', { name: /Rice product/ }).click();
  await page.getByRole('option', { name: /Premium Basmati/ }).click();
  await page.getByLabel('Quantity per bag (kg)').fill('5');
  await page.getByLabel('Number of bags / labels').fill('2');
  await page.getByRole('radio', { name: /Print first, receive later/ }).check();
  await page.getByRole('button', { name: 'Generate labels', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2 unique labels ready' })).toBeVisible();
  const first = await page.locator('.barcode-label-list button').first().getAttribute('aria-label');
  const code = first.match(/99\d{16}/)[0];
  const barcodeImage = await page.locator('.pack-label svg').screenshot();
  require('node:fs').writeFileSync(`test-results/barcode-photo-${info.project.name}.png`, barcodeImage);
  await capture(page, `test-results/barcode-labels-${info.project.name}.png`);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Print first label' }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole('button', { name: 'Print 1 label' })).toBeVisible();
  await expect(popup.locator('.code')).toHaveText(code);
  if (info.project.name === 'desktop') {
    await popup.pdf({ path: 'test-results/barcode-label-70x40.pdf', preferCSSPageSize: true });
    await popup.screenshot({ path: 'test-results/barcode-print-desktop.png', fullPage: true });
  }
  await popup.close();
  await page.getByRole('button', { name: 'Go to scanner' }).click();
  await page.getByRole('button', { name: 'Start stock in', exact: true }).click();
  await scan(page, code);
  await expect(page.getByText('Bag added to stock', { exact: true })).toBeVisible();
  await scan(page, code);
  await expect(page.getByRole('alert').filter({ hasText: 'already in stock' })).toBeVisible();
  await page.getByRole('button', { name: 'Stock out', exact: true }).click();
  await page.getByRole('button', { name: 'Start stock out', exact: true }).click();
  await scan(page, code);
  await expect(page.getByText('Bag sold · stock updated', { exact: true })).toBeVisible();
  await scan(page, code);
  await expect(page.getByRole('alert').filter({ hasText: 'already stocked out' })).toBeVisible();
  await page.getByRole('button', { name: 'Read label', exact: true }).click();
  await page.getByLabel('Barcode photo').setInputFiles({ name: 'pack.png', mimeType: 'image/png', buffer: barcodeImage });
  await expect(page.locator('.barcode-result')).toContainText('Stocked out');
  await expect(page.getByRole('heading', { name: 'Bag history' })).toBeVisible();
  await capture(page, `test-results/barcode-read-${info.project.name}.png`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('a lost acknowledgement survives reload and recovers without a second deduction', async ({ page }) => {
  await signIn(page);
  const fixture = await makeFixture(page, 'receive');
  const label = fixture.labels[0];
  await page.goto('/barcodes?mode=stock_out');
  await page.getByRole('button', { name: 'Start stock out', exact: true }).click();
  let intercepted = false;
  await page.route('**/api/barcodes/scan', async (route) => {
    if (!intercepted) { intercepted = true; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  await scan(page, label.code);
  await expect(page.getByRole('button', { name: 'Recover pending scans' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Recover pending scans' }).click();
  await expect(page.getByText('Previous scan confirmed', { exact: true })).toBeVisible();
  const product = await (await page.request.get(`/api/products/${fixture.product.id}`, { headers: fixture.headers })).json();
  expect(product.currentStock).toBe(5);
  const read = await (await page.request.get(`/api/barcodes/labels/${label.code}`, { headers: fixture.headers })).json();
  expect(read.history.filter((row) => row.type === 'stock_out')).toHaveLength(1);
});

test('rapid scanner input is queued and the camera fails clearly when permission is unavailable', async ({ page }, info) => {
  await signIn(page);
  const fixture = await makeFixture(page, 'receive');
  await page.goto('/barcodes');
  await page.getByRole('button', { name: 'Start stock out', exact: true }).click();
  await page.route('**/api/barcodes/scan', async (route) => { await new Promise((r) => setTimeout(r, 300)); await route.continue(); });
  const field = page.getByLabel('Scan a bag or enter its barcode');
  await field.fill(fixture.labels[0].code);
  await field.press('Shift+Tab');
  await expect(page.getByText('0 bags moved', { exact: true })).toBeVisible();
  await scan(page, fixture.labels[0].code);
  await scan(page, fixture.labels[1].code);
  await expect(page.getByText('2 bags moved', { exact: true })).toBeVisible();
  await capture(page, `test-results/barcode-scan-${info.project.name}.png`);
  const product = await (await page.request.get(`/api/products/${fixture.product.id}`, { headers: fixture.headers })).json();
  expect(product.currentStock).toBe(0);
  await page.getByRole('button', { name: 'Use camera', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close camera' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('camera reads a real Code 128 video frame and releases its stream', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Synthetic canvas camera is exercised in Chromium.');
  await signIn(page);
  const fixture = await makeFixture(page, 'receive');
  const encoded = {};
  require('jsbarcode')(encoded, fixture.labels[0].code, { format: 'CODE128C' });
  await page.addInitScript(({ pattern }) => {
    const canvas = document.createElement('canvas'); canvas.width = pattern.length * 4 + 120; canvas.height = 320;
    const paint = () => { const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#000'; for (let x = 0; x < pattern.length; x++) if (pattern[x] === '1') ctx.fillRect(60 + x * 4, 60, 4, 200); };
    paint(); setInterval(paint, 100);
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      const stream = canvas.captureStream(10); window.__cameraTestStream = stream; return stream;
    } });
  }, { pattern: encoded.encodings[0].data });
  await page.goto('/barcodes');
  await page.getByRole('button', { name: 'Read label', exact: true }).click();
  await page.getByRole('button', { name: 'Use camera', exact: true }).click();
  await expect(page.locator('.pack-label-code')).toHaveText(fixture.labels[0].code);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.__cameraTestStream.getTracks().every((track) => track.readyState === 'ended'))).toBe(true);
});

test('scan and label screens stay readable in dark mode and on tablet widths', async ({ page, isMobile }, info) => {
  await signIn(page);
  const fixture = await makeFixture(page);
  await page.evaluate(() => localStorage.setItem('rim.theme', 'dark'));
  await page.goto('/barcodes');
  await expect(page.locator('html')).toHaveClass(/dark/);
  if (isMobile) {
    await page.evaluate(() => scrollTo(0, 0));
    const start = await page.getByRole('button', { name: 'Start stock out', exact: true }).boundingBox();
    const dock = await page.getByRole('navigation', { name: 'Primary', exact: true }).boundingBox();
    expect(start.y + start.height).toBeLessThanOrEqual(dock.y);
    await capture(page, `test-results/barcode-start-${info.project.name}.png`);
  }
  await page.getByRole('button', { name: 'Start stock out', exact: true }).click();
  await capture(page, `test-results/barcode-dark-${info.project.name}.png`);
  if (isMobile) {
    const camera = await page.getByRole('button', { name: 'Use camera', exact: true }).boundingBox();
    const dock = await page.getByRole('navigation', { name: 'Primary', exact: true }).boundingBox();
    expect(camera.y + camera.height).toBeLessThanOrEqual(dock.y);
  }
  await page.goto(`/barcodes?tab=labels&product=${fixture.product.id}`);
  await expect(page.locator('.pack-label')).toContainText(fixture.product.name);
  await capture(page, `test-results/barcode-form-dark-${info.project.name}.png`);
  expect(await page.locator('.barcode-studio-form').evaluate((form) => {
    const box = form.getBoundingClientRect();
    return Array.from(form.querySelectorAll('fieldset,.field-shell,.barcode-receive-option')).every((node) => node.getBoundingClientRect().right <= box.right - 10);
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (info.project.name === 'desktop') {
    await page.setViewportSize({ width: 1024, height: 900 });
    await capture(page, 'test-results/barcode-tablet.png');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('release accidental labels preserves stock and unlocks manual sales', async ({ page }, info) => {
  await signIn(page);
  const fixture = await makeFixture(page, 'receive');
  const releaseUrl = `/api/barcodes/batches/${fixture.id}/release`;
  await page.goto('/barcodes?tab=labels');
  await page.getByLabel('Find a batch, rice name or barcode').fill(fixture.product.name);
  await page.locator('.barcode-batch-list li').filter({ hasText: fixture.product.name }).getByRole('button', { name: 'View labels', exact: true }).click();
  await page.getByRole('button', { name: 'Release labels', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Keep labels', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm release', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Labels released.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Release labels', exact: true })).toHaveCount(0);
  await capture(page, `test-results/label-release-${info.project.name}.png`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const product = await (await page.request.get(`/api/products/${fixture.product.id}`, { headers: fixture.headers })).json();
  expect(product.currentStock).toBe(10);
  const retry = await page.request.post(releaseUrl, { headers: fixture.headers });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).releasedCount).toBe(0);
  const scanResponse = await page.request.post('/api/barcodes/scan', { headers: fixture.headers, data: { requestId: require('node:crypto').randomUUID(), code: fixture.labels[0].code, mode: 'stock_out' } });
  expect(scanResponse.status()).toBe(409);
  const sale = await page.request.post('/api/transactions', { headers: fixture.headers, data: { product: fixture.product.id, type: 'stock_out', quantity: 10 } });
  expect(sale.status()).toBe(201);
  expect((await sale.json()).stockAfter).toBe(0);
});
