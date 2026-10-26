const { test, expect } = require('@playwright/test');

test('reports expose complete sales exports, daily closing and clearly scoped stock valuation', async ({ page, isMobile }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email address').fill('browser-admin@example.test');
  await page.getByLabel(/^Password/).fill('Browser-password-42');
  const settingsReady = page.waitForResponse(response => response.url().endsWith('/api/settings') && response.ok());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await settingsReady;
  if (isMobile) await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Reports', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Sales register', exact: true })).toBeVisible();
  await expect(page.getByText('Payment balances include later repayments. Gross profit excludes operating expenses.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export sales PDF', exact: true })).toBeEnabled();
  await page.screenshot({ path: `test-results/reports-sales-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (!isMobile) {
    const csv = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
    const csvFile = await csv;
    expect(csvFile.suggestedFilename()).toMatch(/^sales-.*\.csv$/);
    await csvFile.saveAs('test-results/sales-register.csv');
    const pdf = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export sales PDF', exact: true }).click();
    const pdfFile = await pdf;
    expect(pdfFile.suggestedFilename()).toMatch(/\.pdf$/);
    await pdfFile.saveAs('test-results/sales-register.pdf');
  }
  await page.getByText('Customer, product and payment filters', { exact: true }).click();
  await page.getByLabel('Customer search', { exact: true }).fill('No such report customer 008921');
  await expect(page.getByText('No sales match these filters', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Daily closing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Daily closing', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Balances by payment method', exact: true })).toBeVisible();
  await expect(page.getByText('Collections settle existing debt; they are not new sales. Gross profit excludes operating expenses.')).toBeVisible();
  await page.screenshot({ path: `test-results/reports-closing-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (!isMobile) {
    const pdf = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export closing PDF', exact: true }).click();
    const file = await pdf;
    await file.saveAs('test-results/daily-closing.pdf');
  }
  await page.getByRole('button', { name: 'Stock and movement', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export current stock PDF', exact: true })).toBeVisible();
  await expect(page.getByText('Stock values show the current position. The date range applies to sales and movement only.')).toBeVisible();
  if (!isMobile) {
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    const stockDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export current stock PDF', exact: true }).click();
    await (await stockDownload).saveAs('test-results/stock-valuation.pdf');
    await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Transactions', exact: true }).click();
    const receiptDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Receipt', exact: true }).first().click();
    await (await receiptDownload).saveAs('test-results/transaction-receipt.pdf');
    await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Reports', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Daily closing', exact: true }).click();
  await page.evaluate(() => localStorage.setItem('rim.theme', 'dark'));
  await page.reload();
  await page.getByRole('button', { name: 'Daily closing', exact: true }).click();
  await page.locator('.language-trigger').first().click();
  await page.getByRole('menuitem').filter({ hasText: 'اردو' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const ur = require('../src/i18n/reports.ur.json');
  await expect(page.getByRole('heading', { name: ur['Daily closing'], exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/reports-closing-urdu-dark-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
