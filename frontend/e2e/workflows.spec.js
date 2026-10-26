const { test, expect } = require('@playwright/test');

const signIn = async (page, email = 'browser-admin@example.test') => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel(/^Password/).fill('Browser-password-42');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
};

test('sign-in is accessible, responsive and offers useful validation', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByLabel(/^Password/).fill('visible-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel(/^Password/)).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Email address')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/login-${testInfo.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('core pages load, product edits save, and direct routes survive refresh', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page);
  await page.goto('/products');
  await expect(page.getByText('Premium Basmati', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Edit Premium Basmati', exact: true }).filter({ visible: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Storage location').fill('Warehouse A');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Edit Premium Basmati', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Storage location')).toHaveValue('Warehouse A');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  for (const [path, title] of [['/transactions', 'Transactions'], ['/cash-book', 'Cash Book'], ['/reports', 'Sales register'], ['/settings', 'Settings']]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: title, exact: true }).first()).toBeVisible();
    await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.goto('/');
  await page.screenshot({ path: `test-results/dashboard-${testInfo.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('business switching clears the previous tenant, even if the new request fails', async ({ page }) => {
  await signIn(page);
  await page.goto('/products');
  await expect(page.getByText('Premium Basmati', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await page.route('**/api/products?*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary test outage' }) }));
  await page.getByRole('button', { name: /Active business:/ }).first().click();
  await page.getByRole('option', { name: /Second Test Mill/ }).click();
  await expect(page.getByText('Premium Basmati', { exact: true })).toHaveCount(0);
  await page.unroute('**/api/products?*');
  await page.reload();
  await expect(page.getByText('Second Mill Rice', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('Premium Basmati', { exact: true })).toHaveCount(0);
});

test('offline state is visible and clears when the connection returns', async ({ page, context }) => {
  await signIn(page);
  await context.setOffline(true);
  await expect(page.getByText('You’re offline', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('You’re offline', { exact: true })).toHaveCount(0);
});

test('worker routes enforce permissions in the interface', async ({ page }) => {
  await signIn(page, 'browser-worker@example.test');
  for (const path of ['/reports', '/cash-book', '/admin/users']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
  }
  await page.goto('/products');
  await expect(page.getByRole('button', { name: 'Add product', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit Premium Basmati', exact: true })).toHaveCount(0);
});

test('floating labels follow focus and values without losing their accessible name', async ({ page }) => {
  await page.goto('/login');
  const field = page.getByLabel('Email address');
  const label = field.locator('xpath=ancestor::label').locator('.field-shell-label');
  await field.fill('');
  await page.getByRole('heading', { name: 'Sign in', exact: true }).click();
  const resting = await label.boundingBox();
  await field.focus();
  await expect.poll(async () => (await label.boundingBox()).y).toBeLessThan(resting.y - 5);
  await field.fill('staff@example.test');
  await page.getByRole('heading', { name: 'Sign in', exact: true }).click();
  expect((await label.boundingBox()).y).toBeLessThan(resting.y - 5);
  await field.fill('');
  await page.getByRole('heading', { name: 'Sign in', exact: true }).click();
  await expect.poll(async () => (await label.boundingBox()).y).toBeCloseTo(resting.y, 0);
  expect(await field.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
  await field.focus();
  await field.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(field).toBeFocused();
});

test('home shortcuts select the correct movement and cash entry saves', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Record sale', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Type/ })).toContainText('Sale');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.goto('/');
  await page.getByRole('button', { name: 'Add delivery', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Type/ })).toContainText('Delivery');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.goto('/');
  await page.getByRole('button', { name: 'Money out', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount').fill('7.50');
  await dialog.getByLabel('Purpose').fill('Browser verification expense');
  const savedResponse = page.waitForResponse((response) => response.url().endsWith('/api/cash-book') && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Record money out', exact: true }).click();
  const saved = await savedResponse;
  expect(saved.status()).toBe(201);
  const entry = await saved.json();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Browser verification expense', { exact: true }).first()).toBeVisible();
  // Remove only this test's entry, using the same authenticated API as the UI.
  const token = await page.evaluate(() => localStorage.getItem('rim.token'));
  const removed = await page.request.delete('/api/cash-book/' + (entry.id || entry._id), { headers: { Authorization: 'Bearer ' + token } });
  expect(removed.ok()).toBe(true);
});

test('small-screen sheets keep focused inputs and keyboard navigation visible', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The virtual keyboard layout applies on phones.');
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    window.__testKeyboard = (height) => { viewport.height = height; viewport.dispatchEvent(new Event('resize')); };
  });
  await signIn(page);
  await page.getByRole('button', { name: 'Money out', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount').fill('1250');
  await page.evaluate(() => window.__testKeyboard(390));
  const bar = dialog.getByRole('toolbar', { name: 'Form controls' });
  await expect(bar).toBeVisible();
  await dialog.getByLabel('Purpose').focus();
  await expect(dialog.getByRole('button', { name: 'Previous field', exact: true })).toBeEnabled();
  const expectFocusedFieldVisible = async () => {
    await expect.poll(() => dialog.locator('[data-modal-body]').evaluate((body) => {
      const field = document.activeElement?.closest('.field-shell');
      if (!field || !body.contains(field)) return false;
      const pane = body.getBoundingClientRect(), box = field.getBoundingClientRect();
      return box.top >= pane.top && box.bottom <= pane.bottom;
    })).toBe(true);
  };
  await expectFocusedFieldVisible();
  await dialog.getByRole('button', { name: 'Previous field', exact: true }).click();
  await expect(dialog.getByLabel('Date', { exact: true })).toBeFocused();
  await expectFocusedFieldVisible();
  await dialog.getByRole('button', { name: 'Next field', exact: true }).click();
  await expect(dialog.getByLabel('Purpose')).toBeFocused();
  await expectFocusedFieldVisible();
  // On the last field the next arrow has grown into the form's own action,
  // and the sheet has no second footer competing for the space.
  await expect(bar.getByRole('button', { name: 'Record money out', exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Next field', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
  await page.evaluate(() => window.__testKeyboard(innerHeight));
  // Keyboard down: the bar is just the full-width action.
  await expect(bar.getByRole('button', { name: 'Previous field', exact: true })).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'Record money out', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
});

test('navigation preserves filters without reloading and long pages keep context in the header', async ({ page, isMobile }) => {
  await signIn(page);
  await page.evaluate(() => { window.__navigationSentinel = 'same-document'; });
  const openPage = async (name, mobileName) => {
    if (isMobile && mobileName) await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: mobileName, exact: true }).click();
    else {
      if (isMobile) await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
      await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name, exact: true }).filter({ visible: true }).first().click();
    }
  };
  await openPage('Stock', 'Stock');
  const stockSearch = page.locator('main').getByLabel('Search products', { exact: true });
  await stockSearch.fill('Basmati');
  await expect(stockSearch).toHaveValue('Basmati');
  await openPage('Dashboard', 'Home');
  await openPage('Stock', 'Stock');
  await expect(stockSearch).toHaveValue('Basmati');
  await openPage('Settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Business name')).toBeVisible();
  if (isMobile) {
    await expect.poll(async () => {
      await page.evaluate(() => window.scrollTo(0, 600));
      return page.getByTestId('compact-page-header').isVisible();
    }).toBe(true);
    await expect(page.getByTestId('compact-page-header')).toContainText('Settings');
    await expect(page.getByTestId('compact-page-header')).toContainText('Test Rice Mill');
  } else await page.evaluate(() => window.scrollTo(0, 600));
  expect(await page.evaluate(() => window.__navigationSentinel)).toBe('same-document');
});

test('responsive header summaries and optional assistant stay clear of content', async ({ page, isMobile }) => {
  await page.route('**/api/ai/status', (route) => route.fulfill({ json: { enabled: true } }));
  if (!isMobile) await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page);
  await page.evaluate(() => scrollTo(0, 200));
  const summary = page.getByTestId('compact-page-header');
  await expect(summary).toContainText('Stock');
  await expect(summary).toContainText('Funds');
  expect(await summary.locator('p').last().evaluate((node) => {
    const parent = node.getBoundingClientRect();
    return Array.from(node.children).every((child) => {
      const range = document.createRange(); range.selectNodeContents(child);
      const box = range.getBoundingClientRect();
      return box.left >= parent.left && box.right <= parent.right;
    });
  })).toBe(true);
  await page.goto('/settings');
  const assistant = page.getByRole('button', { name: 'Open AI assistant', exact: true });
  await expect(assistant).toBeVisible();
  if (!isMobile) {
    await expect(page.getByRole('searchbox', { name: 'Search products', exact: true })).toBeHidden();
    const save = await page.getByRole('button', { name: 'Save details', exact: true }).boundingBox();
    const trigger = await assistant.boundingBox();
    expect(save.x + save.width).toBeLessThan(trigger.x);
  }
});
