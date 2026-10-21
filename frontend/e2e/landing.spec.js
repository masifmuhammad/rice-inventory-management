const { test, expect } = require('@playwright/test');

const wide = page => page.viewportSize().width >= 900;
const captionOpacity = (page, heading) => page.locator('.k-caption').filter({ has: page.getByRole('heading', { name: heading }) }).evaluate(el => Number(getComputedStyle(el).opacity));

test('public page loads its imagery without overflow or runtime errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('/welcome');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('From the field to your dastarkhwan.');
  await expect(page).toHaveTitle('999 Rice Company — from the field to your dastarkhwan');
  for (const image of await page.locator('main img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('the journey tells one chapter at a time, from field to table', async ({ page }) => {
  await page.goto('/welcome');
  const story = page.locator('#safar');
  const scrollTo = share => story.evaluate((el, share) => window.scrollTo(0, el.offsetTop + share * (el.offsetHeight - innerHeight)), share);
  await scrollTo(0.02);
  await expect.poll(() => captionOpacity(page, 'It starts in the paddy.')).toBe(1);
  await scrollTo(0.5);
  await expect.poll(() => captionOpacity(page, 'Husked, polished, sorted.')).toBe(1);
  expect(await captionOpacity(page, 'It starts in the paddy.')).toBe(0);
  await scrollTo(1);
  await expect.poll(() => captionOpacity(page, 'And onto your dastarkhwan.')).toBe(1);
  await expect.poll(() => page.locator('.k-end').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
});

test('the chapters tray jumps to a chapter and closes', async ({ page }) => {
  await page.goto('/welcome');
  const toggle = page.locator('button[aria-controls="k-tray"][aria-label="Chapters of the journey"]:visible');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.k-rail').getByRole('button', { name: /The mill/ }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => captionOpacity(page, 'Husked, polished, sorted.')).toBe(1);
});

test('every rice is shown with its dish and use', async ({ page }) => {
  await page.goto('/welcome#rice');
  for (const [name, best] of [['Basmati', 'Biryani and pulao'], ['Sella', 'Deghs and large gatherings'], ['Steam', 'Daal chawal and daily meals']]) {
    const item = page.locator('.k-rices li').filter({ has: page.getByRole('heading', { name: new RegExp(`^${name}`) }) });
    await expect(item.getByRole('img')).toBeVisible();
    await expect(item).toContainText(best);
  }
});

test('section links move along the page', async ({ page }) => {
  test.skip(!wide(page), 'Section links live in the menu tray below 900px.');
  await page.goto('/welcome');
  await page.getByRole('navigation', { name: 'Page sections' }).getByRole('link', { name: 'Rice', exact: true }).click();
  await expect(page).toHaveURL(/#rice$/);
  await expect(page.getByRole('heading', { name: 'Three rices, each for its dish.' })).toBeInViewport();
});

test('header and bottom inventory buttons reach the existing sign-in screen', async ({ page }) => {
  await page.goto('/welcome');
  if (wide(page)) {
    await page.locator('.k-inventory-small').click();
  } else {
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('link', { name: 'Inventory software', exact: true }).first().click();
  }
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.classList.contains('rice-public-page'))).toBe(false);
  await page.goto('/welcome');
  await page.getByRole('link', { name: 'Use the inventory software', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Email address')).toBeVisible();
});

test('the footer motto reveals its translation on hover or tap', async ({ page }) => {
  await page.goto('/welcome');
  const motto = page.getByRole('button', { name: 'دیکھ مگر پیار سے' });
  const translation = page.locator('#k-motto-tr');
  await motto.scrollIntoViewIfNeeded();
  await expect.poll(() => translation.evaluate(el => Number(getComputedStyle(el).opacity))).toBe(0);
  await motto.click();
  await expect(motto).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => translation.evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
});
