const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5055',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: process.env.E2E_BROWSER_PATH ? { executablePath: process.env.E2E_BROWSER_PATH } : {} } },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    { name: 'small-iphone', use: { ...devices['iPhone 13'], browserName: 'webkit', viewport: { width: 375, height: 667 } } },
  ],
  webServer: {
    command: 'node ../backend/test/browser-server.js',
    url: 'http://127.0.0.1:5055/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
