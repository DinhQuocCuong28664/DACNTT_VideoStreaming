import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests of the web app against a running API (staging by default).
 *   E2E_BASE_URL     web app under test (default: the local dev server, started here)
 *   E2E_API_URL      API without /v1 (default: staging)
 *   E2E_ACCOUNTS     JSON file with { creator, viewer } test accounts (default: .local-notes)
 * Sign-in happens through the API in global setup, so passwords never appear in the tests.
 */
const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  globalSetup: './global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env['E2E_BASE_URL'] ? undefined : {
    command: 'npm run dev -w @zelos/web',
    cwd: '..',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
