const { test, expect } = require('@playwright/test');

test('adding the first supplier returns directly to the delivery form on Home', async ({ page }) => {
  let supplierCreated = false;
  await page.route('**/api/suppliers', async (route) => {
    if (route.request().method() === 'POST') { supplierCreated = true; await route.continue(); }
    else if (!supplierCreated) await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suppliers: [] }) });
    else await route.continue();
  });
  await page.goto('/login');
  await page.getByLabel('Email address').fill('browser-admin@example.test');
  await page.getByLabel(/^Password/).fill('Browser-password-42');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: 'Add delivery', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add supplier', exact: true }).click();
  const name = `First delivery supplier ${Date.now()}`;
  await page.getByRole('dialog').getByLabel('Supplier name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Add supplier', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Receive a purchase', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Supplier/ })).toContainText(name);
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
});
