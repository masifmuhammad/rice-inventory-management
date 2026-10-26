const { defineConfig } = require('@playwright/test');

// Public-page checks need only the frontend; no database or account is required.
// Run npm start first, or point LANDING_BASE_URL at a production preview.
module.exports = defineConfig({
  testDir: './e2e',
  testMatch: 'landing.spec.js',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.LANDING_BASE_URL || 'http://127.0.0.1:3000',
    browserName: 'chromium',
    channel: 'msedge',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'landing-desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'landing-tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'landing-phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'landing-desktop-motion', use: { viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' } },
    { name: 'landing-phone-motion', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' } },
  ],
});
